-- Every script with its deployments. Handy before a release or when tracing which
-- deployment is actually running.
SELECT s.scriptid,
       s.name,
       BUILTIN.DF(s.scripttype) AS script_type,
       d.scriptid               AS deployment,
       BUILTIN.DF(d.status)     AS status,
       d.isdeployed
  FROM script s
  JOIN scriptdeployment d ON d.script = s.id
 ORDER BY s.scriptid, d.scriptid;


-- Field changes recorded in system notes over the last 24 hours.
-- Useful when "something changed overnight" and nobody knows what.
SELECT sn.date,
       BUILTIN.DF(sn.name)    AS changed_by,
       BUILTIN.DF(sn.context) AS context,
       sn.recordtypeid,
       sn.recordid,
       sn.field,
       sn.oldvalue,
       sn.newvalue
  FROM systemnote sn
 WHERE sn.date >= SYSDATE - 1
 ORDER BY sn.date DESC
 FETCH FIRST 500 ROWS ONLY;
