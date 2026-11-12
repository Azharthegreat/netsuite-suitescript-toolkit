#!/usr/bin/env node
'use strict';

/**
 * Usage:
 *   cp .env.example .env      # then fill in your own values
 *   node index.js "SELECT id, entityid FROM customer FETCH FIRST 5 ROWS ONLY"
 */

const fs = require('fs');
const path = require('path');
const { NetSuiteClient } = require('./netsuite-client');

loadDotEnv(path.join(__dirname, '.env'));

async function main() {
    const q = process.argv.slice(2).join(' ').trim();
    if (!q) {
        console.error('Pass a SuiteQL query, e.g. node index.js "SELECT id FROM customer FETCH FIRST 5 ROWS ONLY"');
        process.exit(2);
    }

    const keyPath = process.env.NS_PRIVATE_KEY_PATH;
    if (!keyPath || !fs.existsSync(keyPath)) {
        console.error('NS_PRIVATE_KEY_PATH must point to your private key file. See README.md.');
        process.exit(2);
    }

    const client = new NetSuiteClient({
        accountId: process.env.NS_ACCOUNT_ID,
        clientId: process.env.NS_CLIENT_ID,
        certificateId: process.env.NS_CERTIFICATE_ID,
        privateKeyPem: fs.readFileSync(keyPath, 'utf8')
    });

    const rows = await client.suiteql(q, { maxRows: Number(process.env.NS_MAX_ROWS) || 5000 });
    console.log(JSON.stringify(rows, null, 2));
    console.error(`${rows.length} row(s)`);
}

/** Tiny .env reader so the sample has no dependencies. Existing env vars win. */
function loadDotEnv(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (!match || line.trim().startsWith('#')) continue;
        const [, key, raw] = match;
        if (process.env[key] === undefined) {
            process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
        }
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
