# Org SMS billing, Phase 1: metering foundation (no enforcement)
Status: DESIGNED
Requested by / date: Cameron (cameron@oufp.org) / 2026-10-16
Source plan: `~/.claude/plans/help-me-plan-out-parsed-dove.md` (Phase 1 + "Constraints found in the code").
Branch: `org-sms-billing` (cut from origin/main 54ca1e3). Backend only.

## Intent
Garden Steward starts measuring how many outbound text segments it sends for
each organization, and changes nothing about which texts anyone receives. Every
outbound SMS or MMS the backend causes gets exactly one row in a private ledger
when Twilio accepts it. That covers API sends (blasts, reminders, relays to other
volunteers, contact cards, login codes) and the TwiML replies to inbound texts.
Each row records the garden and organization it was sent for, its segments and
billable units, and a category (`broadcast`, `reminder`, `transactional`,
`system`). Phase 2 will use the category to pause only broadcasts for free orgs
over 500 units a month. For attribution to be complete:
- every garden belongs to an organization (existing gardens are backfilled, new ones get one automatically);
- every Twilio send goes through one transport with one dry-run rule;
- the public inbound webhook validates Twilio's signature, in log-only mode first and later in enforce mode, so spoofed texts can't run up usage.

Phase 1 is done when:
- the ledger's monthly totals match Twilio's own usage report within 2%;
- the same people get the same texts as before;
- dry-run and test behavior still keeps real texts from going out;
- no API response the frontend consumes changes shape.

See Open Question 1 for one public-page effect of the org backfill that needs
your decision.

## Current state
I checked every claim against `origin/main` 54ca1e3. Line numbers are from that commit.

**Send paths are fragmented and unmetered.**
- `src/api/sms/services/sms.js` is a plain-object service (uid `api::sms.sms`).
  - `sendContactCard` (L6-20) returns the Twilio promise. Its test gate is at L9.
  - `sendSms` (L21-39) does **not** return its promise (L36-38), so a Twilio rejection is unhandled. Its test gate is at L24.
  - `handleSms` (L42-67) writes a `message` row (L49-59), returns early when `ENVIRONMENT=='test'` (L63), and then fires `sendSms` without awaiting it (L66).
- Three blast paths construct their own Twilio client at module load and call `client.messages.create` directly:
  - `src/api/sms-campaign/services/sms-campaign.js` L18-21 builds the client and L372-377 sends. There is **no** test gate: tests intercept HTTP with a `RequestClient` spy (`tests/sms-campaign-vacation.js` L3, L62-72).
  - `src/api/volunteer-day/services/volunteer-day.js` L2-5 builds the client and L136-145 sends, gated on `NODE_ENV==='test'`.
  - `src/api/weekly-schedule/services/weekly-schedule.js` L2-6 builds the client and L126-136 sends. The gate at L127 is `['test','stg'].includes(ENVIRONMENT)`, which skips sending on **staging** as well. The loop has no try/catch, so a Twilio error aborts the remaining sends.
  - Under the cron, that error also skips task creation for the recurring task (`config/cron-tasks.js` L20-31).
- So there are five env checks across three files and one path with no check at all. They mix `ENVIRONMENT` and `NODE_ENV`. Nothing records segments or Twilio SIDs.

**Weekly-schedule controller bug.** `src/api/weekly-schedule/controllers/weekly-schedule.js` L14-17
populates `recurring_task` but not its garden. `sendWeeklyMsg` L140 then throws a
TypeError on `recTask.garden.id`, the try/catch at L143 swallows it, and the
`sms-campaign` row is never written on the manual-send path.

**Most sends don't know their garden.**
- `handleSms` derives the message garden from `task?.garden || user?.activeGarden || event?.garden` (L53).
- But the tasks handed to it are often unpopulated:
  - `updateGardenTaskUser` (garden-task.js L193-198) doesn't populate `garden`, and neither does `getUserTasksByStatus` (L93).
  - `validateQuestion` populates `garden_task` but not `garden_task.garden` (message service L17).
- Events and campaigns are loaded without a garden in three places:
  - `rsvpEvent` (volunteer-day/services/helper.js L24-29);
  - `getLatestCampaign` (sms-campaign.js L51);
  - `sendPollReminders` (L204).
- The garden cache (`src/api/garden/services/garden.js` L20) doesn't populate `organization`.

**Data model constraints.**
- `organization` and `garden` are both draft & publish types (their `schema.json` `options`). The garden→org relation is `manyToOne` on garden.
- Publishing re-inserts the published row with a new numeric id (commit 25b1a1d explains this for projects).
- `organization` is populated into public payloads (`garden.js` L122 `fullSlug`; `volunteer-day.js` L76/L85/L336). garden-vue renders `organization.title` on:
  - `GardenPublic.vue` L607-620 ("Stewarded by");
  - `GardenContextBar.vue` L33;
  - `EventsList.vue` L124;
  - `EventView.vue` L261;
  - `InstructionPublicView.vue` L86.
- The Document Service middleware precedent is `src/index.js` L79-88.

**The inbound webhook is unauthenticated.** `POST /api/sms` (`src/api/message/routes/message.js` L22-30
calls `message.fetchSms`, `controllers/message.js` L51-253) is granted to the Public role
(`scripts/seed-data.js` L515). It has no signature check. Its TwiML reply is built
at L240-250 and saved as a `message` row by `SmsHelper.saveMessage` (L333-349).

**Send-error handling changed after the plan's exploration (#51, 008caaf).** The
blast loops no longer call `garden.unsubscribeUser()`. They call
`SmsOptOut.handleSendError(volunteer, err)` (`src/utils/sms-opt-out.js` L64-71).
That marks `sms_opted_out_at` only for Twilio error 21610 and otherwise just logs
(sms-campaign.js L380-383, volunteer-day.js L148-152).

**Test seams that this phase touches.**
- `tests/sms-campaign-vacation.js` spies on `RequestClient` (L62-72) and asserts on the spy (L113, L138).
- `tests/auth/sms-login.js` asserts `sendSms` was called with exactly two arguments (L67, L777).
- `tests/user/registration.js` L76 asserts `SmsHelper.sendContactCard` was called with exactly `(phoneNumber)`.
- `tests/user/vacation-reminders.js` L46/L193 *assigns* `sendSms = jest.fn()` without restoring it, so the mock leaks into every later module.
- `tests/water-morning.test.js` L127 and `tests/tasks/crontest.js` L73 mock `global.strapi` with only `service()` returning `{handleSms}`.
- `tests/general/index.js` L46 and `tests/tasks/transfer.js` L234 patch `handleSms`.
- `tests/event/messages.js` L47 passes a **number** as `vDay` to `sendGroupMsg` and doesn't await the call.

## Design

### Principles (these bind the implementation)
1. **Metering never changes delivery.** Resolver, ledger, and gate failures are logged and swallowed. A send that would have happened yesterday still happens: the system fails open.
2. **One patch point per layer.** All cross-service calls are looked up at call time with `strapi.service(uid)`, never captured at module load. That way `patchService` can intercept:
   - `api::sms.transport.create` (the network);
   - `api::sms.sms.send` (all outbound sends);
   - `api::billing.usage.canSend` (the gate);
   - `api::billing.resolver.resolveContext` (attribution).
3. **Call sites stay dumb.** Converted call sites only add keys (`category`, `source`, `garden`) to the arguments they already pass. They never call billing services directly. That keeps the minimal `global.strapi` mocks in `tests/water-morning.test.js` and `tests/tasks/crontest.js` working unchanged.
4. **Missing or unknown category becomes `transactional`** (billable, never blockable) plus a `warn` log naming the source. An untagged send then neither escapes metering nor gets accidentally blocked in Phase 2.
5. **`message` rows do not change.** Their content is visible in garden-vue through `GET /message/garden/:id` (`fetchTaskMessages`). Writing a garden onto more rows would surface new messages there. The ledger is the only new record.

