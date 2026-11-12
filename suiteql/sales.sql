-- Top 25 customers by sales order value over the last 12 months.
-- foreigntotal is in each transaction's own currency. In a multi-currency account, convert
-- before comparing, or group by currency as well.
SELECT BUILTIN.DF(t.entity)   AS customer,
       BUILTIN.DF(t.currency) AS currency,
       COUNT(*)               AS orders,
       SUM(t.foreigntotal)    AS total
  FROM transaction t
 WHERE t.type = 'SalesOrd'
   AND t.trandate >= ADD_MONTHS(TRUNC(SYSDATE), -12)
 GROUP BY BUILTIN.DF(t.entity), BUILTIN.DF(t.currency)
 ORDER BY total DESC
 FETCH FIRST 25 ROWS ONLY;


-- Item lines of one transaction (param: transaction internal id).
-- mainline = 'F' drops the header line and taxline = 'F' drops tax lines.
-- On sales transactions, quantity and netamount are usually stored as negatives.
SELECT tl.linesequencenumber      AS line,
       BUILTIN.DF(tl.item)        AS item,
       tl.quantity,
       tl.rate,
       tl.netamount,
       BUILTIN.DF(tl.location)    AS location
  FROM transactionline tl
 WHERE tl.transaction = ?
   AND tl.mainline = 'F'
   AND tl.taxline = 'F'
 ORDER BY tl.linesequencenumber;


-- Sales orders per month for the current year.
SELECT TO_CHAR(t.trandate, 'YYYY-MM') AS month,
       COUNT(*)                       AS orders,
       SUM(t.foreigntotal)            AS total
  FROM transaction t
 WHERE t.type = 'SalesOrd'
   AND t.trandate >= TRUNC(SYSDATE, 'YEAR')
 GROUP BY TO_CHAR(t.trandate, 'YYYY-MM')
 ORDER BY month;
