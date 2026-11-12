/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Small helpers around N/query for running SuiteQL.
 *
 *   all(query, params)     every row as plain objects, paging past the 5,000-row limit
 *   each(query, params, fn) streams rows to a callback one page at a time
 *   first(query, params)   the first row or null
 *   value(query, params)   the first column of the first row or null
 *
 * Always pass user input through `params`. Values bound with `?` are never parsed as SQL.
 */
define(['N/query', 'N/runtime'], (query, runtime) => {

    const PAGE_SIZE = 1000; // the largest page runSuiteQLPaged accepts
    const GOVERNANCE_FLOOR = 200; // stop early instead of hitting the script usage limit

    /**
     * @param {string} sql
     * @param {Array<string|number|boolean>} [params]
     * @returns {Object[]} rows keyed by column alias (lower case)
     */
    function all(sql, params) {
        const rows = [];
        each(sql, params, (row) => { rows.push(row); });
        return rows;
    }

    /**
     * Streams every row to `fn`. Return `false` from `fn` to stop early.
     * Throws TK_GOVERNANCE_LOW before the script runs out of usage units, so the
     * caller can reschedule instead of dying half way through.
     *
     * @param {string} sql
     * @param {Array<string|number|boolean>} params
     * @param {function(Object, number):(boolean|void)} fn receives the row and its index
     * @returns {number} rows visited
     */
    function each(sql, params, fn) {
        const paged = query.runSuiteQLPaged({
            query: sql,
            params: params || [],
            pageSize: PAGE_SIZE
        });

        let index = 0;
        for (const range of paged.pageRanges) {
            guardGovernance();
            const page = paged.fetch({ index: range.index });
            for (const row of page.data.asMappedResults()) {
                if (fn(row, index++) === false) {
                    return index;
                }
            }
        }
        return index;
    }

    /**
     * @returns {Object|null}
     */
    function first(sql, params) {
        const rows = query.runSuiteQL({ query: sql, params: params || [] }).asMappedResults();
        return rows.length ? rows[0] : null;
    }

    /**
     * @returns {*} the first column of the first row, or null when there are no rows
     */
    function value(sql, params) {
        const results = query.runSuiteQL({ query: sql, params: params || [] }).results;
        if (!results.length || !results[0].values.length) {
            return null;
        }
        return results[0].values[0];
    }

    /**
     * Builds "?, ?, ?" for an IN list, because a single ? cannot bind an array.
     *
     *   sql.all(`SELECT id FROM item WHERE id IN (${sql.placeholders(ids)})`, ids)
     *
     * @param {Array} list
     * @returns {string}
     */
    function placeholders(list) {
        if (!Array.isArray(list) || list.length === 0) {
            throw error('TK_EMPTY_IN_LIST', 'An IN list needs at least one value.');
        }
        return list.map(() => '?').join(', ');
    }

    function guardGovernance() {
        const remaining = runtime.getCurrentScript().getRemainingUsage();
        if (remaining < GOVERNANCE_FLOOR) {
            throw error('TK_GOVERNANCE_LOW',
                `Only ${remaining} usage units left; stopping before the limit.`);
        }
    }

    function error(name, message) {
        const e = new Error(message);
        e.name = name;
        return e;
    }

    return { all, each, first, value, placeholders };
});