### Out of scope (Phase 2/3 or never)
- Out of scope (plan Phases 2 and 3):
  - enforcement, `canSend` logic, blast preflight, the 409 response;
  - alerts, `org-subscription`, org managers;
  - billing routes and UI;
  - Stripe.
- Out of scope, and not planned for any phase in this spec:
  - the missing manager check on `groupSms`;
  - metering inbound SMS;
  - Twilio status callbacks;
  - cron claim-before-act (Phase 1 adds no crons);
  - automatic consolidation of gardens into shared orgs;
  - fixing the weekly-schedule abort-on-error (preserved in Phase 1, see call-site table).

### 1. `src/utils/sms-segments.js`: `countSegments(body) → { segments, encoding }`
Pure CommonJS. No Strapi, no I/O.
- `body` null or undefined is treated as `''`.
- `encoding` is `'gsm7'` if every UTF-16 code unit is in the GSM 03.38 basic set or the extension table. Otherwise it is `'ucs2'`.
  - The basic set is the standard 128-character default alphabet, including `\n`, `\r`, `@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà` and printable ASCII except the extension characters.
  - The extension table is ``^ { } \ [ ~ ] | €`` and form feed `\f`. Each costs 2 septets.
- GSM-7 packing:
  - If the total septets are 160 or fewer, it's 1 segment.
  - Otherwise, fill segments of 153 septets greedily. An extension character (2 septets) is never split across a boundary: if it doesn't fit, it starts the next segment.
- UCS-2 packing:
  - Count UTF-16 code units (JS `.length`). If there are 70 or fewer, it's 1 segment.
  - Otherwise, fill segments of 67 units greedily, and never split a surrogate pair.
- The minimum is 1 segment (`''` returns `{segments: 1, encoding: 'gsm7'}`). A message that went out is never 0 segments.
- No Smart Encoding substitution: we send from a number, not a Messaging Service.

### 2. Ledger content type `api::sms-usage.sms-usage`
File: `src/api/sms-usage/content-types/sms-usage/schema.json`.
- `collectionName: "sms_usages"` and `draftAndPublish: false`.
- **No** `routes/`, `controllers/`, or `services/` directories, so there are no REST endpoints and no users-permissions actions to grant.
- The admin content-manager can still view it.

| attribute | type | notes |
|---|---|---|
| `organization_document_id` | string | nullable. documentId (not a relation) because org is draft & publish |
| `garden_document_id` | string | nullable, same reason |
| `user` | relation `manyToOne` → `plugin::users-permissions.user` | **one-way** (no `inversedBy`). The user schema is untouched. This is the recipient, when known |
| `to_number` | string | E.164 as passed to Twilio |
| `twilio_sid` | string | null for simulated, TwiML and blocked rows |
| `source` | string | call-site tag (see table), e.g. `sms-campaign.group` |
| `period` | string, required | `YYYY-MM` of `sent_at` in **UTC** |
| `segments` | integer, required | |
| `num_media` | integer, default 0 | |
| `units` | integer, required | billable units: `num_media > 0 ? MMS_UNITS : segments` |
| `encoding` | enumeration `gsm7`, `ucs2` | from `countSegments(body)` |
| `direction` | enumeration `api`, `twiml_reply`, required | |
| `category` | enumeration `broadcast`, `reminder`, `transactional`, `system`, required | |
| `sent_at` | datetime, required | when the row is recorded (after Twilio accepted the message) |
| `billable` | boolean, default true | false for `system`, and for `blocked` rows |
| `blocked` | boolean, default false | Phase 2 seam |
| `simulated` | boolean, default false | true when the transport did not actually send |
| `stripe_reported_at` | datetime | reserved for Phase 3, always null in Phase 1 |
| `stripe_batch_id` | string | reserved for Phase 3, always null in Phase 1 |

- No attribute is named `status` (reserved in Strapi v5).
- Rows must have a non-null `publishedAt` so they are visible to the Document Service and the admin list. Either write with `strapi.documents(uid).create` (preferred) or set `publishedAt` explicitly on `db.query().create`.
- Indexes are created in `src/index.js` bootstrap with `CREATE INDEX IF NOT EXISTS`, using table and column names from `strapi.db.metadata.get(uid)` (the same pattern as `sms-login.js` `userColumns`):
  - `sms_usages_org_period_idx (organization_document_id, period)`;
  - `sms_usages_report_idx (stripe_reported_at, billable)`.
- The index step is wrapped in try/catch, so a failure logs and never blocks boot.
- I verified this is safe: Strapi's schema diff only drops indexes it created itself (`@strapi/database/dist/schema/diff.js` `diffTableIndexes`). Don't use the undocumented `indexes` key in `schema.json`.

### 3. Transport `api::sms.transport` (`src/api/sms/services/transport.js`)
- `isDryRun() → boolean`. It is true when `SMS_DRY_RUN` is `'true'` or `'1'`, or `ENVIRONMENT === 'test'`, or `NODE_ENV === 'test'`. It is read from `process.env` **on every call**.
- `create({ to, body, mediaUrl }) → Promise<{ sid, numSegments, numMedia, simulated }>`:
  - **Dry-run:** resolves `{ sid: null, numSegments: null, numMedia: null, simulated: true }`. It never constructs a Twilio client and never touches the network.
  - **Otherwise:** lazily builds and memoizes **one** client with `require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)`, then calls `messages.create({ body, from: TWILIONUM, to, ...(mediaUrl && { mediaUrl }) })`. It resolves `{ sid, numSegments, numMedia, simulated: false }` from the Twilio instance and rejects with Twilio's error untouched (`err.code` preserved for the 21610 handling).
- No other module may construct a Twilio REST client or call `messages.create`. The `twiml` builders and `validateRequest` imports are still allowed.
- Lazy construction matters: `require('twilio')(undefined, undefined)` throws in twilio 3.x, so CI or test runs without credentials must not build a client.
- **Staging nuance:** dry-run deliberately does **not** include `ENVIRONMENT==='stg'`. Today staging sends everything for real except weekly-schedule messages. That one skip stays as an explicit local guard in `sendWeeklyMsg` (Open Question 3).

### 4. Attribution resolver `api::billing.resolver` (`src/api/billing/services/resolver.js`)
`resolveContext({ garden, user, task, event }) → Promise<{ gardenDocumentId: string|null, organizationDocumentId: string|null }>`. It never throws: any error is logged and returns nulls.

1. **Pick a garden reference** in this order. The first input that yields one wins:
   1. explicit `garden`;
   2. `task.garden`;
   3. `event.garden`;
   4. `user.activeGarden`.
2. **Load missing relations.** If a `task`, `event`, or `user` has an `id` but the relation key is **absent** (not loaded), load it with one `findOne` (`populate: { garden | activeGarden: { select: ['documentId'] } }`). The UIDs are `api::garden-task.garden-task`, `api::volunteer-day.volunteer-day`, and `plugin::users-permissions.user`. This lookup is what attributes relays (pass/transfer), RSVP alerts, and TwiML replies whose task wasn't populated.
3. **Normalize the garden reference to a documentId:**
   - an object with `documentId` uses it;
   - an object with an `id`, or a number, or a numeric string, is looked up by row id;
   - a non-numeric string is taken as the documentId itself.
4. **Find the organization.** Query `api::garden.garden` `findMany({ where: { documentId }, populate: { organization: { select: ['documentId'] } } })`:
   - use the **published** row's `organization.documentId` if it has one;
   - otherwise use the draft row's;
   - otherwise null.
