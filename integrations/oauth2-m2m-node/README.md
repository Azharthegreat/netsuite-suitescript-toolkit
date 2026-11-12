# NetSuite OAuth 2.0 M2M client (Node.js)

A dependency-free client for NetSuite's OAuth 2.0 **client credentials** flow, the one meant
for server-to-server integrations where no user signs in. It signs a JWT with your private key,
swaps it for an access token, caches the token and refreshes it before expiry. On top of that
it can run SuiteQL with automatic paging and call RESTlets.

Requires Node.js 18 or later.

## One-time setup in NetSuite

1. **Create a key pair** on your machine. The private key never leaves it.

   ```bash
   mkdir -p keys
   openssl req -x509 -newkey rsa:3072 -nodes -days 365 \
     -keyout keys/private.pem -out keys/public.pem -subj "/CN=netsuite-m2m"
   ```

2. **Integration record**: Setup > Integration > Manage Integrations > New. Tick
   *Client Credentials (Machine to Machine) Grant* and the scopes you need (REST Web Services,
   RESTlets). Untick Token-Based Authentication if you don't use it. Copy the client ID shown
   after saving.

3. **Map the certificate**: Setup > Integration > OAuth 2.0 Client Credentials (M2M) Setup >
   Create New. Pick the entity, role and integration, then upload `keys/public.pem`. Copy the
   **Certificate ID**.

4. Give the role only the permissions the integration needs, plus *Log in using OAuth 2.0
   Access Tokens* and *REST Web Services*.

## Run it

```bash
cp .env.example .env    # fill in your account ID, client ID and certificate ID
node index.js "SELECT id, entityid, email FROM customer FETCH FIRST 5 ROWS ONLY"
```

## Use it in your own code

```javascript
const fs = require('fs');
const { NetSuiteClient } = require('./netsuite-client');

const ns = new NetSuiteClient({
    accountId: process.env.NS_ACCOUNT_ID,
    clientId: process.env.NS_CLIENT_ID,
    certificateId: process.env.NS_CERTIFICATE_ID,
    privateKeyPem: fs.readFileSync(process.env.NS_PRIVATE_KEY_PATH, 'utf8')
});

const customers = await ns.suiteql('SELECT id, entityid FROM customer WHERE isinactive = \'F\'');
const order = await ns.request('GET', '/services/rest/record/v1/salesOrder/123');
const reply = await ns.restlet('customscript_tk_restlet', 'customdeploy_tk_restlet', { query: { id: '42' } });
```

## Things that trip people up

- **Sandbox account IDs** such as `1234567_SB1` turn into `1234567-sb1` in host names. The
  client handles that for you.
- **Certificates expire.** NetSuite rejects tokens once the uploaded certificate passes its end
  date, so put the renewal in a calendar.
- **`invalid_request` from the token endpoint** usually means the certificate ID (`kid`), the
  client ID (`iss`) or the clock is wrong. The JWT is only valid for a short window, so a machine
  clock that's several minutes off will fail.
- **The SuiteQL REST endpoint has no bind parameters.** Never build a query from user input
  without validating it first.

## Keep secrets out of git

`.env`, `*.pem` and `*.key` are in `.gitignore`. Keep the private key outside the repo folder,
or in `keys/`, which only ever holds ignored files.
