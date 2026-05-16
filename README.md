Here's every issue in the current server.ts, nothing touched:

Critical — broken by design:

previousValue is always RAM — /api/increment line 74 and /api/decrement line 97 both use state.currentValue as previousValue. That counter starts at 0 on every server restart. Every Railway deploy, every crash, every redeploy resets it to 0. The real customer balance from Zoho is never fetched. Math is wrong from the first call after any restart.

History grows forever — state.history = [transaction, ...state.history] has no cap. Every transaction prepends to the array in RAM. Long-running server with high volume = memory leak until process dies.

Silent failures that hide real problems:

Webhook .catch(() => {}) on both routes — lines 89 and 112. If the webhook URL is wrong, expired, Zoho Flow is off, network blips — zero indication. Transaction appears successful, nothing logged, Zoho never gets the data. You'd have no idea.

process.env.WEBHOOK_URL! and process.env.WEBHOOK_I_URL! — non-null assertions on env vars. If either isn't set in Railway, fetch(undefined) throws, swallowed by .catch(() => {}). Silent.

Number(process.env.PORT) — if PORT isn't set, this is NaN. Server attempts to listen on NaN, behavior is undefined depending on Node version.

Data integrity:

amount empty or null becomes 0 — Number(null) is 0, Number("") is 0. If a caller sends no amount, the transaction fires with amount 0 and the balance doesn't change but a transaction record is still written and webhook fired.

customerId is never validated — can be undefined, empty string, or anything. Gets passed into the webhook body as-is. Zoho receives garbage.

Production readiness:

No Zoho MCP fetch at all — the entire customer balance lookup that makes this useful was removed in the revert. The server is just a RAM counter with webhook fire-and-forget.

APP_URL undefined in logs — if not set in Railway, startup log says Server running on undefined. Minor but sloppy.

The single biggest problem: no Zoho balance fetch means every customer shares the same RAM counter starting at 0. That's not a credit system, that's a broken counter