5. **Cache** in process memory, keyed by garden documentId (to org documentId, including null) and by garden row id (to documentId), with a TTL of 5 minutes.
   - `clearCache()` is exported for tests and scripts.
   - No cross-machine invalidation: each Fly machine has its own cache. After the backfill or an org change, attribution is correct within 5 minutes.

### 5. Usage service `api::billing.usage` (`src/api/billing/services/usage.js`)
- **`record(row) → Promise<row|null>`** writes one ledger row and **never throws**.
  - If the write fails and the row carries a `user`, it retries once without the user. A stale or nonexistent user id must not lose the row.
  - On final failure it logs with `strapi.log.error`, falling back to `console.error` if `strapi.log` is gone after teardown.
- **`getUsage(organizationDocumentId, { period } | { from, to }, { includeSimulated = false } = {}) → { units, segments, blockedCount }`** runs a knex aggregate.
  - `units` and `segments` are sums over rows where the org matches, `billable = true` and `blocked = false`. Rows with `simulated = true` are excluded unless `includeSimulated` is set.
  - `blockedCount` counts `blocked = true` rows in the same window.
  - `{from, to}` filters on `sent_at` (from inclusive, to exclusive).
  - It always returns JS numbers: Postgres returns `SUM` as a string, so coerce.
- **`getTotals({ period }) → {...}`** returns platform-wide totals for reconciliation, over rows with `simulated = false` and `blocked = false`:
  - `smsSegments`: sum of `segments` where `num_media = 0`;
  - `mmsCount`: count of rows where `num_media > 0`;
  - breakdowns by `category`, by `direction`, and attributed (org not null) versus unattributed.
- **`canSend(organizationDocumentId, category, units) → { allowed: true, remaining: null, reason: null }`** is the Phase 1 stub and always allows. This is the Phase 2 seam.

### 6. `config/billing.js`
- Strapi loads it as config namespace `billing`. Use `module.exports = ({ env }) => ({...})` and read it with `strapi.config.get('billing')`.
- Keys, following the plan's names:
  - `FREE_UNITS: env.int('BILLING_FREE_UNITS', 500)`;
  - `WARN_PCT: 0.8`;
  - `GRACE_PCT: 0`;
  - `MMS_UNITS: env.int('BILLING_MMS_UNITS', 3)`;
  - `BLOCKABLE: ['broadcast']`;
  - `plans.standard = { includedUnits: 1500, baseFeeCents: 2000, overageCentsPerUnit: 2 }`;
  - `stripe = { priceBase: env('STRIPE_PRICE_BASE'), priceMetered: env('STRIPE_PRICE_METERED'), meterEvent: env('STRIPE_METER_EVENT') }`.
- Phase 1 reads only `MMS_UNITS`. Everything else is inert.

### 7. Rewritten `api::sms.sms` (`src/api/sms/services/sms.js`)
It stays a plain-object service. The wrappers invoke `send` **through the service object**
(`strapi.service('api::sms.sms').send(...)`), so patching `send` intercepts everything.

```
send({ to, body, mediaUrl, garden, user, task, event,
       category, source, billable, throwOnError = false, beforeSend })
  → Promise<{ ok, sid, segments, units, blocked, simulated, error }>
```

Steps, in order:
1. **Normalize the category** (Principle 4) and compute the estimate:
   - `{segments, encoding} = countSegments(body)`;
   - `num_media` = the number of media URLs (0, 1, or the array length);
   - `units = num_media > 0 ? MMS_UNITS : segments`.
2. **Resolve attribution:** `ctx = resolver.resolveContext({garden, user, task, event})`.
3. **Gate:** `usage.canSend(ctx.organizationDocumentId, category, units)`. If `canSend` throws, treat it as allowed and log. If **not allowed**:
   - record a row with `blocked = true`, `billable = false`, `twilio_sid` null, `simulated = isDryRun()`, `direction = 'api'`;
   - return `{ ok: false, blocked: true, sid: null, error: null, ... }`;
   - **never throw, even when `throwOnError` is set**;
   - do not run `beforeSend` and do not call the transport.
4. **`await beforeSend?.()`** if allowed. Errors are logged and swallowed. This is how `handleSms` writes its `message` row after the gate and before the network.
5. **`transport.create({ to, body, mediaUrl })`.** If it rejects:
   - log the source and `err.code` (no body);
   - write **no** ledger row;
   - rethrow if `throwOnError`, otherwise return `{ ok: false, blocked: false, error: err }`.
6. **Final segments:** `parseInt(msg.numSegments, 10)` when it is finite and greater than 0, otherwise the estimate. Recompute `units` if there is no media.
7. **`usage.record(...)`** with:
   - `direction 'api'`;
   - `billable = billable ?? (category !== 'system')`;
   - `simulated = msg.simulated === true`;
   - `user = user?.id ?? null`;
   - `period` taken from the UTC `sent_at`.
8. **Return** `{ ok: true, sid: msg.sid ?? null, segments, units, blocked: false, simulated, error: null }`.

`send` adds no input validation of its own. Whatever reached Twilio before still reaches the transport, for example a missing `to`. In production Twilio rejects it exactly as today. In dry-run it is simulated, which keeps today's volunteer-day test-env semantics.

