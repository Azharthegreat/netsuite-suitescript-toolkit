# SuiteQL queries

Copy-paste queries for reporting and support work. Run them from a script with
`N/query.runSuiteQL`, the `tk_suiteql` library in this repo, the REST endpoint
(`/services/rest/query/v1/suiteql`) or the Node client in `integrations/oauth2-m2m-node`.

`?` marks a bind parameter. In SuiteScript, pass the values in `params`. The REST endpoint
doesn't accept bind parameters, so validate and escape any value you put in the string there.

Which tables and fields you can query depends on the features enabled in the account and on the
role you run as. If a query fails with an unknown field, look the record up in
**Setup > Records Catalog**.

| File | Answers |
| --- | --- |
| [sales.sql](sales.sql) | Top customers by sales, the item lines of one transaction, sales by month |
| [receivables.sql](receivables.sql) | Overdue invoices with days overdue, ageing buckets |
| [inventory.sql](inventory.sql) | On-hand and available quantity per item and location |
| [admin.sql](admin.sql) | Script deployments, recent field changes from system notes |
