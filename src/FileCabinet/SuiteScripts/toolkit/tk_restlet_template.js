/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * RESTlet template with validation, a consistent response envelope and safe errors.
 *
 *   GET  ?id=123                 returns one customer summary
 *   GET  ?email=a@example.com    looks a customer up by email
 *   POST { "id": 123, "memo": "..." }   writes a comment to the customer record
 *
 * Every response is { ok: true, data } or { ok: false, error: { code, message } }.
 * Internal error details go to the execution log, never to the caller.
 */
define(['N/record', 'N/log', './lib/tk_suiteql'], (record, log, sql) => {

    const MAX_MEMO = 4000;

    class ClientError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    }

    function get(params) {
        return handle(() => {
            if (params.id) {
                return customerSummary(requireId(params.id));
            }
            if (params.email) {
                const email = String(params.email).trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    throw new ClientError('INVALID_EMAIL', 'email is not a valid address.');
                }
                const row = sql.first(
                    'SELECT id FROM customer WHERE LOWER(email) = ? AND isinactive = ?',
                    [email, 'F']
                );
                if (!row) {
                    throw new ClientError('NOT_FOUND', 'No active customer has that email.');
                }
                return customerSummary(row.id);
            }
            throw new ClientError('MISSING_PARAMETER', 'Pass id or email.');
        });
    }

    function post(body) {
        return handle(() => {
            const input = typeof body === 'string' ? JSON.parse(body) : body;
            const id = requireId(input && input.id);
            const memo = String((input && input.memo) || '').trim();

            if (!memo) {
                throw new ClientError('MISSING_PARAMETER', 'memo is required.');
            }
            if (memo.length > MAX_MEMO) {
                throw new ClientError('MEMO_TOO_LONG', `memo is limited to ${MAX_MEMO} characters.`);
            }

            customerSummary(id); // 404 before attempting a write

            record.submitFields({
                type: record.Type.CUSTOMER,
                id,
                values: { comments: memo },
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
            return { id, updated: true };
        });
    }

    function customerSummary(id) {
        const row = sql.first(
            `SELECT c.id,
                    c.entityid,
                    c.companyname,
                    c.email,
                    BUILTIN.DF(c.subsidiary) AS subsidiary,
                    c.isinactive
               FROM customer c
              WHERE c.id = ?`,
            [id]
        );
        if (!row) {
            throw new ClientError('NOT_FOUND', `Customer ${id} does not exist.`);
        }
        return row;
    }

    function requireId(value) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) {
            throw new ClientError('INVALID_ID', 'id must be a positive whole number.');
        }
        return id;
    }

    /**
     * Wraps a handler so every exit path returns the same envelope. RESTlets always answer
     * HTTP 200 unless the script throws, so callers should read `ok`, not the status code.
     */
    function handle(fn) {
        try {
            return { ok: true, data: fn() };
        } catch (e) {
            if (e instanceof ClientError) {
                return { ok: false, error: { code: e.code, message: e.message } };
            }
            if (e instanceof SyntaxError) {
                return { ok: false, error: { code: 'INVALID_JSON', message: 'Body is not valid JSON.' } };
            }
            log.error('Unexpected RESTlet error', { name: e.name, message: e.message, stack: e.stack });
            return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. It has been logged.' } };
        }
    }

    return { get, post };
});
