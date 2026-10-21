# Inspection: Org SMS billing, Phase 1 (metering foundation, no enforcement)
Verdict: PASS WITH FINDINGS
Date / base ref: 2026-10-21 / 54ca1e3 (working tree of worktree `org-sms-billing`, uncommitted, plus untracked files)

## Intent restated
Nothing a volunteer receives changes. What changes is that every outbound SMS/MMS the backend
causes (API sends of every kind, plus TwiML replies to inbound texts) leaves exactly one row in
a private, REST-invisible ledger (`sms_usages`) recording org/garden (as documentIds), recipient,
segments, billable units, direction and one of four categories. All Twilio sends go through one
transport with one dry-run rule, so test/dev never hits Twilio. Every garden gets an org (new
gardens via a Document Service middleware; existing ones via an audit + map-driven backfill).
The inbound webhook gets a Twilio signature check, log-only by default. A reconcile script
compares ledger totals to Twilio's usage records (target: <2% drift). No REST response shape changes.

## Evidence base
- Full suite, own DB (`DATABASE_FILENAME=.tmp/inspect-full.db NODE_ENV=test npx jest --runInBand`):
  **767 passed, 1 failed / 768**. The one failure is `tests/inspection/day-sheet-inspection.test.js`
  P6 (pre-existing, fixed on origin/main db9522c, unrelated). `tests/app.test.js` (which includes
  `tests/billing/*`) and the 4 standalone billing files pass.
- Inspector probe: `tests/inspection/org-sms-billing-p1-inspection.test.js` (own Strapi,
  `DATABASE_FILENAME=.tmp/inspect-probe.db`): **8/8 pass**. Covers I1 production mode through
  the real transport with only the Twilio client factory stubbed, I2 admin content-manager HTTP
  create/publish/update, I3 signature log mode with a valid signature, I5 backfill map on a
  non-ORPHAN garden.
- Code checks by grep over `src/` and `config/` (see AC13 and AC38).

