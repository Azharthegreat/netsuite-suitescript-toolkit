'use strict';

/**
 * Minimal NetSuite REST client using OAuth 2.0 client credentials (machine to machine).
 *
 * The flow:
 *   1. Sign a short-lived JWT with your private key (PS256). Its `kid` is the certificate ID
 *      NetSuite gave you when you uploaded the public certificate.
 *   2. Exchange it at the token endpoint for an access token (valid for 60 minutes).
 *   3. Call REST web services or RESTlets with `Authorization: Bearer <token>`.
 *
 * No dependencies: Node 18+ for global fetch and built-in crypto.
 */

const crypto = require('crypto');

const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const TOKEN_LIFETIME_SECONDS = 3600; // NetSuite caps the assertion at 60 minutes
const REFRESH_MARGIN_MS = 60 * 1000;

class NetSuiteClient {
    /**
     * @param {object} options
     * @param {string} options.accountId      e.g. "1234567" or "1234567_SB1"
     * @param {string} options.clientId       integration record consumer key / client ID
     * @param {string} options.certificateId  from the OAuth 2.0 Client Credentials (M2M) Setup page
     * @param {string} options.privateKeyPem  PEM text of the private key matching the certificate
     * @param {string[]} [options.scopes]     defaults to rest_webservices and restlets
     */
    constructor({ accountId, clientId, certificateId, privateKeyPem, scopes }) {
        for (const [name, value] of Object.entries({ accountId, clientId, certificateId, privateKeyPem })) {
            if (!value) throw new Error(`NetSuiteClient: ${name} is required`);
        }
        this.clientId = clientId;
        this.certificateId = certificateId;
        this.privateKey = crypto.createPrivateKey(privateKeyPem);
        this.scopes = scopes || ['rest_webservices', 'restlets'];

        // Sandbox IDs like 1234567_SB1 become 1234567-sb1 in host names.
        const host = accountId.trim().toLowerCase().replace(/_/g, '-');
        this.baseUrl = `https://${host}.suitetalk.api.netsuite.com`;
        this.tokenUrl = `${this.baseUrl}/services/rest/auth/oauth2/v1/token`;

        this._token = null;
        this._tokenExpiresAt = 0;
    }

    _assertion() {
        const now = Math.floor(Date.now() / 1000);
        const header = { typ: 'JWT', alg: 'PS256', kid: this.certificateId };
        const payload = {
            iss: this.clientId,
            scope: this.scopes,
            aud: this.tokenUrl,
            iat: now,
            exp: now + TOKEN_LIFETIME_SECONDS
        };
        const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
        const signature = crypto.sign('sha256', Buffer.from(signingInput), {
            key: this.privateKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        });
        return `${signingInput}.${b64url(signature)}`;
    }

    /** Returns a cached access token, fetching a new one shortly before it expires. */
    async token() {
        if (this._token && Date.now() < this._tokenExpiresAt - REFRESH_MARGIN_MS) {
            return this._token;
        }
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_assertion_type: ASSERTION_TYPE,
            client_assertion: this._assertion()
        });
        const res = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const json = await readJson(res);
        if (!res.ok || !json.access_token) {
            // The error body never contains the token or key, so it is safe to surface.
            throw new Error(`Token request failed (${res.status}): ${json.error || ''} ${json.error_description || ''}`.trim());
        }
        this._token = json.access_token;
        this._tokenExpiresAt = Date.now() + (Number(json.expires_in) || TOKEN_LIFETIME_SECONDS) * 1000;
        return this._token;
    }

    /** Authenticated request against a path under the account's REST host. */
    async request(method, path, { body, headers } = {}) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${await this.token()}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const json = await readJson(res);
        if (!res.ok) {
            const detail = json['o:errorDetails'] ? json['o:errorDetails'].map((d) => d.detail).join('; ') : json.title;
            throw new Error(`${method} ${path} failed (${res.status}): ${detail || 'no detail'}`);
        }
        return json;
    }

    /**
     * Runs a SuiteQL query and follows `hasMore` until every row is read.
     * The REST endpoint does not take bind parameters: never interpolate untrusted input.
     *
     * @param {string} q
     * @param {object} [options]
     * @param {number} [options.pageSize=1000] the endpoint allows up to 1000
     * @param {number} [options.maxRows=Infinity]
     */
    async suiteql(q, { pageSize = 1000, maxRows = Infinity } = {}) {
        const rows = [];
        let offset = 0;
        for (;;) {
            const page = await this.request('POST', `/services/rest/query/v1/suiteql?limit=${pageSize}&offset=${offset}`, {
                body: { q },
                headers: { Prefer: 'transient' }
            });
            for (const item of page.items || []) {
                delete item.links;
                rows.push(item);
                if (rows.length >= maxRows) return rows;
            }
            if (!page.hasMore) return rows;
            offset += pageSize;
        }
    }

    /** Calls a RESTlet by script and deployment ID. */
    async restlet(script, deploy, { method = 'GET', query = {}, body } = {}) {
        const params = new URLSearchParams({ script: String(script), deploy: String(deploy), ...query });
        const host = this.baseUrl.replace('.suitetalk.api.', '.restlets.api.');
        const res = await fetch(`${host}/app/site/hosting/restlet.nl?${params}`, {
            method,
            headers: {
                Authorization: `Bearer ${await this.token()}`,
                'Content-Type': 'application/json'
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const json = await readJson(res);
        if (!res.ok) throw new Error(`RESTlet ${script}/${deploy} failed (${res.status})`);
        return json;
    }
}

function b64url(input) {
    return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function readJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { title: text.slice(0, 300) };
    }
}

module.exports = { NetSuiteClient };