Wrappers (today's signatures, plus optional trailing options):

| wrapper | becomes | rejects? |
|---|---|---|
| `sendSms(toNum, body, mediaUrl, opts = {})` | `send({ to: toNum, body, mediaUrl, ...opts, throwOnError: opts.throwOnError ?? true })`. It now **returns its promise** | Yes, on a transport error (both existing callers already handle rejection: `sms-login.js` L150-152, `vacation-checkin.js` L50-63). A block resolves `{blocked:true}` |
| `sendContactCard(toNum, opts = {})` | `send({ to: toNum, body: '', mediaUrl: 'https://steward.garden/contactcard.vcf', category: 'transactional', source: 'sms.contact-card', ...opts, throwOnError: true })` | Yes, as today. `SmsHelper.sendContactCard` L268-276 catches it |
| `handleSms(params)` | `params` gains optional `garden`, `category`, `source`. `member = (!user && task?.volunteers?.length) ? task.volunteers[0] : user` (unchanged). Then `send({ to: member?.phoneNumber, body, mediaUrl: task?.primary_image?.url \|\| null, garden: params.garden, task, event, user: member, category, source, throwOnError: false, beforeSend: <today's message-row write, byte-for-byte the same data as L49-59> })`. It awaits the send and resolves the result | No |
| `recordTwimlReply({ to, body, mediaCount = 0, garden, user, task, source = 'webhook.reply' })` | resolve, then `usage.record` with `direction 'twiml_reply'`, `category 'transactional'`, `twilio_sid` null, `segments = countSegments(body).segments`, `units` per the media rule, `simulated = transport.isDryRun()` | No. Resolves the row or null |
| `handleVoice` | unchanged | n/a |

Timing note: `handleSms` used to resolve before Twilio answered. Callers that
`await handleSms` (pass/transfer inside `fetchSms`, poll reminders, closePoll)
now wait for the Twilio API round-trip, typically 200-500 ms. That is well inside
Twilio's 15 s webhook timeout. Fire-and-forget callers are unaffected.

### 8. Call sites: every outbound send, with its category
"Attribution" is what the call site passes; the resolver fills the rest.
`(+)` marks a change beyond adding keys.

| # | Site (origin/main line) | Category | `source` | Attribution / notes |
|---|---|---|---|---|
| 1 | `sms-campaign.js` L372 `sendGroupMsg`: direct create becomes `send` | broadcast | `sms-campaign.group` | `garden: gardenObj`, `user: volunteer`. `throwOnError: true` so errors still reach the existing catch and `handleSendError`. `(+)` `if (r.blocked) continue;` before pushing to `sentInfo`/`sentUsers`, with no `handleSendError`. Remove the module-level client (L18-21) |
| 2 | `volunteer-day.js` L139 `sendGroupMsg(vDay, copy, opts = {})`: direct create becomes `send` | broadcast via controller `groupSms` L552; reminder via `cron-helper.js` L116 | `volunteer-day.group` / `volunteer-day.reminder` | `garden: vDay?.garden`. `(+)` remove the `NODE_ENV` branch (L136-138): the transport's dry-run replaces it, and dry-run results still count as sent. Same `throwOnError` and blocked handling as #1. `VdayHelper.sendMessage` (L169, unused) passes `opts` through |
| 3 | `weekly-schedule.js` L129 `sendWeeklyMsg` | reminder | `weekly-schedule` | `garden: recTask.garden`. `throwOnError: true` **preserves** today's abort-on-error semantics. `(+)` the local guard becomes `ENVIRONMENT==='stg'` only (dry-run covers `test`). `(+)` controller L16 populates `recurring_task.garden`. Remove the module-level client |
| 4 | `cron-helper.js` L280 (water ask), L293 (water skip notice) | reminder | `cron.water`, `cron.water-skip` | `task` (garden populated, L27) |
| 5 | `cron-helper.js` L570, L576, L583 started follow-ups | reminder | `cron.started-followup` | `task` |
| 6 | `garden-task.js` L362 `sendTask` (also reached from `InstructionAssignTask` L28) | reminder | `garden-task.send-task` | `task` |
| 7 | `instruction.js` L52 `managePendingTask` | reminder | `instruction.pending` | `task` |
| 8 | `sms-campaign.js` L225 poll reminders | reminder | `poll.reminder` | `(+)` add `garden: true` to the populate at L204 and pass `garden: campaign.garden` |
| 9 | `sms-campaign.js` L336 `closePoll` | transactional | `poll.close` | `garden: campaign.garden` (populated at L280) |
| 10 | `sms-campaign.js` L418 `sendRSVPAlert` | transactional | `campaign.rsvp-alert` | `(+)` add `garden: true` to the `getLatestCampaign` populate (L51). It's internal only (callers: SmsHelper L24, sms-campaign L63, L97). Pass `garden: campaign.garden` |
| 11 | `SmsHelper.js` L647 `passToNextVolunteer` | transactional | `sms.pass` | `task: updatedTask` (the resolver loads the garden by task id) |
| 12 | `SmsHelper.js` L796 `transferTask` | transactional | `sms.transfer` | same as #11 |
| 13 | `SmsHelper.js` L268-276 `sendContactCard`, called at L303 | transactional, **MMS** | `sms.contact-card` | `(+)` signature becomes `SmsHelper.sendContactCard(phoneNumber, user)`. L303 passes `user`, which is forwarded as `opts.user`. *Not in the plan's table* |
| 14 | `instruction/controllers/helper.js` L85 `requestApproval` | transactional | `instruction.request-approval` | `task: gardenTask` (may be `false`) and `user`. *Not in the plan's table* |
| 15 | `volunteer-day/services/helper.js` L13 `inviteUserEvent` | transactional | `event.invite` | `event` (garden populated by the controller) |
| 16 | `volunteer-day/services/helper.js` L43 `rsvpEvent` | transactional | `event.rsvp` | `(+)` pass `garden: data.event?.garden`, because L24-29 reloads the event without its garden |
| 17 | `garden-task/services/helper.js` L29 `inviteUserTask` | transactional | `task.invite` | `garden: data.task.garden` |
| 18 | `message.js` L28 `requestEmail` | transactional | `message.request-email` | `user` (activeGarden populated at L21) |
| 19 | `sms-login.js` L149 | system (`billable=false`) | `auth.sms-login` | `sendSms(r.phoneNumber, smsBody(code), undefined, { category: 'system', source: 'auth.sms-login', user: r.user })`. It stays fire-and-forget |
| 20 | `vacation-checkin.js` L51 | system (`billable=false`) | `vacation.checkin` | `sendSms(user.phoneNumber, smsBody, undefined, { category: 'system', source: 'vacation.checkin', user })` |
| 21 | `message.js` L240-250 `fetchSms` TwiML reply | transactional | `webhook.reply` | `recordTwimlReply({ to: phoneNumber, body: smsBody, mediaCount: <1 if the media branch at L241 ran, else 0>, garden: garden \|\| smsTask?.garden \|\| user?.activeGarden, task: smsTask, user })`. Called only when `smsBody` is truthy, next to `saveMessage`. The TwiML output is unchanged |

After this phase, every `handleSms`/`sendSms`/`sendContactCard`/`send` call in
`src/` and `config/` passes an explicit category.

### 9. Twilio signature validation on `POST /api/sms`
- **Pure helper** `src/utils/twilio-signature.js`:
  `evaluate({ mode, authToken, url, signature, params }) → { valid, allow, reason }`.
  It uses `require('twilio').validateRequest(authToken, signature, url, params)`.
- **Route middleware** `src/api/message/middlewares/twilio-signature.js`, registered on that route in `src/api/message/routes/message.js` as `config.middlewares: ['api::message.twilio-signature']`. Putting it in middleware rather than in `fetchSms` keeps the controller untouched. It runs before any controller work: no `getUser`, no writes.
- **Inputs, read from `process.env` on every request:**
  - `TWILIO_SIGNATURE_MODE`: `log` (the default, also used for unknown values with a one-time warn) or `enforce`;
  - `TWILIO_WEBHOOK_URL`: the exact public URL configured in the Twilio console, including any query string;
  - `TWILIO_AUTH_TOKEN`;
  - header `x-twilio-signature`;
  - params = the parsed form body (`ctx.request.body`).
- The URL is **never** derived from `ctx.href`, because behind Fly's proxy it won't match.

| mode | config present? | signature | outcome |
|---|---|---|---|
| log | yes | valid | proceed. Log info `[twilio-signature] mode=log valid=true` |
| log | yes | invalid or missing | proceed. Log warn `[twilio-signature] mode=log valid=false reason=<...>` |
| log | URL or token missing | n/a | proceed. Log warn `[twilio-signature] skipped: <missing var>` |
| enforce | yes | valid | proceed |
| enforce | yes | invalid or missing | **403**, empty body, no side effects. Log warn |
| enforce | URL or token missing | n/a | **403**, fail closed. Log error naming the missing var |

Logs carry no message body and no phone number. The `valid=true` info line lets
you confirm "no false rejects" by comparing the true and false counts.

### 10. Every garden belongs to an organization
**New gardens.** A Document Service middleware handles this, registered in
`src/index.js` bootstrap next to the slug middleware. Its logic lives in
`api::billing.coverage.provisionForGardenCreate(context, next)`, so `index.js` stays thin.
- It applies only to `uid === 'api::garden.garden'` with `action === 'create'`. This covers the admin content-manager and core `POST /api/gardens`.
- It counts as "no org" when `data.organization` is absent, null, `''`, or a connect/set with an empty list (the admin sends `{ connect: [], disconnect: [] }`).
- When there is no org, it creates the organization with `strapi.documents('api::organization.organization').create({ data: { title: data.title }, status: 'published' })`, so both versions exist. It then points `data.organization` at the new documentId and calls `next()`.
- If `next()` throws, it deletes the org it just created and rethrows, so a failed garden save leaves no junk org behind.
- If creating the org fails, it logs and calls `next()` unchanged, so garden creation is never blocked.
- **Why not a lifecycle:**
  - v5 publish re-inserts the published row, so `beforeCreate`/`afterCreate` on garden fire again on every publish, with relations not yet copied. That is a duplicate-org trap.
  - The existing garden `afterCreate` (lifecycles.js L38) already fires twice per published garden for this reason.
- **Not covered:** `strapi.db.query('api::garden.garden').create` (seeds, tests) and the content-manager `clone` (which copies the source's org). The audit catches both.

**Existing gardens.** The scripts are thin. Their logic lives in `api::billing.coverage`, so tests can call it.
- **`audit()` → per garden document:**
  - fields: `{ documentId, title, sms_slug, hasPublished, publishedOrg, draftOrg, classification }`;
  - classification is `OK`, `ORPHAN` (no org on any row), `PUBLISHED_UNLINKED` (draft linked, published row not), `MISMATCH` (draft and published point to different orgs), or `ORG_UNPUBLISHED` (the linked org has no published version);
  - it also returns a summary of counts.
- **`backfill({ apply = false, map = {} })`:**
  - for each `ORPHAN`: use `map[gardenDocumentId]` (an existing org documentId) if given, otherwise create and publish one org titled exactly the garden's title;
  - for each `PUBLISHED_UNLINKED` whose org is published: link the missing row;
  - linking is **per row, by row id, with `strapi.db.query(...).update`**: the draft garden row links to the org's draft row, and the published garden row links to the org's published row;
  - it must **not** use `documents().update`/`publish` on gardens, because that would publish any pending draft edits;
  - it changes no other garden field;
  - `MISMATCH` and `ORG_UNPUBLISHED` are reported and left alone;
  - it is idempotent;
  - it returns the list of actions taken, or the actions it would take when `apply` is false.
- **`scripts/audit-org-coverage.js`**: read-only. Prints a table, or JSON with `--json`.
- **`scripts/backfill-garden-orgs.js`**: dry-run by default. `--apply` writes. `--map <file.json>` takes `{ "<gardenDocumentId>": "<organizationDocumentId>" }`.
- **Both scripts:**
  - set `process.env.CRON_ENABLED = 'false'` before requiring `@strapi/strapi`, following the `scripts/diagnose-reminders.js` L23 pattern and its header warnings;
  - run on the deployed image with `fly ssh console -C "node scripts/..."`.

### 11. `scripts/reconcile-twilio-usage.js`
- Read-only, with `CRON_ENABLED=false` like the other scripts.
- Flags: `--period YYYY-MM` (default: the current UTC month) and `--max-drift 0.02`.
- **Twilio side:** fetches `client.usage.records.list({ category, startDate, endDate })` for `sms-outbound` (segments) and `mms-outbound` (messages). This is the only place outside the transport allowed to build a Twilio client; it's a read-only usage API, not a send.
- **Ledger side:** `usage.getTotals({ period })`.
- **Output:** both totals, drift = `(ledger − twilio) / twilio` for SMS and MMS, the category, direction and attribution breakdown, and the unattributed share.
- **Exit code:** `1` if |SMS drift| > `--max-drift`, otherwise `0`.
- **Known drift sources:**
  - Twilio's own opt-out and help auto-replies (STOP/START confirmations), which are billed outbound but never pass through our code;
  - sends from other systems on the same account;
  - UTC day-boundary skew.

## Compatibility and deploy

**No API contract changes.**
- Response bodies stay the same for `POST /sms-campaigns/sms/group` (an array of phones), `POST /volunteer-days/sms/:id`, `POST /weekly-schedules/:id/send` (`{success, sent}`), and `POST /api/sms` (the same TwiML).
- No new public or authenticated routes, and no permission seeding.
- So there is no frontend skew window.

**Behavior deltas, all intended:**

| Environment | Change |
|---|---|
| test, and local dev (the worktree `.env` has `ENVIRONMENT=test`) | sms-campaign blasts stop hitting Twilio. Today they **really send from local dev**, and tests intercept them only with the RequestClient spy |
| test, and local dev | Weekly sends in test now simulate and return phones in `sent` (they used to return `[]`) |
| test, and local dev | `handleSms` now writes simulated ledger rows |
| staging | Unchanged, including the weekly skip |
| prod | Same texts, same recipients |

Production edge cases:
- `vacation-checkin` no longer advances the counter when Twilio *rejects* the send. This matches its documented intent and its test AC13; today the rejection is unhandled, so the counter advances.
- `handleSms` with no resolvable recipient resolves `{ok:false}` instead of throwing a TypeError.
- Awaited `handleSms` calls take one Twilio round-trip longer.

**Deploy order:**
1. Deploy the backend. The `sms_usages` table is created by schema sync on boot, and the indexes are created in bootstrap. Set the Fly secret `TWILIO_WEBHOOK_URL` to the exact console URL. Leave `TWILIO_SIGNATURE_MODE` unset, which means `log`.
2. Run `node scripts/audit-org-coverage.js`. Decide Open Questions 1 and 2, and build `map.json` if you are consolidating gardens.
3. Run `backfill-garden-orgs.js` as a dry run, then with `--apply`. Re-run the audit and expect no `ORPHAN`.
4. Run `reconcile-twilio-usage.js` daily for a week and expect less than 2% drift.
5. When the logs show `[twilio-signature] ... valid=false` at zero against real traffic, run `fly secrets set TWILIO_SIGNATURE_MODE=enforce`.

**Rollback.** Reverting the code is safe. `sms_usages` stays behind, inert. Orgs created by the backfill stay; they are real data.

**Housekeeping.**
- Add `SMS_DRY_RUN`, `TWILIO_WEBHOOK_URL`, `TWILIO_SIGNATURE_MODE`, `BILLING_FREE_UNITS`, and `BILLING_MMS_UNITS` to `.env.example`.
- Commit the regenerated `types/generated/contentTypes.d.ts` (precedent: 25b1a1d).

## Risks and alternatives considered

**Strapi-specific traps.**
- **documentId versus id:** the ledger stores documentId strings for org and garden. The only numeric relation is to `user`, which has no draft & publish.
- **Draft/published rows:** the resolver prefers the published row's org and falls back to the draft's. The backfill links each version separately. The org-create middleware uses the Document Service, so publish maps the relation correctly.
- **Lifecycles:** deliberately avoided for org auto-create (see §10).
- **Garden `afterUpdate`:** the backfill's `db.query` updates on gardens trigger it (lifecycles.js L55), which refreshes the cache. That's harmless, just noisy logs.
- **Reserved names:** no `status`. The enum values avoid hyphens (`gsm7`, `ucs2`).

**Test-suite traps.**
- One Strapi instance is shared across `app.test.js`, and the resolver cache is module state. Ledger tests must call `resolver.clearCache()` in `beforeEach`. Never leave a patched `db.query('api::garden.garden')` in place: `patchQuery` restores it, but a cache filled during the patch would survive. The 5-minute TTL is too long to rely on.
- Fire-and-forget sends (sms-login, `sendTask`, etc.) now do resolver queries and a ledger insert after the request returns. With sqlite's single-connection pool these can still be in flight at teardown. `record()` swallows errors so they can't fail a test, but expect occasional "after teardown" log noise. Ledger tests on fire-and-forget paths should poll for the row (for example, retry `findMany` for up to 2 s) rather than read it once.

**Phase 2 heads-up, not a Phase 1 blocker.** The highest-volume mass sends are
classed `reminder`, so they will never be paused under "only broadcasts are blocked":
- volunteer-day cron reminders (#2), sent to every garden volunteer 7 days and 1 day before each event;
- poll reminders (#8).

The ledger records `category` and `source` per row, so Phase 2 can still choose
differently. Rows already written keep their category.

**Alternatives rejected.**
- Leaving the dry-run check in `send` instead of inside `transport.create`. Patching the transport in tests would then never be exercised, because tests always run in dry-run.
- Storing org and garden as relations. Rejected: publish churns numeric ids.
- Changing the default category for `sendSms` to `system`. That would make both existing callers' tests pass untouched, but it silently makes any future `sendSms` caller non-billable.
- A Strapi policy for the signature check. A policy returns Strapi's JSON 403 and offers less control over logging; a middleware is cleaner. Either is acceptable if the ACs hold.

**Model note.** This phase spans more than 15 files across 9 modules, plus a
data backfill. Consider splitting `tasks.md` into four slices that land in order
with green tests in between:
- 1a: segments, ledger, transport, `send` and call sites;
- 1b: the signature check;
- 1c: org coverage (middleware, audit, backfill);
- 1d: reconcile.

## Decisions (Cameron, 2026-10-16)
- **Q1 → (b).** Run the audit first. Cameron maps gardens to real orgs via `--map`. Only unmapped orphans get a one-garden org titled after the garden. The backfill is never run with `--apply` until the map is reviewed.
- **Q2 → before Phase 2.** Multi-garden operators are consolidated during the backfill (same `--map`), so the per-org free tier is fair from day one.
- **Q3 → keep.** The staging weekly skip stays exactly as today. `SMS_DRY_RUN` is not set on staging.
- **DRAFT_UNLINKED (added in breakdown, 2026-10-17) → fix.** A garden whose published row has an org but whose draft row doesn't gets its draft row linked to the same org's draft row by the backfill, so a later admin publish keeps the link.
- **Delivery:** build in the four slices 1a–1d, in order, with green tests between them.

## Open questions (resolved above, kept for the record)
1. **Backfilled and auto-created orgs become publicly visible.** The garden-vue pages listed in Current state show `organization.title` only when an org is set. Orphan gardens show nothing today; after the backfill they show their own name again. For example, "Stewarded by Franklin Verge Garden" appears on Franklin Verge Garden's page, and the same title appears in the event list and the context bar. Options:
   - (a) Accept it.
   - (b) Run the audit first and use `--map` to put gardens under real orgs with real names before applying. **This is my recommendation.**
   - (c) Create orgs with no title (hidden by every `v-if`). But they would be unidentifiable in the admin and in Phase 2's billing UI.
2. **The free tier is per org.** "One org per orphan garden" gives an operator with three gardens three 500-unit free tiers unless they are consolidated. The `--map` option exists for this. Do you want consolidation done before or after Phase 2 launches?
3. **Staging weekly skip.** `sendWeeklyMsg` skips sending on `ENVIRONMENT=stg` today. I've kept that so staging behavior doesn't change. Confirm, or drop it and set `SMS_DRY_RUN` on staging if staging should be fully dry.

## Acceptance criteria

**Segments: `countSegments`, standalone.**
- **AC1.** `countSegments('')`, `countSegments(null)` and `countSegments(undefined)` each return `{segments: 1, encoding: 'gsm7'}`.
- **AC2.** GSM-7 boundaries, all with encoding `gsm7`:
  - `'a'×160` gives 1;
  - `'a'×161` gives 2;
  - `'a'×306` gives 2;
  - `'a'×307` gives 3.
- **AC3.** Extension characters cost 2 septets:
  - `'a'×158 + '€'` gives 1 segment and `'a'×159 + '€'` gives 2;
  - for each of ``^ { } \ [ ~ ] | €``, the character ×80 gives 1 segment and ×81 gives 2.
- **AC4.** An escape sequence is never split: `'a'×152 + '€' + 'a'×152` gives 3 segments (the naive septet division would say 2).
- **AC5.** UCS-2 boundaries, all with encoding `ucs2`:
  - `'中'×70` gives 1;
  - `'中'×71` gives 2;
  - `'中'×134` gives 2;
  - `'中'×135` gives 3.
  - A single non-GSM character switches the whole message: `'a'×100 + '’'` gives `{2, 'ucs2'}`.
- **AC6.** An emoji is 2 code units and is never split:
  - `'😀'×35` gives 1 and `'😀'×36` gives 2;
  - `'中'×66 + '😀' + '中'×66` gives 3.

**Ledger schema.**
- **AC7.** `strapi.getModel('api::sms-usage.sms-usage')` exists:
  - `options.draftAndPublish === false`;
  - the attributes match §2 by name, type and enum values;
  - `user` is `manyToOne` to `plugin::users-permissions.user` with no `inversedBy`/`mappedBy`;
  - no attribute is named `status`;
  - the users-permissions user schema file is unchanged.
- **AC8.** `GET /api/sms-usages` and `GET /api/sms-usages/1` return 404 for both an anonymous and an authenticated request. The users-permissions role permission tree contains no `api::sms-usage` entries.
- **AC9.** After boot, the database has index `sms_usages_org_period_idx` on `(organization_document_id, period)` and `sms_usages_report_idx` on `(stripe_reported_at, billable)`. Running the bootstrap index step a second time doesn't throw.

**Transport and dry-run.**
- **AC10.** `isDryRun()` is true for `SMS_DRY_RUN='true'`, for `'1'`, for `ENVIRONMENT='test'`, and for `NODE_ENV='test'`. It is false when none of these is set (including `ENVIRONMENT='stg'`). A change to `process.env` takes effect on the next call without a reboot.
- **AC11.** In dry-run, `transport.create(...)` resolves `{simulated: true, sid: null}`. A jest spy on `require('twilio/lib/base/RequestClient').prototype.request` records 0 calls, and `require('twilio')` is never invoked as a constructor.
- **AC12.** Outside dry-run, with the Twilio client stubbed, `create` calls `messages.create` once with `{body, from: process.env.TWILIONUM, to}`, plus `mediaUrl` only when one was provided. Two calls reuse one client instance.
- **AC13.** Code check: `require('twilio')(` and `messages.create` appear in `src/` and `config/` only in `src/api/sms/services/transport.js`. Each module-level client in sms-campaign, volunteer-day and weekly-schedule is gone.

**`send()`.**
- **AC14.** A successful send. With `transport.create` patched to resolve `{sid: 'SM1', numSegments: '2', numMedia: '0', simulated: false}`, `send({to, body, garden, user, category: 'reminder', source: 't'})`:
  - resolves `{ok: true, sid: 'SM1', segments: 2, units: 2, blocked: false, simulated: false, error: null}`;
  - leaves exactly one new ledger row with `to_number = to`, `twilio_sid 'SM1'`, `segments 2`, `units 2`, `num_media 0`, `direction 'api'`, `category 'reminder'`, `source 't'`, `billable true`, `blocked false`, `simulated false`;
  - that row has `period` equal to the UTC `YYYY-MM` of `sent_at`, org and garden documentIds matching the garden's org, and `user` equal to the user's id.
- **AC15.** When `numSegments` is null, `'0'` or `'abc'`, `segments` equals `countSegments(body).segments`.
- **AC16.** With a `mediaUrl`, the row has `num_media 1` and `units` equal to `MMS_UNITS` (3), whatever the segment count.
- **AC17.** Billability and category normalization:
  - `category: 'system'` gives `billable false`;
  - a missing category, or `'bogus'`, is stored as `'transactional'` with `billable true`, and one `warn` log mentions the source.
- **AC18.** When the transport rejects with `{code: 21610}`:
  - no ledger row is written;
  - `send(...)` resolves `{ok: false, blocked: false, error}` carrying that error;
  - with `throwOnError: true` it rejects with the same error object.
- **AC19.** Metering never blocks delivery. With `resolver.resolveContext` patched to throw and `usage.record` patched to throw, `send` still calls `transport.create` exactly once and resolves `ok: true`.
- **AC20.** The gate seam. With `usage.canSend` patched to `{allowed: false}`, `send({..., throwOnError: true, beforeSend: spy})`:
  - resolves `{ok: false, blocked: true}` without rejecting;
  - leaves the transport spy and `beforeSend` uncalled;
  - writes one row with `blocked true`, `billable false` and `twilio_sid null`.
  - Unpatched, `canSend` returns `{allowed: true}` for every category.
- **AC21.** `beforeSend` runs after `canSend` and before `transport.create` (checked by invocation order). If `beforeSend` throws, the transport is still called and `send` resolves `ok: true`.
- **AC22.** In dry-run with the transport unpatched, `send` resolves `{ok: true, simulated: true, sid: null}` and writes a row with `simulated true` and `twilio_sid null`.
- **AC23.** Every ledger row from AC14-AC22 is returned by `strapi.documents('api::sms-usage.sms-usage').findMany({filters: {source}})`, so `publishedAt` is non-null.
- **AC24.** `send` with `user: {id: 999999}` (a user that doesn't exist) still writes its row, with `user` null.

**Resolver.**
- **AC25.** Take a garden document with draft and published rows, and an org P (published) linked on both. `resolveContext` returns `{gardenDocumentId: g.documentId, organizationDocumentId: P.documentId}` when given any of: the draft row object, the published row object, the numeric id of either row, or the documentId string.
- **AC26.** If the published row has no org and the draft row is linked to org D, the resolver returns D. A garden with no org returns `{gardenDocumentId, organizationDocumentId: null}`. With no inputs, both are null.
- **AC27.** Errors never escape. With `db.query('api::garden.garden').findMany` patched to throw, `resolveContext` resolves nulls instead of rejecting.
- **AC28.** Precedence and lazy loading:
  - explicit `garden` beats `task.garden`, which beats `event.garden`, which beats `user.activeGarden` (four gardens, four orgs);
  - `{task: {id}}` with no `garden` key resolves to that task's garden's org; `{event: {id}}` and `{user: {id}}` behave the same way.
- **AC29.** The cache:
  - resolving the same garden twice within 5 minutes runs the garden `findMany` once (spy count);
  - after `clearCache()`, or once `Date.now` advances by more than 300 s, it runs again.

**Usage.**
- **AC30.** `getUsage(org, {period})` takes rows for an org/period in every combination of billable, blocked and simulated, plus rows for another org and another period:
  - `units` and `segments` are sums over the matching rows that are billable, not blocked and not simulated;
  - `blockedCount` counts the blocked rows;
  - `{includeSimulated: true}` adds the simulated rows;
  - `{from, to}` filters on `sent_at` (from inclusive, to exclusive);
  - every value is a JS `number`.
- **AC31.** `getTotals({period})` reports `smsSegments` (rows with `num_media 0`) and `mmsCount` (rows with `num_media > 0`), both excluding simulated and blocked rows, plus correct per-category, per-direction and attributed/unattributed counts.

**Wrappers: same texts, same people.**
- **AC32.** `sendSms(to, body)` returns a Promise:
  - it resolves the `send` result;
  - it rejects when the transport rejects;
  - it resolves `{blocked: true}` when the gate blocks.
- **AC33.** `sendContactCard(to, {user})` calls the transport with `{to, body: '', mediaUrl: 'https://steward.garden/contactcard.vcf'}`. The ledger row has `category transactional`, `num_media 1`, `units 3`, and the user's active-garden org. It rejects when the transport rejects.
- **AC34.** `handleSms({task, body, type, previous, user, meta_data, garden: G, category, source})`, given a user with a phone and a task with `primary_image.url`:
  - creates exactly one `message` row whose `user, type, garden, body, garden_task, previous, meta_data` equal today's L49-59 values. In particular the message `garden` is `task?.garden || user?.activeGarden || event?.garden`, **not** `G`;
  - calls the transport once with `to = user.phoneNumber`, the same `body`, and `mediaUrl = task.primary_image.url`;
  - does not reject when the transport rejects;
  - when blocked, creates **no** `message` row.
- **AC35.** `sms-campaign sendGroupMsg([paused, optedOut, noPhone, a1, a2], copy, garden, params)`:
  - calls the transport for exactly a1 and a2, with `body === copy`;
  - returns `[a1.phoneNumber, a2.phoneNumber]`, and the campaign's `sent` is `[a1, a2]`;
  - writes exactly 2 ledger rows, both `broadcast` with `source 'sms-campaign.group'` and the garden's org;
  - creates no `message` rows.
  - If the transport rejects a1 with code 21610, a1 gets `sms_opted_out_at` set, a1 is left out of the return value and `sent`, and a1 has no ledger row.
  - If `canSend` is patched to block a1, a1 is left out with **no** `sms_opted_out_at` change and no `handleSendError` call.
- **AC36.** Volunteer-day `sendGroupMsg`:
  - from `POST /volunteer-days/sms/:id` (the `groupSms` controller), rows are `broadcast` with source `volunteer-day.group`;
  - from `cron-helper.sendVdayReminder`, rows are `reminder` with source `volunteer-day.reminder`;
  - in both cases the recipients and body match the pre-change selection (opted-out users skipped).
  - In dry-run the return value still lists every texted volunteer.
- **AC37.** `POST /weekly-schedules/:id/send`:
  - writes one `reminder` row (source `weekly-schedule`) per filled assignee, carrying the recurring task's garden org;
  - now creates the `recurring-task` sms-campaign row with that garden;
  - still returns `{success: true, sent: [...]}`.
  - With `ENVIRONMENT='stg'`, `api::sms.sms.send` is never called (the guard runs before `send`).
  - When the transport rejects the first assignee, no later assignee is sent (the old abort-on-error is preserved).
- **AC38.** Category coverage:
  - running each site from the call-site table, at minimum #1, #2 (both paths), #3, #4, #8, #9, #10, #11, #13, #16, #19, #20 and #21, produces ledger rows whose `category` and `source` match the table;
  - code check: every `handleSms`, `sendSms`, `sendContactCard` and `send` call in `src/` and `config/` passes an explicit `category` (sendContactCard's built-in default counts).
- **AC39.** `strapi.service('api::auth.sms-login').requestCode(phone)` for an eligible user (outcome `sent`) produces one ledger row (polled for up to 2 s) with `category 'system'`, `billable false`, `source 'auth.sms-login'`, and `user` equal to that user. `tests/auth/sms-login.js` passes with only the L67 and L777 expectations changed to allow the new third and fourth arguments.
- **AC40.** `sendVacationCheckIns` produces `system` rows with `billable false`. `tests/user/vacation-reminders.js` passes. Its two direct `sendSms =` assignments (L46, L193) become `patchService` calls; no assertion changes.
- **AC41.** Poll reminders (#8), `closePoll` (#9) and the RSVP alert (#10) write rows whose `organization_document_id` is the campaign's garden's org.

**TwiML reply.**
- **AC42.** `POST /api/sms` (form-encoded `From`=a known user's phone, `Body`=`smiles`) returns 200. The fixture user has `username` different from the phone and a real email, so the sign-up flow doesn't override the reply. The TwiML `<Message>` text, after XML unescaping, is "You're cute, but I'm just a bot ;)". The request leaves exactly one new ledger row with:
  - `direction 'twiml_reply'`, `category 'transactional'`, `source 'webhook.reply'`, `twilio_sid null`;
  - `to_number` = From, `user` = that user, `segments` = `countSegments(reply).segments`;
  - `organization_document_id` = the user's active garden's org;
  - `simulated` = `isDryRun()` (true in the test env).
- **AC43.** A reply that uses the media branch (L241-244) records `num_media 1` and `units 3`.
- **AC44.** `Body`=`STOP` or `START` (no reply) leaves no ledger row.
- **AC45.** For the same request, the TwiML response body is byte-for-byte the same as on the pre-change code. The comparison uses a fixed fixture for `smiles` and for an unknown-text default reply.

**Signature check.**
- **AC46.** With `TWILIO_SIGNATURE_MODE` unset and no `X-Twilio-Signature` header, `POST /api/sms` is processed normally (AC42 still holds). A warn log contains `twilio-signature` and `valid=false`, and that log line contains neither the From number nor the Body.
- **AC47.** With mode `enforce`, `TWILIO_WEBHOOK_URL='https://example.test/api/sms'`, `TWILIO_AUTH_TOKEN='tok'`, and a header computed with `require('twilio/lib/webhooks/webhooks').getExpectedTwilioSignature('tok', url, params)`, the request is processed normally. It passes even though supertest actually hits `127.0.0.1`.
- **AC48.** With mode `enforce` and a wrong or missing signature, the response is 403. The counts of users, `message` rows and ledger rows are unchanged, the transport is never called, and a spy on `SmsHelper.getUser` records 0 calls.
- **AC49.** With mode `enforce` and either `TWILIO_WEBHOOK_URL` or `TWILIO_AUTH_TOKEN` unset, the response is 403 and an error log names the missing variable. With mode `log` and the same vars unset, the request is processed and a warn log says `skipped`.
- **AC50.** Changing `TWILIO_SIGNATURE_MODE` between two requests in the same test run changes the outcome (the env is read per request).

**Org coverage.**
- **AC51.** For each of three inputs, `strapi.documents('api::garden.garden').create({data: {title: 'Coverage A', sms_slug: 'cova', ...}})` creates exactly one new organization titled `'Coverage A'`, with both a draft and a published row. The three inputs are no `organization` key, `organization: null`, and `organization: {connect: [], disconnect: []}`.
  - The garden's draft row links to that org.
  - After `publish({documentId})`, the published garden row links to the org's published row.
  - `resolveContext` returns that org.
- **AC52.** Creating a garden with `organization: <existing org documentId>` (as `tests/event/brief.js` L40-44 does), or with a non-empty connect, creates no organization.
- **AC53.** A garden create that fails (a duplicate `sms_slug`) leaves the organization count unchanged.
- **AC54.** `strapi.db.query('api::garden.garden').create` creates no organization, and `coverage.audit()` reports that garden as `ORPHAN`.
- **AC55.** `coverage.audit()` changes nothing (row counts in gardens, organizations and `gardens_organization_lnk` are the same before and after). It classifies fixture gardens correctly as `OK`, `ORPHAN`, `PUBLISHED_UNLINKED`, `MISMATCH` and `ORG_UNPUBLISHED`.
- **AC56.** Backfill:
  - `coverage.backfill({apply: false})` writes nothing and returns the planned actions;
  - `backfill({apply: true})` creates one published org per `ORPHAN`, titled exactly the garden title, and links its draft and published rows to the matching org versions;
  - a garden whose draft title differs from its published title keeps both titles unchanged, so no pending edit is published;
  - `MISMATCH` and `ORG_UNPUBLISHED` gardens are untouched;
  - a second `apply` returns zero actions;
  - `audit()` then reports no `ORPHAN`.
- **AC57.** `backfill({apply: true, map: {[g.documentId]: existingOrg.documentId}})` links `g` to `existingOrg` on both rows and creates no organization for `g`.

**Reconcile.**
- **AC58.** With the Twilio usage client stubbed to return SMS `usage: '100'` and MMS `count: '2'`, and the ledger holding 99 non-simulated SMS segments and 2 MMS rows, the reconcile core reports 1% SMS drift and 0% MMS drift and exits 0. With 90 ledger segments, it reports −10% and exits 1. It writes nothing.

**Regression.**
- **AC59.** `yarn test` passes.
  - `tests/water-morning.test.js`, `tests/tasks/crontest.js`, `tests/general/index.js`, `tests/tasks/transfer.js` and `tests/tasks/poll.js` pass **unmodified**.
  - `tests/sms-campaign-vacation.js` patches `api::sms.transport.create` instead of `RequestClient`, and its assertions on recipients and `sent` are unchanged.
  - `tests/user/registration.js` L76 expects `(phoneNumber, mockUser)`.
- **AC60.** No REST response changes shape. The JSON from `POST /api/sms-campaigns/sms/group`, `POST /api/volunteer-days/sms/:id` and `POST /api/weekly-schedules/:id/send` has the same keys and types as before.

## Verification plan

| AC | How | Where | Notes |
|---|---|---|---|
| 1-6 | Pure unit test | `tests/billing/segments.test.js` (standalone jest file, no Strapi) | Include every literal string from the ACs |
| 7 | Integration (model introspection) and `git diff --stat` on the user schema | `tests/billing/ledger.js`, required from `app.test.js` | |
| 8 | supertest, anonymous and with a JWT; read the role permission tree | `tests/billing/ledger.js` | Uses the seeded roles in the test DB |
| 9 | Introspection: sqlite `PRAGMA index_list('sms_usages')`; on pg, manual `\di sms_usages*` after deploy | ledger.js plus a manual pg check | The pg half is manual (tests run on sqlite) |
| 10-12 | Unit tests on the transport with env toggled in-test. Stub the twilio module factory with a `patch` on `require.cache`, or have the transport expose `_setClientFactory` for tests | `tests/billing/transport.js` | Restore env in `afterEach` |
| 13 | Code check (grep) | Inspector | |
| 14-24 | Integration: `patchService('api::sms.transport', 'create', ...)`, plus `patchService('api::billing.usage', 'canSend' / 'record', ...)` and `resolveContext` patches, then read ledger rows | `tests/billing/ledger.js` | Call `resolver.clearCache()` in `beforeEach`; build gardens and orgs with the Document Service so both rows exist |
| 25-29 | Integration on real draft and published rows. Patch `Date.now` for the TTL | `tests/billing/resolver.js` | |
| 30-31 | Integration: seed ledger rows directly, then assert sums and types | `tests/billing/usage.js` | Postgres number coercion is checked manually on staging, or in code review |
| 32-38, 41 | Integration: patch the transport, call services and controllers (supertest for 36 and 37 with a manager JWT), assert transport call args and ledger rows | `tests/billing/call-sites.js` | 37's stg case: set `ENVIRONMENT='stg'` inside the test, patch `send`, assert 0 calls, then restore env |
| 39-40 | The existing suites with the minimal seam edits, plus ledger polling | `tests/auth/sms-login.js`, `tests/user/vacation-reminders.js` | sms-login is fire-and-forget, so poll up to 2 s |
| 42-45 | supertest `POST /api/sms` with `type('form')`. Grant Public `api::message.message` `fetchSms` with `grantPrivileges(2, 'api::message.message', ['fetchSms'])`. For 45, run the fixture bodies on `main` once and commit the expected strings | `tests/billing/twiml.js` | Needs a seeded user with a phone and an active garden that has an org |
| 46-50 | supertest with env toggled per test. Spy on `strapi.log.warn`/`error` and on `SmsHelper.getUser` | `tests/billing/signature.js` | Restore env after each test |
| 51-57 | Integration calling `strapi.documents(...)` and `coverage.audit` / `coverage.backfill` directly. Count rows through `strapi.db.connection` | `tests/billing/org-coverage.js` | The scripts themselves are covered manually (below) |
| 58 | Unit test of the reconcile core with the Twilio usage client and `getTotals` stubbed | `tests/billing/reconcile.js` | |
| 59-60 | `yarn test`. For 60, snapshot the response keys | full suite | |
| Manual (contract-level, after deploy) | 1. `fly ssh console -C "node scripts/audit-org-coverage.js"`, then backfill dry-run, then `--apply`, then audit again. 2. Daily `node scripts/reconcile-twilio-usage.js` for 7 days, expecting less than 2% drift. 3. `fly logs \| grep twilio-signature`, expecting `valid=true` on every real inbound and zero `valid=false`, then switch to enforce. 4. Send one real broadcast to a test garden and confirm the ledger row's `twilio_sid` appears in the Twilio console with the same segment count. | Production | Cannot be unit-tested: real Twilio usage, real proxy URL, real carrier segmenting |

Backend-only feature: no UI-observable ACs. The one public-page effect (Open
Question 1) is checked manually by loading a backfilled garden's `/gardens/:slug`
page in garden-vue after `--apply`.