## AC scorecard
| AC | Status | Evidence |
|---|---|---|
| 1-6 | VERIFIED | `tests/billing/segments.test.js` (standalone, all AC literals); impl `src/utils/sms-segments.js` |
| 7 | VERIFIED | `tests/billing/ledger.js` AC7 block; `git diff 54ca1e3 --stat -- src/extensions` is empty (user schema untouched) |
| 8 | VERIFIED | `tests/billing/ledger.js` AC8 (anon and JWT both 404; roles 1 and 2 have no `api::sms-usage`). No routes/controllers/services dirs under `src/api/sms-usage` |
| 9 | VERIFIED (sqlite) / CLAIMED (pg) | `tests/billing/usage.js` AC9 (`PRAGMA index_list`, column order, second run ok). Postgres `\di` is manual after deploy |
| 10-12 | VERIFIED | `tests/billing/transport.test.js`; plus probe I1 (dry-run off: real `transport.create` → stub client gets exactly `{body, from: TWILIONUM, to}`) |
| 13 | VERIFIED | grep: `require('twilio')(` and `messages.create` only in `src/api/sms/services/transport.js:6,24`; module-level clients removed from sms-campaign, volunteer-day, weekly-schedule |
| 14-24 | VERIFIED | `tests/billing/send.js` (one test per AC; rows read through Document Service, so AC23 holds) |
| 25-29 | VERIFIED | `tests/billing/resolver.js` |
| 30-31 | VERIFIED (sqlite) / CLAIMED (pg) | `tests/billing/usage.js`. `num()` coercion handles pg string SUMs; not run on pg |
| 32-34 | VERIFIED | `tests/billing/send.js` AC32-34; probe I1 (handleSms in prod mode: message row + `mediaUrl` = task image + MMS row, units 3) |
| 35 | VERIFIED | `tests/billing/cs-campaign.js` AC35 (filtering, 21610 opt-out, gate block without `handleSendError`); probe I1 (real transport) |
| 36 | VERIFIED | `tests/billing/cs-vday.js` (HTTP, broadcast, dry-run returns all), `tests/billing/cs-cron.js` (reminder path) |
| 37 | VERIFIED | `tests/billing/cs-weekly.js` (rows, campaign garden, shape, stg guard, abort-on-error 500 = pre-change controller catch); probe I1 (stg guard with dry-run off) |
| 38 | VERIFIED | Sites #1,#2x2,#3,#4,#6,#8-#13,#16,#19,#20,#21 exercised across `tests/billing/cs-*.js` and `twiml.js`. Grep: every `handleSms`/`sendSms`/`send` call in `src/`+`config/` passes a category; vday `sendGroupMsg` takes it from `opts` (both callers pass it) |
| 39-40 | VERIFIED | `tests/billing/cs-system.js` (polled rows, system/billable false/user); diffs of `tests/auth/sms-login.js` and `tests/user/vacation-reminders.js` limited to the allowed seam edits |
| 41 | VERIFIED | `tests/billing/cs-campaign.js` #8/#9/#10 |
| 42-45 | VERIFIED | `tests/billing/twiml.js`. AC45 fixture is hard-coded; the diff of `message.js` shows the twiml builder calls untouched |
| 46-50 | VERIFIED | `tests/billing/signature.js`, `tests/billing/twilio-signature.test.js`; probe I3 (valid sig in log mode → exactly one info `[twilio-signature] mode=log valid=true`, no warn, no PII; URL with a query string) |
| 51-53 | VERIFIED | `tests/billing/org-create.js`; probe I2 (real admin HTTP `POST /content-manager/collection-types/api::garden.garden` with `{connect:[],disconnect:[]}` → +1 org document (2 rows); publish and update via admin add none; published garden row → published org row; admin create with an org selected creates none) |
| 54-57 | VERIFIED | `tests/billing/org-coverage.js` (incl. DRAFT_UNLINKED per Cameron's decision, title-differs untouched, idempotent second apply) |
| 58 | VERIFIED (core) / CLAIMED (script) | `tests/billing/reconcile.test.js` covers the pure core; the script's Strapi boot + real Twilio usage API are untested |
| 59 | VERIFIED | Full-suite run above; `git diff 54ca1e3` shows no edits to water-morning, crontest, general/index, tasks/transfer, tasks/poll; registration L76 expects `(phoneNumber, mockUser)` |
| 60 | VERIFIED (post-change shape) | cs-campaign, cs-vday, cs-weekly assert keys/types; the return statements in all three controllers/services are unchanged in the diff |

## Findings

### F1. DRIFT (medium): backfill `--map` silently ignores entries for gardens that already have an org
Decision Q2: "Multi-garden operators are consolidated during the backfill (same `--map`), so the
per-org free tier is fair from day one." But `backfill` only consults the map for ORPHANs:

`src/api/billing/services/coverage.js:148-150`
```js
if (g.classification === 'ORPHAN') {
  const target = map[g.documentId];
```
A map entry for an OK / PUBLISHED_UNLINKED / DRAFT_UNLINKED garden goes into neither `actions`
nor `skipped`. Probe I5 confirms this: a linked garden mapped to another org printed
`surfaced in actions/skipped: false`. Design §10 does scope the map to ORPHANs, so the code
matches the spec text. It does not match the decision's intent. If an operator's gardens already
sit under separate one-garden orgs, the backfill can't consolidate them, and Cameron gets no
signal that his reviewed map was partly dropped. That covers gardens created between deploy
step 1 (middleware live) and step 3 (backfill), since each gets its own auto-org.
Close it by reporting non-ORPHAN map entries in `skipped` with a reason at minimum, or by
supporting explicit relinks for mapped non-ORPHAN gardens.

### F2. DRIFT (low, reasoned, not exercised live): TwiML replies Twilio will drop are still metered as billable
`message.js` records a `twiml_reply` row for every truthy `smsBody`. It handles only `stop` and
`start` as consent keywords. Twilio's default opt-out keywords on a long code also include
STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT. Those fall through to the default branch, which
replies "I don't understand...". Twilio then blocks the reply (21610) and doesn't bill it, but
the ledger records a billable transactional row for the org. The same happens for any text from a
number Twilio considers opted out. The effect is a small positive reconcile drift and, in
Phase 2, units charged to an org for texts that never went out. It isn't among design §11's known
drift sources. Consider skipping `recordTwimlReply` when the user is opted out, or when the
inbound body is a Twilio opt-out keyword.

### F3. Test quality (low)
- `tests/billing/send.js:18-22`: the header comment says vacation-reminders leaks a `sendSms` mock,
  and the file imports the raw module `sendSms` to get around it. Task 1a-15 fixed that leak
  (now `patchService`), so the comment is stale and the workaround is unnecessary. It isn't wrong.
- AC60 tests assert the post-change shape only, with no pre-change baseline snapshot. The diff
  shows the return paths unchanged, so the risk is low.
- AC45's "pre-change" TwiML fixtures are hard-coded strings. Nothing in the repo shows they were
  captured from 54ca1e3. The TwiML builder lines are unchanged, so the risk is low.

### F4. Housekeeping (info)
`types/generated/components.d.ts` / `contentTypes.d.ts` also pick up types from earlier features
(events brief/agenda, garden visit-info, project-alert) that were never regenerated on main. That's
harmless, but it is extra noise in this commit.

### Vague-AC notes
- Intent bullet "ledger monthly totals match Twilio within 2%" and the plan's "exactly one row when
  Twilio accepts it" can only be checked in production (see below). For TwiML replies, the row is
  written before Twilio accepts the reply (see F2).

## What remains unverified and how to close it
1. **<2% reconcile drift (Phase 1 done criterion):** run `scripts/reconcile-twilio-usage.js` daily
   for 7 days on prod. Also confirm `client.usage.records.list({category:'sms-outbound'})` returns
   one aggregate record whose `usage` is in segments. The script's real Twilio call is untested.
2. **Postgres specifics:** `\di sms_usages*` after deploy (AC9). Run one `getUsage`/`getTotals`
   against pg to confirm the numeric coercion and boolean filters (AC30/31).
3. **Signature against real traffic:** set `TWILIO_WEBHOOK_URL` to the exact console URL, then
   `fly logs | grep twilio-signature`. Expect only `valid=true` before flipping to `enforce`.
   Behind Fly's proxy the URL match can't be tested locally.
4. **Real segment counts:** send one real broadcast to a test garden and compare the ledger's
   `segments`/`twilio_sid` with the Twilio console.
5. **Public org visibility (Q1):** after `--apply`, and for any garden created after deploy (the
   middleware titles its org after the garden), load `/gardens/:slug` in garden-vue and check
   whether "Stewarded by <garden title>" and the org sidebar card are acceptable. No frontend
   shape changes; only content becomes visible.
6. **Map review before apply:** given F1, diff the dry-run `actions` list against `map.json` by hand.

## Post-inspection fixes (2026-10-21)
- **F1 fixed:** `backfill` now applies a `--map` entry to any garden, not only orphans. Gardens already linked elsewhere get a `repoint-mapped-org` action listing `previousOrgs`. Entries already pointing at the target are no-ops, and entries naming no garden go to `skipped` with `map garden not found`. The script prints `(was …)`. Test: `billing: org-coverage › F1`.
- **F2 fixed:** `fetchSms` no longer meters a reply when the inbound text is any opt-out keyword (`SmsOptOut.isOptOutKeyword`) or the sender is already opted out. The TwiML output is unchanged. Tests: `billing: twiml › F2`.
- **F3 cleanup:** removed the stale `realSendSms` workaround in `tests/billing/send.js`.
- Full suite after the fixes: 778/779; the one failure is the known day-sheet P6 test (fixed on main in db9522c).
