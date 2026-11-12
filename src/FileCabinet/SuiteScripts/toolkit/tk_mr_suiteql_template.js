/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Map/Reduce template driven by SuiteQL.
 *
 * Worked example: find active customers with no transactions in the last N years and mark
 * them inactive. It starts in dry-run mode, so a first run only logs what it would change.
 *
 * Script parameters (see src/Objects/customscript_tk_mr_suiteql.xml):
 *   custscript_tk_mr_years    integer, how many years without activity (default 3)
 *   custscript_tk_mr_dry_run  checkbox, log only when checked (default checked)
 *
 * Copy this file, replace the query and the work done in reduce(), and keep the summarize()
 * stage as it is: it is what tells you which records failed and why.
 */
define(['N/record', 'N/runtime', 'N/log'], (record, runtime, log) => {

    function settings() {
        const script = runtime.getCurrentScript();
        const years = parseInt(script.getParameter({ name: 'custscript_tk_mr_years' }), 10);
        const dryRun = script.getParameter({ name: 'custscript_tk_mr_dry_run' });
        return {
            years: Number.isInteger(years) && years > 0 ? years : 3,
            // Live only when the box is explicitly unchecked; anything else stays a dry run.
            dryRun: !(dryRun === false || dryRun === 'F')
        };
    }

    /**
     * Returning a SuiteQL object lets NetSuite page through the results itself, so there is
     * no 4,000 or 5,000 row ceiling here.
     */
    function getInputData() {
        const { years } = settings();
        const months = -12 * years;

        return {
            type: 'suiteql',
            query: `
                SELECT c.id, c.entityid
                  FROM customer c
                 WHERE c.isinactive = 'F'
                   AND c.datecreated < ADD_MONTHS(SYSDATE, ?)
                   AND NOT EXISTS (
                         SELECT 1
                           FROM transaction t
                          WHERE t.entity = c.id
                            AND t.trandate >= ADD_MONTHS(SYSDATE, ?)
                       )`,
            params: [months, months]
        };
    }

    /**
     * With a SuiteQL input each value is JSON shaped like
     *   { "types": ["INTEGER", "VARCHAR"], "values": [123, "CUST-0042"] }
     * in the column order of the SELECT.
     */
    function map(context) {
        const row = JSON.parse(context.value);
        const [id, entityId] = row.values;
        context.write({ key: String(id), value: entityId });
    }

    /**
     * One customer per reduce call. Each call gets its own governance, and a failure here
     * is recorded against this key without stopping the others.
     */
    function reduce(context) {
        const { dryRun } = settings();
        const customerId = context.key;
        const entityId = context.values[0];

        if (dryRun) {
            log.audit('Dry run', `Would inactivate customer ${entityId} (id ${customerId})`);
            context.write({ key: 'would_change', value: customerId });
            return;
        }

        record.submitFields({
            type: record.Type.CUSTOMER,
            id: customerId,
            values: { isinactive: true },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
        context.write({ key: 'changed', value: customerId });
    }

    function summarize(summary) {
        if (summary.inputSummary.error) {
            log.error('Input stage failed', summary.inputSummary.error);
        }

        logStageErrors('map', summary.mapSummary);
        logStageErrors('reduce', summary.reduceSummary);

        const totals = {};
        summary.output.iterator().each((key) => {
            totals[key] = (totals[key] || 0) + 1;
            return true;
        });

        log.audit('Finished', {
            dryRun: settings().dryRun,
            totals,
            seconds: summary.seconds,
            usage: summary.usage,
            yields: summary.yields
        });
    }

    function logStageErrors(stage, stageSummary) {
        let count = 0;
        stageSummary.errors.iterator().each((key, error) => {
            count++;
            const parsed = safeParse(error);
            log.error(`${stage} failed for key ${key}`, parsed.message || error);
            return true;
        });
        if (count) {
            log.error(`${stage} errors`, `${count} key(s) failed`);
        }
    }

    function safeParse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return { message: text };
        }
    }

    return { getInputData, map, reduce, summarize };
});
