# NetSuite SuiteScript & SuiteQL Toolkit

Reusable SuiteScript 2.1 building blocks, SuiteQL queries and an OAuth 2.0 machine-to-machine
integration sample for Oracle NetSuite. It's packaged as an SDF account customization project,
so you can deploy the scripts straight into a sandbox.

Everything here is generic and written from scratch. It holds no customer code, account IDs or
credentials.

## What's inside

| Path | What it is |
| --- | --- |
| `src/FileCabinet/SuiteScripts/toolkit/lib/tk_suiteql.js` | Small library around `N/query`: run SuiteQL with bind parameters, page through every row past the 5,000 limit, and get one row or one value. |
| `src/FileCabinet/SuiteScripts/toolkit/tk_mr_suiteql_template.js` | Map/Reduce template that takes its input straight from SuiteQL, groups work in `map`, updates records in `reduce` and reports every error in `summarize`. |
| `src/FileCabinet/SuiteScripts/toolkit/tk_restlet_template.js` | RESTlet template with input validation, a consistent JSON envelope and safe error handling. |
| `src/Objects/` | SDF script and deployment records for the two scripts above. |
| `suiteql/` | Ready-to-run SuiteQL queries for common reporting and support questions. |
| `integrations/oauth2-m2m-node/` | Node.js client for NetSuite's OAuth 2.0 client credentials (M2M) flow. Calls the SuiteQL REST endpoint with no external dependencies. |

## Deploy with SDF

You need the [SuiteCloud CLI](https://www.npmjs.com/package/@oracle/suitecloud-cli) and a
sandbox account with SuiteCloud Development Framework enabled.

```bash
npm install -g @oracle/suitecloud-cli
suitecloud account:setup          # authenticate against your sandbox
suitecloud project:validate       # local checks
suitecloud project:deploy
```

Both deployments arrive in **Testing** status, so they only run for the owner until you
release them.

## Using the SuiteQL library

```javascript
/**
 * @NApiVersion 2.1
 */
define(['./lib/tk_suiteql'], (sql) => {
    // Every sales order for one customer since a date, however many there are
    const rows = sql.all(
        `SELECT id, tranid, trandate, BUILTIN.DF(status) AS status, foreigntotal
           FROM transaction
          WHERE type = 'SalesOrd'
            AND entity = ?
            AND trandate >= TO_DATE(?, 'YYYY-MM-DD')
          ORDER BY trandate DESC`,
        [customerId, '2026-01-01']
    );

    const count = sql.value('SELECT COUNT(*) FROM customer WHERE isinactive = ?', ['F']);
});
```

Always pass values through the `params` array instead of building them into the string. That
keeps the query safe from injection and lets NetSuite cache the plan.

## A few SuiteQL habits that save time

- `BUILTIN.DF(field)` returns the display text of a list or record field, so you don't need a
  join just to show a name.
- `transactionline.mainline = 'T'` is the header line. Filter `mainline = 'F'` together with
  `taxline = 'F'` to get item lines only.
- Amounts on transaction lines are stored with the sign of the posting. Sales lines are often
  negative, so check `netamount` before summing.
- The Records Catalog (Setup > Records Catalog) shows the real table and field names your role
  can query. It's the fastest way to find a field ID.

## License

MIT. See [LICENSE](LICENSE).
