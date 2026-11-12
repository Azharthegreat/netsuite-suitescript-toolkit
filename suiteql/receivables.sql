-- Open invoices past their due date, oldest first.
SELECT t.tranid,
       BUILTIN.DF(t.entity)           AS customer,
       t.trandate,
       t.duedate,
       TRUNC(SYSDATE) - t.duedate     AS days_overdue,
       t.foreignamountremaining       AS amount_remaining,
       BUILTIN.DF(t.currency)         AS currency
  FROM transaction t
 WHERE t.type = 'CustInvc'
   AND t.foreignamountremaining > 0
   AND t.duedate < TRUNC(SYSDATE)
 ORDER BY t.duedate;


-- Ageing buckets per customer for open invoices.
SELECT BUILTIN.DF(t.entity) AS customer,
       SUM(CASE WHEN t.duedate >= TRUNC(SYSDATE)                      THEN t.foreignamountremaining ELSE 0 END) AS current_amount,
       SUM(CASE WHEN TRUNC(SYSDATE) - t.duedate BETWEEN 1  AND 30     THEN t.foreignamountremaining ELSE 0 END) AS days_1_30,
       SUM(CASE WHEN TRUNC(SYSDATE) - t.duedate BETWEEN 31 AND 60     THEN t.foreignamountremaining ELSE 0 END) AS days_31_60,
       SUM(CASE WHEN TRUNC(SYSDATE) - t.duedate BETWEEN 61 AND 90     THEN t.foreignamountremaining ELSE 0 END) AS days_61_90,
       SUM(CASE WHEN TRUNC(SYSDATE) - t.duedate > 90                  THEN t.foreignamountremaining ELSE 0 END) AS over_90
  FROM transaction t
 WHERE t.type = 'CustInvc'
   AND t.foreignamountremaining > 0
 GROUP BY BUILTIN.DF(t.entity)
 ORDER BY over_90 DESC;
