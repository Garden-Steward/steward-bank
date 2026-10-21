# Tasks for Org SMS billing, Phase 1: metering foundation (from design.md)

Backend only. Every task is **[BE]** (executed by `implementer`). There is no garden-vue work in Phase 1.

Slices land **strictly in order**: 1a, then 1b, then 1c, then 1d. The test suite must be green after each slice (see "Green" below).
Inside a slice, "Parallel-safe with" means the tasks touch disjoint files and can be dispatched together.

---

## Shared rules (every brief: read this first)

1. **Worktree.** Work only in `/Users/cpres/git/gardensteward/steward-bank/.claude/worktrees/org-sms-billing` (branch `org-sms-billing`).
   - Never read from or write to `/Users/cpres/git/gardensteward/steward-bank` itself. That checkout is on another branch with uncommitted work.
   - `node_modules` in the worktree is a symlink into the main checkout. Treat it as read-only.
   - Run every command from the worktree root with absolute paths or `cd` inside the same command.
2. **Touch only the files listed in your brief.** If you think another file must change, stop and report back. Do not edit it.
3. **Do not commit.** Leave your changes in the working tree; the coordinator commits per slice.
4. **Conventions.**
   - CommonJS with `'use strict'`.
   - Strapi services use the factory form `({ strapi }) => ({ ... })` unless the brief says "plain object".
   - New code logs with `strapi.log.*` (no new `console.*`), except CLI scripts, which print with `console.log`.
   - Never log an SMS body or a phone number.
5. **Own test database per brief.** Parallel briefs share this worktree, and `tests/helpers/strapi.js` deletes the test DB on boot. Always prefix integration runs with `DATABASE_FILENAME=.tmp/test-<task-id>.db` (for example `.tmp/test-1a-4.db`). Delete your `.tmp/test-<task-id>.db*` files when you're done.
6. **Integration tests** live in `tests/billing/<name>.js`. They are loaded by `tests/billing/index.js` (Task 1a-2), which `tests/app.test.js` requires.
   - Do **not** edit `tests/app.test.js` or `tests/billing/index.js` (only Task 1a-2 creates them).
   - Wrap each file's tests in one top-level `describe('billing: <name>', ...)` so `-t 'billing: <name>'` targets it.
   - Standalone unit tests (no Strapi) are named `tests/billing/<name>.test.js`. Jest picks those up by itself; they are not listed in `index.js`.
7. **Test helpers.**
   - Stub with `patch` / `patchService` / `patchQuery` from `tests/helpers/patch.js`. The global `afterEach(restoreAll)` in `tests/app.test.js` undoes them. Never assign `strapi.service(...).x = ...` directly.
   - Use the shared fixtures in `tests/billing/helpers.js` (Task 1a-2) instead of rolling your own.
8. **Ledger tests.**
   - Call `strapi.service('api::billing.resolver').clearCache()` in `beforeEach`.
   - Fire-and-forget send paths (no `await` on `handleSms`) must be read with `pollLedger(...)`, never a single `findMany`.
9. **A sibling's half-written file.** Strapi loads every file under `src/api` on boot. If boot fails on a file outside your list, a parallel task is mid-edit: wait a minute and retry. Do not touch that file.
10. **Green.** The baseline on 54ca1e3 is: `tests/app.test.js` fully passes, and the full `NODE_ENV=test npx jest --runInBand` has exactly **one pre-existing failure**: `tests/inspection/day-sheet-inspection.test.js` › "P6: JSON keys match the API contract exactly" (an unrelated `sort_order` key). "Green" means no failures other than that one.
11. **Commands.**
    - Targeted: `DATABASE_FILENAME=.tmp/test-<id>.db NODE_ENV=test npx jest tests/app.test.js -t '<regex>'` (about 18 s).
    - Full integration regression: `DATABASE_FILENAME=.tmp/test-<id>.db NODE_ENV=test npx jest tests/app.test.js` (about 30 s).
    - Standalone: `NODE_ENV=test npx jest <file>`.
    - Syntax check: `node --check <file>`.
    - All are run from the worktree root.

---

# Slice 1a: segments, ledger, transport, `send`, and call sites

Dependency graph:

```
1a-1 (segments) ─────────────┐
1a-2 (test scaffold) ─┬─ 1a-4 (ledger schema) ── 1a-6 (usage) ─┐
                      └─ 1a-5 (resolver) ─────────────────────┤
1a-3 (transport) ────────────────────────────────────────────┴─ 1a-7 (sms.js rewrite)
1a-7 ─┬─ 1a-8  (sms-campaign)       ┐
      ├─ 1a-9  (volunteer-day) ── 1a-10 (cron-helper)
      ├─ 1a-11 (weekly-schedule)    │
      ├─ 1a-12 (garden-task, instruction)
      ├─ 1a-13 (SmsHelper)          │
      ├─ 1a-14 (message controller) │
      └─ 1a-15 (sms-login, vacation-checkin)
all ── 1a-16 (slice gate)
```

## Task 1a-1: [BE] Add `countSegments` util (pure, standalone tests)
Depends on: —
Parallel-safe with: 1a-2, 1a-3, 1a-4, 1a-5
Covers: AC1, AC2, AC3, AC4, AC5, AC6

### Files
- `src/utils/sms-segments.js`: new.
- `tests/billing/segments.test.js`: new standalone jest file (no Strapi).

### Current state
`src/utils/` already holds pure helpers, for example `src/utils/sms-opt-out.js` and `src/utils/phone.js`. Nothing counts segments today.

### Instructions
1. Create `src/utils/sms-segments.js`. It is pure CommonJS: no Strapi, no I/O.
   - Export `{ countSegments, GSM7_BASIC, GSM7_EXTENSION }`.
2. Define the character sets as `Set`s of single UTF-16 code units.
   - **`GSM7_BASIC`** is the 3GPP TS 23.038 default alphabet. Exclude ESC (0x1B). Use exactly this string:
     ```
     '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
     ```
     The backtick `` ` `` is **not** in the GSM alphabet, so a message containing it is `ucs2`. That's deliberate: it matches the standard and Twilio's real segmenting.
   - **`GSM7_EXTENSION`** is these 10 characters: `^ { } \ [ ~ ] | €` and form feed `\f`.
3. `countSegments(body)`:
   - `const text = body == null ? '' : String(body);`
   - **Encoding:** `'gsm7'` if every UTF-16 code unit (`for (let i = 0; i < text.length; i++)`) is in `GSM7_BASIC` or `GSM7_EXTENSION`. Otherwise `'ucs2'`.
   - **GSM-7:** each char costs 1 septet, or 2 if it's in `GSM7_EXTENSION`.
     - If the total is ≤ 160, return 1 segment.
     - Otherwise pack greedily into 153-septet segments: `segments = 1, used = 0`. For each char cost `c`: `if (used + c > 153) { segments++; used = 0; } used += c;`. An extension char is never split.
   - **UCS-2:**
     - If `text.length` ≤ 70, return 1 segment.
     - Otherwise iterate **code points** (`for (const ch of text)`), with cost `ch.length` (1, or 2 for a surrogate pair). Pack greedily into 67-unit segments using the same loop shape. A surrogate pair is never split.
   - The minimum is 1: `countSegments('')` is `{ segments: 1, encoding: 'gsm7' }`.
   - Return `{ segments, encoding }`.
   - No Smart Encoding substitution.
4. Write `tests/billing/segments.test.js` with every literal from AC1–AC6, using `'x'.repeat(n)` to build the strings:
   - **AC1:** `''`, `null`, `undefined` each give `{segments: 1, encoding: 'gsm7'}`.
   - **AC2:** `'a'` ×160→1, ×161→2, ×306→2, ×307→3, all `gsm7`.
   - **AC3:** `'a'×158+'€'`→1 and `'a'×159+'€'`→2. For each of ``^ { } \ [ ~ ] | €``: ×80→1 and ×81→2 (`it.each`).
   - **AC4:** `'a'×152+'€'+'a'×152`→3.
   - **AC5:** `'中'` ×70→1, ×71→2, ×134→2, ×135→3, all `ucs2`; `'a'×100+'’'` → `{segments: 2, encoding: 'ucs2'}`.
   - **AC6:** `'😀'` ×35→1, ×36→2; `'中'×66+'😀'+'中'×66`→3.
   - Extra: one backtick → `ucs2`, and `'\f'` → `gsm7`.

### Done when
- `node --check src/utils/sms-segments.js` passes.
- `NODE_ENV=test npx jest tests/billing/segments.test.js` passes.

---

## Task 1a-2: [BE] Create the billing integration-test scaffold
Depends on: —
Parallel-safe with: 1a-1, 1a-3
Covers: infrastructure for AC7–AC57 integration tests (no AC on its own)

### Files
- `tests/billing/index.js`: new.
- `tests/billing/helpers.js`: new.
- `tests/app.test.js`: append one line.

### Current state
`tests/app.test.js` boots one Strapi instance and `require`s each module. It ends with:
```js
require('./garden/full-pii');
require('./auth/sms-login');
require('./project-alert');
```
Templates for fixtures:
- `tests/event/brief.js` L19-50: Document Service org and garden with `status: 'published'`.
- `tests/tasks/user-tasks.http.js` L18-61: users, `grantPrivileges`, and `jwt.issue`.

### Instructions
1. Append `require('./billing');` as the **last** line of `tests/app.test.js`. Change nothing else in that file.
2. Create `tests/billing/index.js`. It requires the billing modules in this fixed order, skipping any file that doesn't exist yet (later tasks create them):
   ```js
   'use strict';
   const fs = require('fs');
   const path = require('path');
   // Fixed order. org-coverage must stay last: it runs a DB-wide backfill.
   const ORDER = ['ledger', 'resolver', 'usage', 'send',
     'cs-campaign', 'cs-vday', 'cs-cron', 'cs-weekly', 'cs-tasks', 'cs-sms-helper', 'twiml', 'cs-system',
     'signature', 'org-create', 'org-coverage'];
   for (const name of ORDER) {
     if (fs.existsSync(path.join(__dirname, `${name}.js`))) require(`./${name}`);
   }
   ```
3. Create `tests/billing/helpers.js`. Export the following, with exactly these names and behavior. All functions use the global `strapi` at call time.
   - `UID`: `{ ORG: 'api::organization.organization', GARDEN: 'api::garden.garden', USER: 'plugin::users-permissions.user', LEDGER: 'api::sms-usage.sms-usage', TASK: 'api::garden-task.garden-task', EVENT: 'api::volunteer-day.volunteer-day', MESSAGE: 'api::message.message', CAMPAIGN: 'api::sms-campaign.sms-campaign' }`.
   - `uniq(prefix)`: returns `` `${prefix}-${Date.now().toString(36)}-${++seq}` `` (module-level `seq`).
   - `uniqPhone()`: returns `'+1415' + String(5550000 + ++phoneSeq).padStart(7, '0')`. Only billing tests use the `+1415` prefix.
   - `http()`: returns `request(strapi.server.httpServer)` (supertest).
   - `issueJwt(user)`: returns `strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id })`.
   - `gardenRows(documentId)`:
     - Runs `strapi.db.query(UID.GARDEN).findMany({ where: { documentId }, populate: { organization: { select: ['id', 'documentId', 'publishedAt'] } } })`.
     - Returns `{ draft, published }`: the row with `publishedAt` null and the row with it set (`null` when absent).
   - `makeOrg({ title = uniq('Billing Org'), publish = true } = {})`:
     - Runs `strapi.documents(UID.ORG).create({ data: { title }, ...(publish && { status: 'published' }) })`.
     - Then reads its rows with `strapi.db.query(UID.ORG).findMany({ where: { documentId }, select: ['id', 'publishedAt'] })`.
     - Returns `{ documentId, title, draftId, publishedId }` (`publishedId` is null when not published).
   - `makeGarden({ title = uniq('Billing Garden'), sms_slug = uniq('bill'), organization = null, publish = true } = {})`:
     - Runs `strapi.documents(UID.GARDEN).create({ data: { title, sms_slug, ...(organization && { organization }) }, ...(publish && { status: 'published' }) })`.
     - **If `organization` is falsy**, then for every row of that document run `strapi.db.query(UID.GARDEN).update({ where: { id: row.id }, data: { organization: null } })`. That guarantees an org-less garden even after Slice 1c's auto-org middleware lands.
     - Returns `{ documentId, title, sms_slug, ...await gardenRows(documentId) }`.
   - `makeUser(overrides = {})`:
     - Runs `strapi.db.query(UID.USER).create({ data: { username: uniq('billing-user'), email: `${uniq('billing')}@example.com`, provider: 'local', confirmed: true, firstName: 'Bill', lastName: 'Ing', phoneNumber: uniqPhone(), role: <id of the role with type 'authenticated'>, ...overrides } })`.
     - Returns the row.
   - `ledgerFind(filters = {})`: returns `strapi.documents(UID.LEDGER).findMany({ filters, populate: ['user'], sort: 'id:asc' })`. It reads through the Document Service on purpose: rows with a null `publishedAt` would be invisible, which is what AC23 checks.
   - `pollLedger(filters, { count = 1, timeoutMs = 2000, intervalMs = 50 } = {})`:
     - Re-runs `ledgerFind(filters)` until `rows.length >= count` or the timeout passes.
     - Returns the last `rows` (it does not throw on timeout).
   - `ledgerCount(where = {})`: returns `strapi.db.query(UID.LEDGER).count({ where })`.
   - `setEnv(vars)`:
     - For each key, remembers the old value and sets the new one (`undefined` means `delete process.env[key]`).
     - Returns `restore()`, which puts every key back (deleting keys that were unset).
   - `stubTransport(impl)`:
     - Runs `patchService('api::sms.transport', 'create', jest.fn(impl || (async () => ({ sid: 'SMstub', numSegments: '1', numMedia: '0', simulated: false }))))`.
     - Returns the `jest.fn`.
   - `clearResolver()`: runs `strapi.service('api::billing.resolver')?.clearCache?.()`.
   - Require `supertest` and `../helpers/patch` at the top.

### Done when
- `node --check` passes on `tests/billing/index.js` and `tests/billing/helpers.js`.
- `DATABASE_FILENAME=.tmp/test-1a-2.db NODE_ENV=test npx jest tests/app.test.js` passes, with the same tests as the baseline. No billing modules exist yet, so `index.js` loads nothing.

---

## Task 1a-3: [BE] Add the SMS transport `api::sms.transport` (standalone tests)
Depends on: —
Parallel-safe with: 1a-1, 1a-2, 1a-4, 1a-5
Covers: AC10, AC11, AC12 (and the transport half of AC13)

### Files
- `src/api/sms/services/transport.js`: new. This registers `api::sms.transport`.
- `tests/billing/transport.test.js`: new standalone jest file (no Strapi).

### Current state
`src/api/sms/services/sms.js` is a **plain-object** service (`module.exports = { sendSms, handleSms, handleVoice, sendContactCard }`). Strapi registers every file in `services/` as `api::sms.<filename>`. Today four places build Twilio clients: sms.js L7 and L22, plus module load in three blast services. In twilio 3.84.1, `require('twilio')(undefined, undefined)` throws "username is required" (verified).

### Instructions
1. Create `src/api/sms/services/transport.js` as a **plain object** (no factory, no `strapi` usage, no logging). That lets the standalone test `require` it directly.
   ```js
   'use strict';
   const defaultFactory = (accountSid, authToken) => require('twilio')(accountSid, authToken);
   let clientFactory = defaultFactory;
   let client = null;
   const isDryRun = () => {
     const flag = process.env.SMS_DRY_RUN;
     return flag === 'true' || flag === '1' || process.env.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test';
   };
   const getClient = () => {
     if (!client) client = clientFactory(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
     return client;
   };
   const create = async ({ to, body, mediaUrl } = {}) => {
     if (isDryRun()) return { sid: null, numSegments: null, numMedia: null, simulated: true };
     const msg = await getClient().messages.create({ body, from: process.env.TWILIONUM, to, ...(mediaUrl && { mediaUrl }) });
     return { sid: msg.sid, numSegments: msg.numSegments, numMedia: msg.numMedia, simulated: false };
   };
   // Test seam: swap the client factory; null restores the real one. Always drops the memoized client.
   const _setClientFactory = (fn) => { clientFactory = fn || defaultFactory; client = null; };
   module.exports = { isDryRun, create, _setClientFactory };
   ```
   - Env is read on every call. Do not capture `process.env` at module load.
   - Twilio's rejection propagates untouched, with `err.code` preserved.
   - `ENVIRONMENT === 'stg'` is deliberately **not** dry-run (Decision Q3).
2. Write `tests/billing/transport.test.js`, standalone, with `const transport = require('../../src/api/sms/services/transport');`.
   - In `beforeEach`, snapshot `SMS_DRY_RUN`, `ENVIRONMENT`, `NODE_ENV`, `TWILIONUM`. In `afterEach`, **first** restore env, **then** call `transport._setClientFactory(null)`.
   - **AC10:**
     - `isDryRun()` is true for each of `SMS_DRY_RUN='true'`, `SMS_DRY_RUN='1'`, `ENVIRONMENT='test'`, `NODE_ENV='test'` (each alone, with the other two non-test).
     - It is false with `SMS_DRY_RUN` deleted, `ENVIRONMENT='stg'`, `NODE_ENV='production'`.
     - It is false with all three unset.
     - Flipping `process.env.SMS_DRY_RUN` between two calls changes the result.
   - **AC11:**
     - In dry-run, with `const factory = jest.fn(); transport._setClientFactory(factory);` and `jest.spyOn(require('twilio/lib/base/RequestClient').prototype, 'request')`, `await transport.create({ to: '+15550000001', body: 'hi' })` returns `{ sid: null, numSegments: null, numMedia: null, simulated: true }`.
     - `factory` and the `request` spy each record 0 calls.
     - Restore the spy.
     - Repeat once with the default factory (`_setClientFactory(null)`) and assert the spy still records 0 calls.
   - **AC12:**
     - Install a fake factory **before** flipping env: `fakeCreate = jest.fn().mockResolvedValue({ sid: 'SM1', numSegments: '1', numMedia: '0' })`, `factory = jest.fn(() => ({ messages: { create: fakeCreate } }))`.
     - Then set `SMS_DRY_RUN` deleted, `ENVIRONMENT='prod'`, `NODE_ENV='production'`, `TWILIONUM='+15550009999'`.
     - Assert:
       - `create({to, body})` calls `fakeCreate` once with exactly `{ body, from: '+15550009999', to }`, with no `mediaUrl` key;
       - with `mediaUrl: 'https://x.test/a.jpg'`, the call includes `mediaUrl`;
       - after two `create` calls, `factory` was called once (memoized);
       - when `fakeCreate` rejects with `Object.assign(new Error('unsub'), { code: 21610 })`, `create` rejects with **the same object** (`rejects.toBe(err)`);
       - the resolved value is `{ sid: 'SM1', numSegments: '1', numMedia: '0', simulated: false }`.

### Done when
- `node --check src/api/sms/services/transport.js` passes.
- `NODE_ENV=test npx jest tests/billing/transport.test.js` passes.
- `grep -rn "require('twilio')(" src/api/sms/services/transport.js` shows exactly one hit (the default factory).

---

## Task 1a-4: [BE] Add the ledger content type `api::sms-usage.sms-usage` and `config/billing.js`
Depends on: 1a-2
Parallel-safe with: 1a-1, 1a-3, 1a-5
Covers: AC7, AC8

### Files
- `src/api/sms-usage/content-types/sms-usage/schema.json`: new. Create **no** `routes/`, `controllers/`, or `services/` directory under `src/api/sms-usage/`.
- `config/billing.js`: new.
- `.env.example`: add 3 vars.
- `types/generated/contentTypes.d.ts`: regenerated.
- `tests/billing/ledger.js`: new.

### Current state
- Strapi loads an API directory with only `content-types/` fine (`@strapi/core/dist/loaders/apis.js` `loadAPI`). Without a controller or route file there are no REST endpoints and no users-permissions actions.
- `config/` files load as namespaces (`billing` is not a restricted name), so `strapi.config.get('billing')` works.
- The committed `types/generated/contentTypes.d.ts` is **already stale** on main (missing `ApiProjectAlertProjectAlert` and garden `visit_info` from #54/#57). Regenerating will also add those. That is expected; keep them.
- Precedent for a `draftAndPublish: false` type: `src/api/project-alert/content-types/project-alert/schema.json`.

### Instructions
1. Create `schema.json`:
   ```json
   {
     "kind": "collectionType",
     "collectionName": "sms_usages",
     "info": { "singularName": "sms-usage", "pluralName": "sms-usages", "displayName": "SMS Usage", "description": "Outbound SMS/MMS ledger, one row per message Twilio accepted (or simulated/blocked)." },
     "options": { "draftAndPublish": false },
     "pluginOptions": {},
     "attributes": {
       "organization_document_id": { "type": "string" },
       "garden_document_id": { "type": "string" },
       "user": { "type": "relation", "relation": "manyToOne", "target": "plugin::users-permissions.user" },
       "to_number": { "type": "string" },
       "twilio_sid": { "type": "string" },
       "source": { "type": "string" },
       "period": { "type": "string", "required": true },
       "segments": { "type": "integer", "required": true },
       "num_media": { "type": "integer", "default": 0 },
       "units": { "type": "integer", "required": true },
       "encoding": { "type": "enumeration", "enum": ["gsm7", "ucs2"] },
       "direction": { "type": "enumeration", "enum": ["api", "twiml_reply"], "required": true },
       "category": { "type": "enumeration", "enum": ["broadcast", "reminder", "transactional", "system"], "required": true },
       "sent_at": { "type": "datetime", "required": true },
       "billable": { "type": "boolean", "default": true },
       "blocked": { "type": "boolean", "default": false },
       "simulated": { "type": "boolean", "default": false },
       "stripe_reported_at": { "type": "datetime" },
       "stripe_batch_id": { "type": "string" }
     }
   }
   ```
   - The `user` relation has **no** `inversedBy`/`mappedBy`. Do not touch `src/extensions/users-permissions/content-types/user/schema.json`.
   - No `indexes` key (indexes come from Task 1a-6).
2. Create `config/billing.js`:
   ```js
   'use strict';
   // Phase 1 reads only MMS_UNITS. The rest is inert until Phase 2/3.
   module.exports = ({ env }) => ({
     FREE_UNITS: env.int('BILLING_FREE_UNITS', 500),
     WARN_PCT: 0.8,
     GRACE_PCT: 0,
     MMS_UNITS: env.int('BILLING_MMS_UNITS', 3),
     BLOCKABLE: ['broadcast'],
     plans: { standard: { includedUnits: 1500, baseFeeCents: 2000, overageCentsPerUnit: 2 } },
     stripe: { priceBase: env('STRIPE_PRICE_BASE'), priceMetered: env('STRIPE_PRICE_METERED'), meterEvent: env('STRIPE_METER_EVENT') },
   });
   ```
3. In `.env.example`, add this after the `# --- SMS (Twilio) ---` block:
   ```
   # Never call Twilio; sends are simulated and still metered ('true' or '1'). ENVIRONMENT=test / NODE_ENV=test imply it.
   SMS_DRY_RUN=
   # --- Billing (config/billing.js) ---
   BILLING_FREE_UNITS=500
   BILLING_MMS_UNITS=3
   ```
4. Regenerate types:
   - Run `NODE_ENV=test timeout 120 npx strapi ts:generate-types --silent; true`. The command writes the file and then hangs, so the `timeout` is needed.
   - Confirm that `git diff --stat types/` touches only `types/generated/contentTypes.d.ts` and that the diff adds `ApiSmsUsageSmsUsage` (plus the stale project-alert/visit_info catch-up).
5. Create `tests/billing/ledger.js` with `describe('billing: ledger', ...)`:
   - **AC7:** `const model = strapi.getModel('api::sms-usage.sms-usage')`.
     - It is defined, with `model.options.draftAndPublish === false` and `model.collectionName === 'sms_usages'`.
     - Every attribute from the table above exists with the right `type`. Enum attributes have exactly the listed `enum` arrays.
     - `model.attributes.user` has `relation 'manyToOne'`, `target 'plugin::users-permissions.user'`, and neither `inversedBy` nor `mappedBy`.
     - `model.attributes.status` is undefined.
   - **AC8:**
     - `GET /api/sms-usages` and `GET /api/sms-usages/1` return 404 anonymously.
     - They also return 404 with `Authorization: Bearer <issueJwt(await makeUser())>`.
     - For role ids 1 and 2, `(await strapi.plugin('users-permissions').service('role').findOne(id)).permissions['api::sms-usage']` is `undefined`.
   - Use the helpers from `tests/billing/helpers.js`.

### Done when
- `node --check config/billing.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-4.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: ledger'` passes.
- `DATABASE_FILENAME=.tmp/test-1a-4.db NODE_ENV=test npx jest tests/app.test.js` is green.
- `git diff --quiet 54ca1e3 -- src/extensions/users-permissions/content-types/user/schema.json` exits 0 (the user schema file is unchanged, per AC7).

---

## Task 1a-5: [BE] Add the attribution resolver `api::billing.resolver`
Depends on: 1a-2
Parallel-safe with: 1a-1, 1a-3, 1a-4
Covers: AC25, AC26, AC27, AC28, AC29

### Files
- `src/api/billing/services/resolver.js`: new. The new API dir `src/api/billing/` has only `services/`.
- `tests/billing/resolver.js`: new.

### Current state
- Gardens and orgs are draft & publish: each document has a draft row and a published row with different numeric ids. Garden→org is `manyToOne` (`organization`).
- Relation keys used for lazy loading:
  - `api::garden-task.garden-task`.`garden`;
  - `api::volunteer-day.volunteer-day`.`garden`;
  - `plugin::users-permissions.user`.`activeGarden`.
- Callers pass partially loaded objects, for example a task whose `garden` key is absent (`updateGardenTaskUser` populate, garden-task.js L198), or `task: false` (instruction/controllers/helper.js L83-86).

### Instructions
1. `src/api/billing/services/resolver.js`, factory form. The cache is **module state** (outside the factory):
   ```js
   const TTL_MS = 5 * 60 * 1000;
   const NULLS = () => ({ gardenDocumentId: null, organizationDocumentId: null });
   const orgByGardenDoc = new Map();   // gardenDocumentId -> { value: orgDocId|null, expiresAt }
   const docByGardenRow = new Map();   // garden row id (number) -> { value: gardenDocumentId, expiresAt }
   ```
   Cache reads check `Date.now() < expiresAt`. Writes set `expiresAt = Date.now() + TTL_MS`.
2. Export `resolveContext({ garden, user, task, event } = {})` and `clearCache()`, where `clearCache` empties both maps.
3. `resolveContext` wraps everything in try/catch. On any error it logs `strapi.log.error('[billing.resolver] ' + err.message)` and returns `NULLS()`. It never rejects.
4. **Pick the garden reference.** The first source that yields a value wins.
   - A value "yields" when it is not `undefined`, `null`, `false`, or `''`.
   - Steps:
     1. `garden`, if present.
     2. `task`: if `task` is an object and `Object.prototype.hasOwnProperty.call(task, 'garden')`, use `task.garden` if present, otherwise move on. If the key is **absent** and `task.id != null`, load the relation:
        `strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: task.id }, select: ['id'], populate: { garden: { select: ['id', 'documentId'] } } })` and use `row?.garden`.
     3. `event`: same rule, using `api::volunteer-day.volunteer-day` and key `garden`.
     4. `user`: same rule, using `plugin::users-permissions.user` and key `activeGarden`.
   - If nothing yields, return `NULLS()`.
5. **Normalize the reference to a garden documentId.**
   - An object with `documentId` uses it.
   - An object with `id`, a number, or a string matching `/^\d+$/` is a **row id**. Look in `docByGardenRow` first. Otherwise run `strapi.db.query('api::garden.garden').findOne({ where: { id: Number(id) }, select: ['documentId'] })` and cache the result.
   - Any other string is the documentId itself.
   - If no documentId results, return `NULLS()`.
6. **Find the organization.**
   - Look in `orgByGardenDoc` first.
   - Otherwise run `strapi.db.query('api::garden.garden').findMany({ where: { documentId }, select: ['id', 'documentId', 'publishedAt'], populate: { organization: { select: ['documentId'] } } })`.
   - `published = rows.find(r => r.publishedAt)`, `draft = rows.find(r => !r.publishedAt)`.
   - `org = published?.organization?.documentId || draft?.organization?.documentId || null`.
   - Cache `org` (including null).
7. Return `{ gardenDocumentId: documentId, organizationDocumentId: org }`.
8. Write `tests/billing/resolver.js` with `describe('billing: resolver', ...)`. Use `makeOrg`/`makeGarden`/`gardenRows`/`makeUser` from the helpers, with `beforeEach(clearResolver)` and `afterEach(clearResolver)`.
   - **AC25:**
     - Fixture: `P = makeOrg()` and `g = makeGarden({ organization: P.documentId })`, which gives both rows linked to P.
     - `resolveContext({ garden: X })` returns `{ gardenDocumentId: g.documentId, organizationDocumentId: P.documentId }` for X = `g.draft`, `g.published`, `g.draft.id`, `g.published.id`, `String(g.published.id)`, and `g.documentId`.
   - **AC26:**
     - Draft linked to D, published unlinked: `makeGarden({ organization: D.documentId })`, then `strapi.db.query(UID.GARDEN).update({ where: { id: g.published.id }, data: { organization: null } })`. Expect D.
     - `makeGarden({ organization: null })` gives `{ gardenDocumentId, organizationDocumentId: null }`.
     - `resolveContext({})` gives both null.
   - **AC27:** `patchQuery('api::garden.garden', 'findMany', jest.fn().mockRejectedValue(new Error('boom')))` → `resolveContext({ garden: g.documentId })` resolves both null (`resolves.toEqual`).
   - **AC28:**
     - Precedence: four gardens with four orgs, for example `resolveContext({ garden: g1.published, task: { garden: g2.published }, event: { garden: g3.published }, user: { activeGarden: g4.published } })` gives g1's org. Drop keys one by one and expect g2, then g3, then g4.
     - Lazy load: create a real garden-task row (`strapi.db.query(UID.TASK).create({ data: { title: uniq('t'), garden: g2.published.id, publishedAt: new Date() } })`) and resolve `{ task: { id: task.id } }`, which gives g2's org.
     - Event: `strapi.documents(UID.EVENT).create({ data: { title: uniq('e'), garden: g3.documentId, startDatetime: new Date().toISOString(), canceled: false, disabled: false }, status: 'published' })` and resolve `{ event: { id: <published row id> } }` to get g3's org.
     - User: `makeUser({ activeGarden: g4.published.id })` and resolve `{ user: { id: u.id } }` to get g4's org.
   - **AC29:**
     - Wrap the real `findMany` in a counting spy:
       ```js
       const repo = strapi.db.query(UID.GARDEN);
       const real = repo.findMany;
       const spy = patchQuery(UID.GARDEN, 'findMany', jest.fn((...a) => real.apply(repo, a)));
       ```
     - Resolving the same garden twice gives `spy` 1 call.
     - After `clearCache()` and resolving again, 2 calls.
     - Then `const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 301000)`, resolve again: 3 calls. Call `nowSpy.mockRestore()` in a `finally`.
     - Call `clearResolver()` at the end.

### Done when
- `node --check src/api/billing/services/resolver.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-5.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: resolver'` passes.
- The full `tests/app.test.js` run with the same DB prefix is green.

---

## Task 1a-6: [BE] Add the usage service `api::billing.usage` and the bootstrap ledger indexes
Depends on: 1a-4
Parallel-safe with: 1a-1, 1a-3, 1a-5
Covers: AC9, AC30, AC31, AC20 (last bullet: unpatched `canSend` always allows)

### Files
- `src/api/billing/services/usage.js`: new.
- `src/index.js`: add one bootstrap step.
- `tests/billing/usage.js`: new.

### Current state
`src/index.js` `bootstrap` (L78-117) runs `strapi.documents.use(...)` (slug middleware), `subscribeWelcomeEmailOnEmailSet`, two try/catch steps, Sentry, and then the garden cache in try/catch. The raw-SQL precedent with metadata column names is `src/api/auth/services/sms-login.js` L36-45 (`userColumns`).

On sqlite, knex's better-sqlite3 client binds a JS `Date` as epoch ms and a boolean as 0/1, the same as Strapi stores them. **Always pass `Date` objects and booleans** into knex where clauses, never ISO strings.

### Instructions
1. `src/api/billing/services/usage.js`, factory form, `const UID = 'api::sms-usage.sms-usage';`. Add a private helper:
   ```js
   const cols = () => {
     const meta = strapi.db.metadata.get(UID);
     const c = (a) => meta.attributes[a].columnName;
     return { table: meta.tableName, c };
   };
   ```
   and a logger that survives teardown:
   ```js
   const logError = (m) => { try { strapi.log.error(m); } catch (e) { console.error(m); } };
   ```
2. **`async record(row)`** never throws.
   - Build `data`:
     - `sentAt = row.sent_at ? new Date(row.sent_at) : new Date()`;
     - `period = row.period ?? sentAt.toISOString().slice(0, 7)`;
     - copy `organization_document_id`, `garden_document_id`, `to_number`, `twilio_sid`, `source`, `encoding` (each `?? null`), plus `segments`, `units`, `direction`, `category`;
     - `num_media = row.num_media ?? 0`;
     - `sent_at = sentAt.toISOString()`;
     - `billable = row.billable ?? true`, `blocked = row.blocked ?? false`, `simulated = row.simulated ?? false`;
     - include the `user` key **only** when `row.user != null`.
   - `try { return await strapi.documents(UID).create({ data }); }`.
   - On error: if `data.user != null`, retry once with `user` removed. On final failure, `logError('[billing.usage] record failed: ' + err.message)` and return `null`.
3. **`async getUsage(organizationDocumentId, window = {}, { includeSimulated = false } = {})`** returns `{ units, segments, blockedCount }` as JS numbers.
   - Base query: `knex(table)`, with `organization_document_id` equal to the arg (or `whereNull` when it is null).
   - Window: if `window.period`, use `where(period, window.period)`. Else if `window.from && window.to`, use `where(sent_at, '>=', new Date(window.from)).where(sent_at, '<', new Date(window.to))`. Else throw `new Error('getUsage: pass {period} or {from, to}')`.
   - Sums: `.clone().where(billable, true).where(blocked, false)`, plus `.where(simulated, false)` unless `includeSimulated`, then `.sum({ units: c('units') }).sum({ segments: c('segments') }).first()`.
   - `blockedCount`: `.clone().where(blocked, true).count({ n: '*' }).first()`. It applies the window but no simulated filter.
   - Coerce with `Number(x) || 0`, since Postgres returns SUM/COUNT as strings.
4. **`async getTotals({ period })`**. The base filter is `period = ?`, `simulated = false`, `blocked = false` (all rows, billable or not, since Twilio bills both). Return:
   ```
   { period,
     smsSegments,            // sum(segments) where num_media = 0
     mmsCount,               // count(*) where num_media > 0
     byCategory:  { [category]:  { rows, segments, units } },   // groupBy category
     byDirection: { [direction]: { rows, segments, units } },   // groupBy direction
     attributed:   { rows, segments, units },                   // organization_document_id not null
     unattributed: { rows, segments, units } }                  // organization_document_id null
   ```
   All values are numbers. Missing groups are simply absent from `byCategory`/`byDirection`, while `attributed`/`unattributed` are always present (zeros allowed).
5. **`async canSend(organizationDocumentId, category, units)`** returns `{ allowed: true, remaining: null, reason: null }`. This is the Phase 1 stub and Phase 2 seam. Add a comment saying so.
6. **`async ensureIndexes()`**:
   ```js
   const { table, c } = cols(); const knex = strapi.db.connection;
   await knex.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (??, ??)', ['sms_usages_org_period_idx', table, c('organization_document_id'), c('period')]);
   await knex.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (??, ??)', ['sms_usages_report_idx', table, c('stripe_reported_at'), c('billable')]);
   ```
7. In `src/index.js` `bootstrap`, after the volunteer-day `backfillDrafts` try/catch block (after L105), add:
   ```js
   // Ledger indexes (CREATE INDEX IF NOT EXISTS). Never blocks boot.
   try {
     await strapi.service('api::billing.usage').ensureIndexes();
   } catch (err) {
     strapi.log.error('[bootstrap] sms_usages index step failed:', err);
   }
   ```
8. Write `tests/billing/usage.js` with `describe('billing: usage', ...)`. Seed rows with `strapi.service('api::billing.usage').record({...})`, using unique fake org strings (`uniq('org-usage')`) and **far-future periods** so platform-wide totals are isolated: `'2031-01'` for AC30 and `'2031-03'` for AC31.
   - **AC30:**
     - For org X with `period '2031-01'`, write 8 rows covering every `(billable, blocked, simulated)` combination. Give them distinct powers of two for `units` (1, 2, 4, … 128) and `segments` = units×10.
     - Add a row for org Y in 2031-01 and a row for org X in 2031-02.
     - Assert:
       - `getUsage(X, {period:'2031-01'})` sums only the `(true, false, false)` row;
       - `blockedCount` = 4;
       - `{includeSimulated: true}` adds the `(true, false, true)` row;
       - `{from: '2031-01-10T00:00:00Z', to: '2031-01-20T00:00:00Z'}` filters on `sent_at` (seed rows at 01-05, 01-10, and 01-20 to prove from-inclusive and to-exclusive);
       - `typeof` of each value is `'number'`.
   - **AC31:** in 2031-03, seed:
     - SMS rows (`num_media 0`) and MMS rows (`num_media 1`), plus simulated and blocked rows that must be excluded;
     - two categories, both directions;
     - attributed and unattributed rows.

     Assert the exact `getTotals({ period: '2031-03' })` object.
   - **AC9** (sqlite):
     - `strapi.db.connection.raw("PRAGMA index_list('sms_usages')")` includes both names.
     - `PRAGMA index_info('sms_usages_org_period_idx')` columns are `['organization_document_id', 'period']` in order. Do the same check for the report index.
     - `await expect(strapi.service('api::billing.usage').ensureIndexes()).resolves.not.toThrow()` (second run).
   - **AC20 (last bullet):** `canSend('x', c, 5)` deep-equals `{ allowed: true, remaining: null, reason: null }` for all 4 categories.
   - `record` retry: `record({ ...validRow, user: 999999 })` returns a row, and `ledgerFind({ source })` shows `user` null.

### Done when
- `node --check` passes on `src/api/billing/services/usage.js` and `src/index.js`.
- `DATABASE_FILENAME=.tmp/test-1a-6.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: usage'` passes.
- The full `tests/app.test.js` run is green.

---

## Task 1a-7: [BE] Rewrite `api::sms.sms` around a metered `send()`
Depends on: 1a-1, 1a-3, 1a-4, 1a-5, 1a-6
Parallel-safe with: — (everything after depends on it)
Covers: AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC32, AC33, AC34

### Files
- `src/api/sms/services/sms.js`: rewrite.
- `tests/billing/send.js`: new.

### Current state
`src/api/sms/services/sms.js` (whole file, 83 lines):
- L1 `VoiceResponse` require;
- L2-4 env constants;
- `sendContactCard(toNum)` (L6-20): builds a client, test-gates on `ENVIRONMENT=='test'`, and returns `client.messages.create({ body: '', from, to, mediaUrl: 'https://steward.garden/contactcard.vcf' })`;
- `sendSms(toNum, body, mediaUrl)` (L21-39): builds a client, test-gates, and does **not** return the promise;
- `handleSms(params)` (L42-67), which today does:
  ```js
  let {task, body, type, previous, user, meta_data, event} = params
  let member = (!user && task && task.volunteers?.length) ? task.volunteers[0] : user
  try {
    await strapi.db.query('api::message.message').create({
      data: { user:member, type, garden: task?.garden || user?.activeGarden || event?.garden, body, garden_task: task, previous, meta_data }
    });
  } catch(err) { console.error('Problem logging message. ', err); }
  if (process.env.ENVIRONMENT == 'test') { return }
  let mediaUrl = task?.primary_image ? task.primary_image.url : null;
  sendSms(member.phoneNumber, body, mediaUrl);
  ```
- `handleVoice()` (L69-76): unchanged;
- exports `{ sendSms, handleSms, handleVoice, sendContactCard }`.

### Instructions
1. Keep it a **plain-object** service using the global `strapi`. Every cross-service call is looked up at call time:
   - `strapi.service('api::sms.transport')`;
   - `strapi.service('api::billing.resolver')`;
   - `strapi.service('api::billing.usage')`.

   Wrappers call `strapi.service('api::sms.sms').send(...)`, never a local `send`, so patching `send` intercepts everything. Delete the `accountSid`/`authToken`/`twilioNum` constants and every `console.log` in the file. Keep L1 (`VoiceResponse`) and `handleVoice` byte-for-byte.
2. Top of file:
   ```js
   const { countSegments } = require('../../../utils/sms-segments');
   const VALID_CATEGORIES = ['broadcast', 'reminder', 'transactional', 'system'];
   const CONTACT_CARD_URL = 'https://steward.garden/contactcard.vcf';
   const NULL_CTX = { gardenDocumentId: null, organizationDocumentId: null };
   const log = (level, msg) => { try { strapi.log[level](msg); } catch (e) { console.error(msg); } };
   const countMedia = (mediaUrl) => (Array.isArray(mediaUrl) ? mediaUrl.length : (mediaUrl ? 1 : 0));
   const mmsUnits = () => strapi.config.get('billing.MMS_UNITS', 3);
   ```
3. Implement `send(opts)`, with these parameters and steps **in this order**:
   ```js
   const send = async function ({ to, body, mediaUrl, garden, user, task, event, category, source, billable, throwOnError = false, beforeSend } = {}) {
     const transport = strapi.service('api::sms.transport');
     // 1. category + estimate
     let cat = category;
     if (!VALID_CATEGORIES.includes(cat)) {
       log('warn', `[sms] send: category "${cat}" is missing or unknown (source=${source || 'unknown'}); recording as transactional`);
       cat = 'transactional';
     }
     const { segments: estSegments, encoding } = countSegments(body);
     const numMedia = countMedia(mediaUrl);
     const MMS = mmsUnits();
     let segments = estSegments;
     let units = numMedia > 0 ? MMS : segments;
     // 2. attribution (never blocks)
     let ctx = NULL_CTX;
     try { ctx = (await strapi.service('api::billing.resolver').resolveContext({ garden, user, task, event })) || NULL_CTX; }
     catch (err) { log('error', `[sms] resolveContext failed source=${source || 'unknown'}: ${err && err.message}`); }
     const base = {
       organization_document_id: ctx.organizationDocumentId, garden_document_id: ctx.gardenDocumentId,
       user: user?.id ?? null, to_number: to ?? null, source: source ?? null,
       num_media: numMedia, encoding, direction: 'api', category: cat,
     };
     const write = async (row) => {
       try { await strapi.service('api::billing.usage').record(row); }
       catch (err) { log('error', `[sms] ledger write failed source=${source || 'unknown'}: ${err && err.message}`); }
     };
     // 3. gate (fail open)
     let gate = { allowed: true };
     try { gate = (await strapi.service('api::billing.usage').canSend(ctx.organizationDocumentId, cat, units)) || { allowed: true }; }
     catch (err) { log('error', `[sms] canSend failed source=${source || 'unknown'}: ${err && err.message}`); gate = { allowed: true }; }
     if (gate.allowed === false) {
       const simulated = transport.isDryRun();
       await write({ ...base, segments, units, twilio_sid: null, billable: false, blocked: true, simulated });
       return { ok: false, sid: null, segments, units, blocked: true, simulated, error: null };   // never throws, even with throwOnError
     }
     // 4. beforeSend
     if (typeof beforeSend === 'function') {
       try { await beforeSend(); } catch (err) { log('error', `[sms] beforeSend failed source=${source || 'unknown'}: ${err && err.message}`); }
     }
     // 5. network
     let msg;
     try { msg = await transport.create({ to, body, mediaUrl }); }
     catch (err) {
       log('warn', `[sms] send failed source=${source || 'unknown'} code=${err && err.code}`);
       if (throwOnError) throw err;
       return { ok: false, sid: null, segments, units, blocked: false, simulated: false, error: err };
     }
     // 6. final segments
     const n = parseInt(msg && msg.numSegments, 10);
     if (Number.isFinite(n) && n > 0) segments = n;
     if (numMedia === 0) units = segments;
     // 7. ledger (period/sent_at defaulted by usage.record)
     const simulated = msg?.simulated === true;
     await write({ ...base, segments, units, twilio_sid: msg?.sid ?? null, billable: billable ?? (cat !== 'system'), blocked: false, simulated });
     // 8.
     return { ok: true, sid: msg?.sid ?? null, segments, units, blocked: false, simulated, error: null };
   };
   ```
   `send` adds no input validation (a missing `to` still goes to the transport).
4. Wrappers:
   ```js
   const sendSms = function (toNum, body, mediaUrl, opts = {}) {
     return strapi.service('api::sms.sms').send({ to: toNum, body, mediaUrl, ...opts, throwOnError: opts.throwOnError ?? true });
   };
   const sendContactCard = function (toNum, opts = {}) {
     return strapi.service('api::sms.sms').send({ to: toNum, body: '', mediaUrl: CONTACT_CARD_URL, category: 'transactional', source: 'sms.contact-card', ...opts, throwOnError: true });
   };
   const handleSms = async function (params = {}) {
     const { task, body, type, previous, user, meta_data, event, garden, category, source } = params;
     const member = (!user && task && task.volunteers?.length) ? task.volunteers[0] : user;
     return strapi.service('api::sms.sms').send({
       to: member?.phoneNumber, body, mediaUrl: task?.primary_image?.url || null,
       garden, task, event, user: member, category, source, throwOnError: false,
       beforeSend: async () => {
         try {
           await strapi.db.query('api::message.message').create({
             data: { user: member, type, garden: task?.garden || user?.activeGarden || event?.garden, body, garden_task: task, previous, meta_data },
           });
         } catch (err) {
           log('error', `Problem logging message. ${err && err.message}`);
         }
       },
     });
   };
   const recordTwimlReply = async function ({ to, body, mediaCount = 0, garden, user, task, source = 'webhook.reply' } = {}) {
     try {
       const ctx = (await strapi.service('api::billing.resolver').resolveContext({ garden, user, task })) || NULL_CTX;
       const { segments, encoding } = countSegments(body);
       return await strapi.service('api::billing.usage').record({
         organization_document_id: ctx.organizationDocumentId, garden_document_id: ctx.gardenDocumentId,
         user: user?.id ?? null, to_number: to ?? null, twilio_sid: null, source,
         segments, num_media: mediaCount, units: mediaCount > 0 ? mmsUnits() : segments, encoding,
         direction: 'twiml_reply', category: 'transactional', billable: true, blocked: false,
         simulated: strapi.service('api::sms.transport').isDryRun(),
       });
     } catch (err) {
       log('error', `[sms] recordTwimlReply failed: ${err && err.message}`);
       return null;
     }
   };
   ```
   The message-row `data` is the same as today's L49-59. Its `garden` is **not** `params.garden`.
5. `module.exports = { send, sendSms, handleSms, recordTwimlReply, handleVoice, sendContactCard };`
6. Write `tests/billing/send.js` with `describe('billing: send', ...)` and `beforeEach(clearResolver)`.
   - Fixtures:
     - `org = makeOrg()`, `g = makeGarden({ organization: org.documentId })`;
     - `u = makeUser({ activeGarden: g.published.id })`;
     - `const sms = () => strapi.service('api::sms.sms')`.
   - Read rows with `ledgerFind({ source })` and a unique `source` per test (`uniq('t')`). That also proves AC23 for every row.
   - **AC14:**
     - `stubTransport(async () => ({ sid: 'SM1', numSegments: '2', numMedia: '0', simulated: false }))`.
     - `sms().send({ to: u.phoneNumber, body: 'hello', garden: g.published, user: u, category: 'reminder', source })` deep-equals `{ ok: true, sid: 'SM1', segments: 2, units: 2, blocked: false, simulated: false, error: null }`.
     - Exactly 1 row, with:
       - `to_number`, `twilio_sid 'SM1'`, `segments 2`, `units 2`, `num_media 0`;
       - `direction 'api'`, `category 'reminder'`, `source`;
       - `billable true`, `blocked false`, `simulated false`;
       - `period === sent_at.slice(0, 7)` (`sent_at` comes back as an ISO string);
       - `organization_document_id === org.documentId`, `garden_document_id === g.documentId`, `user.id === u.id`.
   - **AC15:** for `numSegments` `null`, `'0'`, `'abc'`, with body `'a'.repeat(200)`: the result and the row have `segments 2`.
   - **AC16:** `mediaUrl: 'https://example.test/a.jpg'` with a body of `'a'.repeat(400)` gives row `num_media 1`, `units 3`.
   - **AC17:**
     - `category: 'system'` gives `billable false`.
     - With `const warn = patch(strapi.log, 'warn', jest.fn())`, a missing category gives `category 'transactional'` and `billable true`. Exactly one `warn` call whose message contains `source`. Repeat with `'bogus'`.
   - **AC18:**
     - `const err = Object.assign(new Error('unsub'), { code: 21610 })` and `stubTransport(async () => { throw err; })`.
     - `send(...)` resolves with `ok false`, `blocked false`, `error === err`, and leaves 0 rows.
     - With `throwOnError: true`, `rejects.toBe(err)`.
   - **AC19:**
     - Patch `resolveContext` with `patchService('api::billing.resolver', 'resolveContext', jest.fn().mockRejectedValue(new Error('x')))`. Patch `api::billing.usage` `record` the same way.
     - The transport stub is called once, and the result has `ok: true`.
   - **AC20:**
     - `patchService('api::billing.usage', 'canSend', jest.fn().mockResolvedValue({ allowed: false }))`, with `beforeSend: jest.fn()` and `throwOnError: true`.
     - It resolves `ok false` and `blocked true`. The transport stub and `beforeSend` record 0 calls.
     - 1 row with `blocked true`, `billable false`, `twilio_sid null`.
   - **AC21:**
     - Collect a shared `order` array from wrapped `canSend` (returns `{allowed: true}`), `beforeSend`, and the transport stub. Expect `['canSend', 'beforeSend', 'transport']`.
     - When `beforeSend` throws, the transport is still called and the result has `ok: true`.
   - **AC22:**
     - No transport stub (the test env is dry-run).
     - The result has `ok: true`, `simulated: true`, `sid: null`.
     - The row has `simulated true` and `twilio_sid null`.
   - **AC24:** `user: { id: 999999 }` still gives 1 row, with `user` null.
   - **AC32:**
     - `sms().sendSms(to, 'hi', undefined, { category: 'system', source })` returns something with `typeof p.then === 'function'`. It resolves to the `send` result.
     - It rejects when the transport rejects.
     - It resolves `{ blocked: true }` when `canSend` blocks.
   - **AC33:**
     - `sms().sendContactCard(u.phoneNumber, { user: { id: u.id } })` calls the stub with `{ to: u.phoneNumber, body: '', mediaUrl: 'https://steward.garden/contactcard.vcf' }`.
     - The row (source `'sms.contact-card'`; filter also by `to_number`) has `category 'transactional'`, `num_media 1`, `units 3`, and `organization_document_id === org.documentId`. The org comes via the lazy-loaded `activeGarden`.
     - It rejects when the transport rejects.
   - **AC34:**
     - Create a real task: `strapi.db.query(UID.TASK).create({ data: { title: uniq('task'), garden: g.published.id, publishedAt: new Date() } })`. Reload it with `populate: ['garden']`, then set `task.primary_image = { url: 'https://example.test/t.jpg' }` in JS.
     - Let `G` be a second garden.
     - `handleSms({ task, body, type: 'question', previous: 'p', user: u, meta_data: { k: 1 }, garden: G.published, category: 'reminder', source })` should:
       - create exactly 1 `api::message.message` row for `u` with `type 'question'`, `garden` = **g's** row (not G), `body`, `garden_task` = task, `previous 'p'`, and `meta_data {k:1}` (populate `['user', 'garden', 'garden_task']`);
       - call the transport once with `{ to: u.phoneNumber, body, mediaUrl: 'https://example.test/t.jpg' }`.
     - With a rejecting transport, `handleSms` resolves (not rejects).
     - With `canSend` blocking, there is no new message row.

### Done when
- `node --check src/api/sms/services/sms.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-7.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: send'` passes.
- The **full** `tests/app.test.js` run is green. Existing callers are unchanged in this task: `sms-login`, `vacation-reminders`, `registration`, `transfer`, `poll`, and `sms-campaign-vacation` must all still pass.
- `NODE_ENV=test npx jest tests/water-morning.test.js` passes.

---

## Task 1a-8: [BE] Meter the sms-campaign sends (#1, #8, #9, #10) and move the vacation test to the transport seam
Depends on: 1a-7
Parallel-safe with: 1a-9, 1a-11, 1a-12, 1a-13, 1a-14, 1a-15
Covers: AC35, AC41, AC38 (sites #1, #8, #9, #10), AC59 (the `tests/sms-campaign-vacation.js` bullet), AC60 (`POST /api/sms-campaigns/sms/group`), AC13 (the sms-campaign client)

### Files
- `src/api/sms-campaign/services/sms-campaign.js`
- `tests/sms-campaign-vacation.js`
- `tests/billing/cs-campaign.js`: new.

### Current state
`src/api/sms-campaign/services/sms-campaign.js`:
- L18-21:
  ```js
  const accountSid = process.env.TWILIO_ACCOUNT_SID ;
  const authToken = process.env.TWILIO_AUTH_TOKEN  ;
  const twilioNum =process.env.TWILIONUM;
  const client = require('twilio')(accountSid, authToken);
  ```
- L51, `getLatestCampaign` populate: `{sent: true, confirmed: true, volunteer_day: true, sender: true, option_a: true, option_b: true, option_c: true, option_d: true}`.
- L204, `sendPollReminders` populate: `{ sent: true, option_a: true, option_b: true, option_c: true, option_d: true }`. At L225-231 it calls `handleSms({ task: null, body: smsBody, type: 'followup', previous: null, user })`.
- L336-342, `closePoll`: `handleSms({ task: null, body: smsBody, type: 'followup', previous: null, user: campaign.sender })`. The campaign is populated with `garden: true` at L280.
- L369-384, `sendGroupMsg` loop:
  ```js
  for (const volunteer of activeGroup) {
    if (!volunteer.phoneNumber) { continue; }
    try {
      await client.messages.create({ body: copy, from: twilioNum, to: volunteer.phoneNumber });
      sentInfo.push(volunteer.phoneNumber);
      sentUsers.push(volunteer);
    } catch (err) {
      await SmsOptOut.handleSendError(volunteer, err);
      continue;
    }
  }
  ```
- L418-426, `sendRSVPAlert`: un-awaited `handleSms({ task: null, body: ..., type: 'followup', previous: null, user: campaign.sender })`.
- L430-458: a commented-out `sendGardenInterestMsg` that references `client`/`twilioNum`.

`tests/sms-campaign-vacation.js`:
- L3-4: `const RequestClient = require('twilio/lib/base/RequestClient');` plus a comment.
- L62-72 `stubTwilio()`: `jest.spyOn(RequestClient.prototype, 'request')` in `beforeEach`, `mockRestore` in `afterEach`.
- It asserts on `twilioSpy` at L113 and L138.

### Instructions
1. `sms-campaign.js`:
   - Delete L18-21 (keep the `SmsOptOut` require on L22).
   - Delete the commented-out `sendGardenInterestMsg` block (L430-458). It references the removed client and would trip the AC13 code check.
   - Replace the `try` body in the `sendGroupMsg` loop:
     ```js
     const r = await strapi.service('api::sms.sms').send({
       to: volunteer.phoneNumber, body: copy, garden: gardenObj, user: volunteer,
       category: 'broadcast', source: 'sms-campaign.group', throwOnError: true,
     });
     if (r.blocked) { continue; }   // gate said no: not sent, not an opt-out, no handleSendError
     sentInfo.push(volunteer.phoneNumber);
     sentUsers.push(volunteer);
     ```
     Keep the existing `catch` (it still calls `SmsOptOut.handleSendError`).
   - `getLatestCampaign` populate: add `garden: true`.
   - `sendPollReminders` populate: add `garden: true`. Add `garden: campaign.garden, category: 'reminder', source: 'poll.reminder'` to its `handleSms` params.
   - `closePoll`: add `garden: campaign.garden, category: 'transactional', source: 'poll.close'`.
   - `sendRSVPAlert`: add `garden: campaign.garden, category: 'transactional', source: 'campaign.rsvp-alert'` (it stays un-awaited).
   - Change nothing else. No response shapes change.
2. `tests/sms-campaign-vacation.js`:
   - Remove L3-4. Add `const { patchService } = require('./helpers/patch');`.
   - Replace `stubTwilio` with:
     ```js
     // Stub Twilio at the transport: every send goes through api::sms.transport.create.
     // patchService is undone by the global afterEach in app.test.js.
     let twilioSpy;
     const stubTwilio = () => {
       beforeEach(() => {
         twilioSpy = patchService('api::sms.transport', 'create',
           jest.fn().mockResolvedValue({ sid: 'SMtest123', numSegments: '1', numMedia: '0', simulated: false }));
       });
     };
     ```
   - Update the comment block above it to say the stub sits at the transport.
   - **Do not change any assertion.**
3. `tests/billing/cs-campaign.js` with `describe('billing: cs-campaign', ...)` and `beforeEach(clearResolver)`. Fixtures: org plus a garden linked to it (`gardenRow = g.published`).
   - **AC35:**
     - Users:
       - `paused = makeUser({ paused: true })`;
       - `optedOut = makeUser({ sms_opted_out_at: new Date() })`;
       - `noPhone = makeUser({ phoneNumber: null })`;
       - `a1`, `a2`.
     - Stub the transport.
     - `strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg([paused, optedOut, noPhone, a1, a2], copy, gardenRow, { type: 'alert', sender: a1.id, alert: false })`, with `copy = uniq('copy')`, should:
       - call the stub exactly for a1 and a2 (in that order), each with `body === copy`;
       - return `[a1.phoneNumber, a2.phoneNumber]`;
       - write a campaign `sent` that maps to `[a1.id, a2.id]` (look it up as `tests/sms-campaign-vacation.js` L115-121 does);
       - leave exactly 2 ledger rows with `source 'sms-campaign.group'` for those `to_number`s, both `category 'broadcast'` with `organization_document_id === org.documentId`;
       - write no new `api::message.message` rows for a1/a2 (compare `strapi.db.query(UID.MESSAGE).count({ where: { user: { id: { $in: [a1.id, a2.id] } } } })` before and after).
     - **21610 case:** the stub rejects for `a1.phoneNumber` with `{ code: 21610 }` and resolves for a2.
       - a1's row now has `sms_opted_out_at` set.
       - The return value and `sent` hold a2 only.
       - There is no ledger row for a1.
     - **Blocked case:**
       - `patchService('api::billing.usage', 'canSend', jest.fn().mockResolvedValueOnce({ allowed: false }).mockResolvedValue({ allowed: true, remaining: null, reason: null }))` (a1 is sent first).
       - `patch(require('../../src/utils/sms-opt-out'), 'handleSendError', jest.fn())`.
       - a1 is left out and `handleSendError` records 0 calls. a1's `sms_opted_out_at` is still null.
   - **AC41 / AC38 #8, #9, #10:** create campaign rows with `strapi.db.query(UID.CAMPAIGN).create`, using `garden: gardenRow.id`.
     - **#8:**
       - Create a `{ type: 'poll', send_reminder: true, reminder_sent: null, closes_at: new Date(Date.now() + 24*3600*1000), sent: [voter.id] }` campaign (no votes) and call `sendPollReminders()`.
       - The row for `voter.phoneNumber` with `source 'poll.reminder'` has `category 'reminder'` and `organization_document_id === org.documentId`.
     - **#9:**
       - Create a poll `{ type: 'poll', sender: sender.id, poll_options: [{ label: 'a', text_option: 'x' }], option_a: [voter.id] }` and call `closePoll(campaign.id)`.
       - The row for `sender.phoneNumber` with `source 'poll.close'` has `category 'transactional'` and the org.
     - **#10:**
       - Create a `{ type: 'rsvp', alert: true, sender: sender.id, sent: [rsvper.id], confirmed: [] }` campaign.
       - `const c = await svc.getLatestCampaign(rsvper, ['rsvp'])`. Assert `c.garden.id === gardenRow.id` (this proves the populate).
       - `await svc.sendRSVPAlert(rsvper, c)`, then `pollLedger({ source: 'campaign.rsvp-alert', to_number: sender.phoneNumber })`. Expect `category 'transactional'` and the org.
   - **AC60:**
     - `await grantPrivileges(1, 'api::sms-campaign.sms-campaign', ['groupSms'])` (from `../helpers/strapi`).
     - `POST /api/sms-campaigns/sms/group` with a manager JWT and body `{ body: copy, interest: 'Everyone', garden: gardenRow.id, type: 'alert', sender: manager.id, alert: false }` returns 200.
     - `res.body` is an array whose elements are all strings (phone numbers).

### Done when
- `node --check src/api/sms-campaign/services/sms-campaign.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-8.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-campaign|sms-campaign vacation|closePoll|sendPollReminders|recordPollVote|handlePollResponse'` passes.
- The full `tests/app.test.js` run is green.
- `grep -n "require('twilio')\|client\.\|twilioNum" src/api/sms-campaign/services/sms-campaign.js` finds nothing.

---

## Task 1a-9: [BE] Meter the volunteer-day sends (#2 broadcast path, #15, #16)
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-11, 1a-12, 1a-13, 1a-14, 1a-15
Covers: AC36 (the `POST /volunteer-days/sms/:id` path and the dry-run return), AC38 (sites #2-broadcast, #15, #16), AC60 (`POST /api/volunteer-days/sms/:id`), AC13 (the volunteer-day client)

### Files
- `src/api/volunteer-day/services/volunteer-day.js`
- `src/api/volunteer-day/controllers/volunteer-day.js`: L552 only.
- `src/api/volunteer-day/controllers/VdayHelper.js`: `sendMessage` only.
- `src/api/volunteer-day/services/helper.js`
- `tests/billing/cs-vday.js`: new.

### Current state
- `volunteer-day.js` L1-6:
  ```js
  'use strict';
  const accountSid = process.env.TWILIO_ACCOUNT_SID ;
  const authToken = process.env.TWILIO_AUTH_TOKEN  ;
  const twilioNum =process.env.TWILIONUM;
  const client = require('twilio')(accountSid, authToken);
  const SmsOptOut = require('../../../utils/sms-opt-out');
  ```
- `sendGroupMsg(vDay, copy)` (L119-165). Its loop (L132-153):
  ```js
  for (const volunteer of volGroup) {
    if (SmsOptOut.isOptedOut(volunteer)) { continue; }
    try {
      if (process.env.NODE_ENV === 'test') {
        console.log("sending to ", volunteer.phoneNumber, copy);
      } else {
        await client.messages.create({ body: copy, from: twilioNum, to: volunteer.phoneNumber });
      }
      sentInfo.push(volunteer.phoneNumber);
      sentUsers.push(volunteer);
    } catch (err) {
      await SmsOptOut.handleSendError(volunteer, err);
      continue;
    }
  }
  ```
- Controller L551-554:
  ```js
  const copy = VdayHelper.buildUpcomingDayCopy(vDay);
  const sentInfo = strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy);
  return  sentInfo;
  ```
  `findSmsDay` (L16-24) populates `['garden', 'garden.volunteers']` and accepts a numeric id or a published documentId.
- `VdayHelper.js` L169-171: `VdayHelper.sendMessage = (vDay, copy) => { return strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy); }`. It has no callers.
- `services/helper.js`:
  - `inviteUserEvent` L13-19: `handleSms({ user: {phoneNumber: data.phoneNumber}, meta_data: {...}, body, type: 'registration', event: data.event })`.
  - `rsvpEvent` L43-49: `handleSms({ meta_data: {...}, body: ..., type: 'reply', event: event, user: data.user })`. Here `event` is reloaded at L24-29 **without** garden, but `data.event` (from the controller, L494-507) has its garden populated.
- `tests/event/messages.js` L47 calls `sendGroupMsg(newEvent.id, copy)` with a **number** and doesn't await. That must keep working.

### Instructions
1. `volunteer-day.js`:
   - Delete L2-5 (keep `'use strict'` and the `SmsOptOut` require).
   - Change the signature to `async sendGroupMsg(vDay, copy, opts = {})`. Replace the `try` body:
     ```js
     const r = await strapi.service('api::sms.sms').send({
       to: volunteer.phoneNumber, body: copy, garden: vDay?.garden, user: volunteer,
       category: opts.category, source: opts.source, throwOnError: true,
     });
     if (r.blocked) { continue; }
     sentInfo.push(volunteer.phoneNumber);
     sentUsers.push(volunteer);
     ```
     - The `NODE_ENV` branch is gone: the transport's dry-run replaces it, and dry-run results still count as sent.
     - There is deliberately **no default** category. Both callers pass one, and an untagged call falls to Principle 4 (transactional plus a warn).
     - Keep the `catch` and everything after the loop unchanged.
2. Controller L552: `sendGroupMsg(vDay, copy, { category: 'broadcast', source: 'volunteer-day.group' })`.
3. `VdayHelper.sendMessage = (vDay, copy, opts = {}) => strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay, copy, opts);`
4. `services/helper.js`:
   - `inviteUserEvent`: add `category: 'transactional', source: 'event.invite'`.
   - `rsvpEvent`: add `garden: data.event?.garden, category: 'transactional', source: 'event.rsvp'`.
5. `tests/billing/cs-vday.js` with `describe('billing: cs-vday', ...)`.
   - Fixtures:
     - an org and a garden linked to it;
     - volunteers `v1`, `v2`, and `vOpt` (`sms_opted_out_at: new Date()`), each made with `makeUser({ gardens: [g.published.id] })`;
     - a published event: `strapi.documents(UID.EVENT).create({ data: { title: uniq('Vday'), garden: g.documentId, startDatetime: new Date(Date.now() + 7*86400000).toISOString(), canceled: false, disabled: false }, status: 'published' })` (template: `tests/event/brief.js` L19-22).
     - `grantPrivileges(1, 'api::volunteer-day.volunteer-day', ['groupSms'])` and a JWT for an authenticated user.
   - **AC36 group path:**
     - Stub the transport.
     - `POST /api/volunteer-days/sms/${event.documentId}` returns 200.
     - The body is an array of strings equal (as a set) to `[v1.phoneNumber, v2.phoneNumber]`, without `vOpt`.
     - The transport stub was called for exactly those, with `body === VdayHelper.buildUpcomingDayCopy(<event>)`. Compare with the stub's `body` argument rather than recomputing.
     - Each has a row with `source 'volunteer-day.group'`, `category 'broadcast'`, and the org.
   - **AC36 dry-run:** with no stub, the same POST still returns both phones.
   - **AC38 #16:**
     - `require('../../src/api/volunteer-day/services/helper').rsvpEvent(<published event row id>, { event: <event row populated with garden>, user: v1, userId: v1.id })`.
     - The row with `source 'event.rsvp'` for `v1.phoneNumber` has `category 'transactional'` and the org.
   - **AC60:** in the stubbed POST above, assert `Array.isArray(res.body)` and that every element is a string.

### Done when
- `node --check` passes on all 4 source files.
- `DATABASE_FILENAME=.tmp/test-1a-9.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-vday|sendGroupMsg|getRSVPs|Send correct copy'` passes.
- The full `tests/app.test.js` run is green.
- `grep -n "require('twilio')\|client\.\|twilioNum\|NODE_ENV" src/api/volunteer-day/services/volunteer-day.js` finds nothing.

---

## Task 1a-10: [BE] Meter the cron-helper sends (#2 reminder path, #4, #5)
Depends on: 1a-9 (the volunteer-day `sendGroupMsg` must accept `opts`)
Parallel-safe with: 1a-8, 1a-11, 1a-12, 1a-13, 1a-14, 1a-15
Covers: AC36 (the cron path), AC38 (sites #2-reminder, #4, #5)

### Files
- `config/helpers/cron-helper.js`
- `tests/billing/cs-cron.js`: new.

### Current state
`config/helpers/cron-helper.js`:
- L116 in `sendVdayReminder(vDay, copy)`: `const sent = await strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay, copy);`
- L280-285 in `sendWaterSms`: `await strapi.service('api::sms.sms').handleSms({ task: waterTask, body: Helper.buildWaterBody(waterTask), type: 'question' });`
- L293-297: `strapi.service('api::sms.sms').handleSms({ task: waterTask, body: `Hi ... don't worry about watering today! ...`, type: 'notification' });`
- L570-574, L576-580, L583-587 in `handleStartedTasks`: three `handleSms({ task, body: ..., type: 'question'|'followup' })` calls.
- `tests/water-morning.test.js` L127 and `tests/tasks/crontest.js` L73 replace `global.strapi` with `{ service: () => ({ handleSms }) }`. They **must pass unmodified**, so only add keys to the existing param objects.

### Instructions
1. L116: `sendGroupMsg(vDay, copy, { category: 'reminder', source: 'volunteer-day.reminder' })`.
2. L280 handleSms params: add `category: 'reminder', source: 'cron.water'`.
3. L293 handleSms params: add `category: 'reminder', source: 'cron.water-skip'`.
4. L570, L576, L583 handleSms params: add `category: 'reminder', source: 'cron.started-followup'`.
5. Change nothing else.
6. `tests/billing/cs-cron.js` with `describe('billing: cs-cron', ...)`:
   - **AC36 cron path:**
     - Same fixture style as `tests/billing/cs-vday.js` (org, garden, `v1`, `v2`, `vOpt`, published event).
     - Load the event the way the cron does: `strapi.db.query(UID.EVENT).findOne({ where: { documentId: ev.documentId, publishedAt: { $notNull: true } }, populate: ['garden', 'garden.volunteers'] })`.
     - Stub the transport.
     - `await require('../../config/helpers/cron-helper').sendVdayReminder(vDay, 'reminder copy ' + uniq('c'))` returns both phones, without `vOpt`.
     - The rows have `source 'volunteer-day.reminder'`, `category 'reminder'`, and the org.
   - **AC38 #4:**
     - Create a garden-task with `strapi.db.query(UID.TASK).create({ data: { title: uniq('Water'), type: 'Water', task_status: 'INITIALIZED', garden: g.published.id, volunteers: [v1.id], publishedAt: new Date() } })`. Reload it with `populate: ['garden', 'volunteers']`.
     - `patch(require('../../config/helpers/weather.js'), 'getGardenWeather', jest.fn().mockResolvedValue({ water: true }))`.
     - `await Helper.sendWaterSms(task, true)`.
     - The row for `v1.phoneNumber` with `source 'cron.water'` has `category 'reminder'` and the org.

### Done when
- `node --check config/helpers/cron-helper.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-10.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-cron|crontest|cron'` passes.
- `NODE_ENV=test npx jest tests/water-morning.test.js tests/cron-helper.test.js` passes.
- The full `tests/app.test.js` run is green.
- `git diff --exit-code 54ca1e3 -- tests/water-morning.test.js tests/tasks/crontest.js` exits 0.

---

## Task 1a-11: [BE] Meter weekly-schedule sends (#3) and fix the manual-send garden populate
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-9, 1a-10, 1a-12, 1a-13, 1a-14, 1a-15
Covers: AC37, AC38 (site #3), AC60 (`POST /api/weekly-schedules/:id/send`), AC13 (the weekly-schedule client)

### Files
- `src/api/weekly-schedule/services/weekly-schedule.js`
- `src/api/weekly-schedule/controllers/weekly-schedule.js`
- `tests/billing/cs-weekly.js`: new.

### Current state
- Service L1-7:
  ```js
  'use strict';
  const accountSid = process.env.TWILIO_ACCOUNT_SID ;
  const authToken = process.env.TWILIO_AUTH_TOKEN  ;
  const { format } = require('date-fns');
  const twilioNum =process.env.TWILIONUM;
  const client = require('twilio')(accountSid, authToken);
  const weeklyScheduleHelper = require('./helper');
  ```
- `sendWeeklyMsg` L126-136:
  ```js
  for (const volunteer of filled) {
    if (['test','stg'].indexOf(process.env.ENVIRONMENT)>-1) {continue;}
    await client.messages.create({ body: copy, from: twilioNum, to: volunteer.assignee.phoneNumber });
    sentInfo.push(volunteer.assignee.phoneNumber);
  }
  ```
  Then L137-145 writes the sms-campaign with `garden: recTask.garden.id` inside a try/catch. On the manual path that throws a TypeError (garden not populated), which is swallowed.
- Controller L14-17: `findOne({ where: { documentId: id }, populate: ['assignees', 'assignees.assignee', 'recurring_task'] })`, returning `{ success: true, sent: sentInfo }`. On a throw it sets status 500 with `{ error }`.
- The cron path (`cron-helper.setWeeklySchedule`) passes a `recTask` with garden populated (recurring-task.js `getRecurringTaskGarden` populate).
- Schemas:
  - weekly-schedule `assignees` is component `scheduling.schedule-assignee` (`day` enum Sunday..Saturday, `assignee` oneToOne user);
  - `recurring_task` is oneToOne;
  - recurring-task `garden` is manyToOne;
  - all are draft & publish.

### Instructions
1. Service:
   - Delete the `accountSid`, `authToken`, `twilioNum`, and `client` lines (keep the `format` and `helper` requires).
   - Replace the loop:
     ```js
     for (const volunteer of filled) {
       // Staging never texts weekly schedules (unchanged; Decision Q3). Test/dev dry-run is the transport's job.
       if (process.env.ENVIRONMENT === 'stg') { continue; }
       // throwOnError keeps today's abort-on-error: a Twilio failure stops the remaining sends.
       const r = await strapi.service('api::sms.sms').send({
         to: volunteer.assignee.phoneNumber, body: copy, garden: recTask.garden, user: volunteer.assignee,
         category: 'reminder', source: 'weekly-schedule', throwOnError: true,
       });
       if (r.blocked) { continue; }
       sentInfo.push(volunteer.assignee.phoneNumber);
     }
     ```
   - Leave the sms-campaign write as is.
2. Controller populate: `['assignees', 'assignees.assignee', 'recurring_task', 'recurring_task.garden']`. Nothing else changes.
3. `tests/billing/cs-weekly.js` with `describe('billing: cs-weekly', ...)`.
   - Fixtures:
     - an org and a garden linked to it;
     - assignees `a1`, `a2` (`makeUser`);
     - `rt = strapi.documents('api::recurring-task.recurring-task').create({ data: { title: uniq('RT'), garden: g.documentId }, status: 'published' })`;
     - `ws = strapi.documents('api::weekly-schedule.weekly-schedule').create({ data: { Week: uniq('Week'), recurring_task: rt.documentId, assignees: [{ day: 'Monday', assignee: a1.id }, { day: 'Tuesday', assignee: a2.id }, { day: 'Wednesday' }] } })` (template: `createWeeklySchedule`, service L51-58);
     - `grantPrivileges(1, 'api::weekly-schedule.weekly-schedule', ['send'])` and a JWT.
   - **AC37 / AC60:**
     - Stub the transport.
     - `POST /api/weekly-schedules/${ws.documentId}/send` returns 200.
     - `Object.keys(res.body).sort()` equals `['sent', 'success']`, with `success === true` and `sent` an array of strings equal to `[a1.phoneNumber, a2.phoneNumber]`.
     - Each has a row with `source 'weekly-schedule'`, `category 'reminder'`, and the org.
     - A new `api::sms-campaign.sms-campaign` row with `type 'recurring-task'` and the copy exists, and its `garden` is set (query `populate: ['garden']`, matching on `body` containing the RT title).
   - **Staging:**
     - `const restore = setEnv({ ENVIRONMENT: 'stg' })` and `const sendSpy = patchService('api::sms.sms', 'send', jest.fn())`.
     - POST again. `sendSpy` records 0 calls.
     - `restore()` in a `finally`.
   - **Abort-on-error:**
     - The stub rejects on the first call with `{ code: 30003 }`.
     - POST. The stub was called exactly once (a2 is never attempted).

### Done when
- `node --check` passes on both source files.
- `DATABASE_FILENAME=.tmp/test-1a-11.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-weekly'` passes.
- The full `tests/app.test.js` run is green.
- `grep -n "require('twilio')\|client\.\|twilioNum" src/api/weekly-schedule/services/weekly-schedule.js` finds nothing.

---

## Task 1a-12: [BE] Tag garden-task and instruction sends (#6, #7, #14, #17)
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-9, 1a-10, 1a-11, 1a-13, 1a-14, 1a-15
Covers: AC38 (sites #6, #7, #14, #17: code check, plus a runtime check of #6)

### Files
- `src/api/garden-task/services/garden-task.js`: `sendTask` only.
- `src/api/garden-task/services/helper.js`: `inviteUserTask` only.
- `src/api/instruction/services/instruction.js`: `managePendingTask` only.
- `src/api/instruction/controllers/helper.js`: `requestApproval` only.
- `tests/billing/cs-tasks.js`: new.

### Current state
- `garden-task.js` L362-367, `sendTask`: `strapi.service('api::sms.sms').handleSms({ task: task, body: `Hi ... OPTIONS.`, type: 'question' });` (fire-and-forget).
- `garden-task/services/helper.js` L29-39, `inviteUserTask`: `handleSms({ user: { phoneNumber: data.phoneNumber }, meta_data: {...}, body, type: 'registration', task: data.task })`. `const garden = data.task.garden;` is at L12.
- `instruction.js` L52-57, `managePendingTask`: `handleSms({ task: task, body: `Hi ... ${instruction.slug}?u=${user.id}`, type: 'question' })`.
- `instruction/controllers/helper.js` L85-95, `requestApproval`: `handleSms({ task: gardenTask, body: ..., type: 'question', previous: 'Phone Number submission via Garden Steward', user, meta_data: { instructionId: instruction.id } })`. `gardenTask` may be `false`; the resolver handles that.

### Instructions
1. Add keys only. Leave all other params untouched:
   - #6 `sendTask`: `category: 'reminder', source: 'garden-task.send-task'`.
   - #17 `inviteUserTask`: `garden: data.task.garden, category: 'transactional', source: 'task.invite'`.
   - #7 `managePendingTask`: `category: 'reminder', source: 'instruction.pending'`.
   - #14 `requestApproval`: `category: 'transactional', source: 'instruction.request-approval'`.
2. `tests/billing/cs-tasks.js` with `describe('billing: cs-tasks', ...)`. **#6:**
   - Use an org, a garden, and volunteer `v` (`makeUser`).
   - Create a task with `strapi.db.query(UID.TASK).create({ data: { title: uniq('Task'), type: 'Weeding', task_status: 'INITIALIZED', garden: g.published.id, volunteers: [v.id], publishedAt: new Date() } })`, reloaded with `populate: ['garden', 'volunteers']`.
   - Call `strapi.service('api::garden-task.garden-task').sendTask(task, true)`.
   - `pollLedger({ source: 'garden-task.send-task', to_number: v.phoneNumber })` gives 1 row with `category 'reminder'` and the org.

### Done when
- `node --check` passes on the 4 source files.
- `DATABASE_FILENAME=.tmp/test-1a-12.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-tasks|approve of the instruction|getTask|skipTask'` passes.
- The full `tests/app.test.js` run is green.

---

## Task 1a-13: [BE] Tag SmsHelper relays and pass the user to the contact card (#11, #12, #13)
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-9, 1a-10, 1a-11, 1a-12, 1a-14, 1a-15
Covers: AC38 (sites #11, #12, #13), AC59 (the `tests/user/registration.js` L76 bullet)

### Files
- `src/api/message/controllers/SmsHelper.js`
- `tests/user/registration.js`: L76 only.
- `tests/billing/cs-sms-helper.js`: new.

### Current state
- `SmsHelper.js` L268-276:
  ```js
  SmsHelper.sendContactCard = async(phoneNumber) => {
    try {
      return await strapi.service('api::sms.sms').sendContactCard(phoneNumber);
    } catch (err) {
      // Never let a Twilio failure break the SMS reply the volunteer is waiting on.
      console.error('Problem sending contact card to ', phoneNumber, err);
      return null;
    }
  }
  ```
  L303 (in `saveVolunteerName`): `await SmsHelper.sendContactCard(user.phoneNumber);`
- L647-653, `passToNextVolunteer`: `handleSms({ task: updatedTask, body: smsNewGuy, type: 'question', previous: latestQuestion?.body, user: nextUser })`.
- L796-802, `transferTask`: `handleSms({ task: updatedTask, body: smsNewGuy, type: 'question', previous: latestQuestion.body, user: newUser })`.
- `tests/user/registration.js` L76: `expect(sendContactCard).toHaveBeenCalledWith(phoneNumber);`. L69 has `const mockUser = { id: 1, phoneNumber };`.

### Instructions
1. `SmsHelper.sendContactCard = async (phoneNumber, user) => { try { return await strapi.service('api::sms.sms').sendContactCard(phoneNumber, { user }); } catch ... }`. Keep the catch body as is.
2. L303: `await SmsHelper.sendContactCard(user.phoneNumber, user);`
3. L647 params: add `category: 'transactional', source: 'sms.pass'`. L796 params: add `category: 'transactional', source: 'sms.transfer'`. The resolver loads the task's garden by `updatedTask.id`.
4. `tests/user/registration.js` L76 becomes `expect(sendContactCard).toHaveBeenCalledWith(phoneNumber, mockUser);`. Change nothing else.
5. `tests/billing/cs-sms-helper.js` with `describe('billing: cs-sms-helper', ...)`, `const SmsHelper = require('../../src/api/message/controllers/SmsHelper');`, and fixtures org plus garden.
   - **#13:**
     - `u = makeUser({ activeGarden: g.published.id, gardens: [g.published.id] })` and stub the transport.
     - `SmsHelper.saveVolunteerName(u, 'billing cardholder')` returns `type 'complete'`.
     - The row with `source 'sms.contact-card'` for `u.phoneNumber` has `category 'transactional'`, `num_media 1`, `units 3`, `user.id === u.id`, and the org.
   - **#11:**
     - Make a real task (garden = g's row, with recurring task `{ id }` not needed in the DB) and users `cur`, `next` with phones.
     - `patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue({ body: 'q', type: 'question', garden_task: { id: task.id, title: task.title, recurring_task: { id: 1 } } }))`.
     - `patch(SmsHelper, 'getSchedulerFromTask', jest.fn().mockResolvedValue({ backup_volunteers: [cur, next] }))`.
     - `patchService('api::garden-task.garden-task', 'updateGardenTaskUser', jest.fn().mockResolvedValue({ id: task.id, title: task.title, recurring_task: { id: 1, instruction: null } }))`. There is **no `garden` key**, so the resolver must lazy-load it.
     - `patchService('api::instruction.instruction', 'checkInstruction', jest.fn().mockReturnValue(false))`, then stub the transport.
     - `await SmsHelper.passToNextVolunteer(cur)` produces a row with `source 'sms.pass'`, `to_number next.phoneNumber`, `category 'transactional'`, and the org.

### Done when
- `node --check src/api/message/controllers/SmsHelper.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-13.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-sms-helper|Contact card|Join Garden|Welcome email|transferTask|passToNextVolunteer|pickVolunteer|Yes Response'` passes.
- The full `tests/app.test.js` run is green.
- `git diff --exit-code 54ca1e3 -- tests/tasks/transfer.js tests/general/index.js` exits 0.

---

## Task 1a-14: [BE] Record TwiML replies and tag `requestEmail` (#18, #21)
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-9, 1a-10, 1a-11, 1a-12, 1a-13, 1a-15
Covers: AC42, AC43, AC44, AC45, AC38 (sites #18, #21)

### Files
- `src/api/message/controllers/message.js`
- `tests/billing/twiml.js`: new.

### Current state
- `message.js` L28-34, `requestEmail`: `handleSms({ task: null, body: smsBody, type: 'followup', previous: null, user })`. The user is loaded with `activeGarden` at L19-22.
- `fetchSms` (L51-253):
  - `user = await SmsHelper.getUser(phoneNumber)` (populates `gardens`, `activeGarden`);
  - `garden = await SmsHelper.checkGarden(responseText)`;
  - `smsTask = smsInfo.task` (L236).
  - L240-250:
    ```js
    if (smsBody) {
      if (smsInfo && smsInfo.task?.primary_image?.formats?.medium?.url) {
        const message = twiml.message();
        message.body(smsBody);
        message.media(smsInfo.task.primary_image.formats.medium.url);
      } else {
        twiml.message(smsBody);
      }

      await SmsHelper.saveMessage(user,smsType, garden, smsBody, smsTask, request.body.Body);
    }
    return twiml.toString();
    ```
  - `STOP`/`START` set `smsBody = null` (L134-146).
- The route is `POST /api/sms` → `message.fetchSms` (routes/message.js L22-30). It is permission-gated. In tests, grant Public with `grantPrivileges(2, 'api::message.message', ['fetchSms'])`.
- Pre-change TwiML (computed from twilio 3.84.1 on 54ca1e3; use these as the AC45 fixtures):
  - `smiles`:
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You're cute, but I'm just a bot ;)</Message></Response>`
  - unknown text (default branch):
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>I don't understand. You can always try OPTIONS to find out more things to do with our service.</Message></Response>`

### Instructions
1. `requestEmail` handleSms params: add `category: 'transactional', source: 'message.request-email'`.
2. In `fetchSms`, inside `if (smsBody) { ... }`:
   - Declare `let mediaCount = 0;` before the inner `if`, and set `mediaCount = 1;` inside the media branch. Keep the twiml calls exactly as they are.
   - After the `saveMessage` line, add:
     ```js
     // Meter the TwiML reply (Twilio bills it as outbound). Never throws; output unchanged.
     await strapi.service('api::sms.sms').recordTwimlReply({
       to: phoneNumber, body: smsBody, mediaCount,
       garden: garden || smsTask?.garden || user?.activeGarden, task: smsTask, user,
     });
     ```
   - Nothing else in `fetchSms` changes.
3. `tests/billing/twiml.js` with `describe('billing: twiml', ...)`.
   - Setup:
     - `beforeAll(() => grantPrivileges(2, 'api::message.message', ['fetchSms']))`;
     - an org and a garden linked to it;
     - `u = makeUser({ activeGarden: g.published.id, gardens: [g.published.id] })`. Its username differs from the phone and its email is real; both come from `makeUser`.
     - A fresh user per test keeps `validateQuestion` empty.
   - Post with `http().post('/api/sms').type('form').send({ From: u.phoneNumber, Body: 'smiles' })`.
   - **AC42:**
     - Status 200.
     - `res.text` equals the `smiles` fixture. After unescaping `&apos;` and `&amp;`, the `<Message>` text is "You're cute, but I'm just a bot ;)".
     - Exactly one new row for `{ to_number: u.phoneNumber, source: 'webhook.reply' }`, with:
       - `direction 'twiml_reply'`, `category 'transactional'`, `twilio_sid null`;
       - `user.id === u.id`;
       - `segments === countSegments("You're cute, but I'm just a bot ;)").segments`;
       - `organization_document_id === org.documentId`;
       - `simulated === strapi.service('api::sms.transport').isDryRun()` (true in test).
   - **AC43:**
     - `patch(SmsHelper, 'finishTask', jest.fn().mockResolvedValue({ body: 'Nice work!', type: 'reply', task: { primary_image: { formats: { medium: { url: 'https://example.test/m.jpg' } } } } }))`.
     - POST `Body: 'done'`. The response contains `<Media>https://example.test/m.jpg</Media>`. The row has `num_media 1` and `units 3`.
   - **AC44:** POST `Body: 'STOP'`, then `Body: 'START'`. Each leaves no new row for that `to_number` (compare `ledgerCount` before and after each).
   - **AC45:**
     - `smiles` gives `res.text` byte-equal to fixture 1.
     - `Body: 'purple monkey dishwasher'` gives `res.text` byte-equal to fixture 2.
     - Hard-code both strings in the test.

### Done when
- `node --check src/api/message/controllers/message.js` passes.
- `DATABASE_FILENAME=.tmp/test-1a-14.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: twiml'` passes.
- The full `tests/app.test.js` run is green.

---

## Task 1a-15: [BE] Tag the system sends (sms-login, vacation check-in) and fix their test seams
Depends on: 1a-7
Parallel-safe with: 1a-8, 1a-9, 1a-10, 1a-11, 1a-12, 1a-13, 1a-14
Covers: AC39, AC40, AC38 (sites #19, #20)

### Files
- `src/api/auth/services/sms-login.js`: L149 only.
- `src/api/message/services/vacation-checkin.js`: L51 only.
- `tests/auth/sms-login.js`: L67 and L777 only.
- `tests/user/vacation-reminders.js`: L46 and L193, plus one require line.
- `tests/billing/cs-system.js`: new.

### Current state
- `sms-login.js` L148-152:
  ```js
  const smsService = strapi.service('api::sms.sms');
  const p = smsService.sendSms(r.phoneNumber, smsBody(code));
  if (p && typeof p.then === 'function') {
    p.catch((e) => strapi.log.error(`sms-login: sendSms failed for user ${r.user.id}: ${e && e.name}`));
  }
  ```
- `vacation-checkin.js` L51: `await strapi.service('api::sms.sms').sendSms(user.phoneNumber, smsBody);`. The user is selected with `select: ['id', 'firstName', 'phoneNumber', ...]`, so `activeGarden` is absent and the resolver lazy-loads it.
- `tests/auth/sms-login.js` L67 and L777: `expect(sendSms).toHaveBeenCalledWith(e164(digits), expect.stringMatching(/\d{6}/));`
- `tests/user/vacation-reminders.js`:
  - L46: `strapi.service('api::sms.sms').sendSms = jest.fn().mockResolvedValue(undefined);`
  - L193-195:
    ```js
    strapi.service('api::sms.sms').sendSms = jest.fn()
      .mockImplementationOnce(() => { throw new Error('twilio down'); })
      .mockResolvedValue(undefined);
    ```
  - These assignments are never restored, so the mock leaks into every later module (including `tests/billing/*`).

### Instructions
1. `sms-login.js` L149: `const p = smsService.sendSms(r.phoneNumber, smsBody(code), undefined, { category: 'system', source: 'auth.sms-login', user: r.user });`. It stays fire-and-forget.
2. `vacation-checkin.js` L51: `await strapi.service('api::sms.sms').sendSms(user.phoneNumber, smsBody, undefined, { category: 'system', source: 'vacation.checkin', user });`
3. `tests/auth/sms-login.js`, L67 and L777 only:
   ```js
   expect(sendSms).toHaveBeenCalledWith(e164(digits), expect.stringMatching(/\d{6}/), undefined,
     expect.objectContaining({ category: 'system', source: 'auth.sms-login' }));
   ```
4. `tests/user/vacation-reminders.js`:
   - Add `const { patchService } = require('../helpers/patch');` at the top.
   - L46 becomes `patchService('api::sms.sms', 'sendSms', jest.fn().mockResolvedValue(undefined));`
   - L193 becomes `patchService('api::sms.sms', 'sendSms', jest.fn().mockImplementationOnce(() => { throw new Error('twilio down'); }).mockResolvedValue(undefined));`
   - **No assertion changes.** They already read `strapi.service('api::sms.sms').sendSms`, which is the patched fn.
5. `tests/billing/cs-system.js` with `describe('billing: cs-system', ...)`, `beforeEach(clearResolver)`, no transport stub (dry-run):
   - **AC39:**
     - Fixtures: an org and garden. `u = makeUser({ activeGarden: g.published.id })`; `makeUser` already sets an authenticated role, `confirmed: true`, and a `+1415` phone. Template: `tests/auth/sms-login.js` L12-22.
     - `strapi.service('api::auth.sms-login').requestCode(u.phoneNumber.slice(2))` (10 digits) resolves `{ invalid: false, outcome: 'sent' }`.
     - `pollLedger({ source: 'auth.sms-login', to_number: u.phoneNumber })` (2 s) gives 1 row with `category 'system'`, `billable false`, `user.id === u.id`.
   - **AC40:**
     - Create a paused user like `tests/user/vacation-reminders.js` L10-29: `makeUser({ paused: true, paused_at: <16 days ago>, last_vacation_check_sent: null, vacation_reminder_count: 0, activeGarden: g.published.id })`.
     - `await strapi.service('api::message.vacation-checkin').sendVacationCheckIns()`.
     - The row for `{ source: 'vacation.checkin', to_number }` has `category 'system'`, `billable false`, `user.id`, and the org.
     - Afterwards, delete the paused user so later runs aren't affected.

### Done when
- `node --check` passes on both source files.
- `DATABASE_FILENAME=.tmp/test-1a-15.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: cs-system|sms-login|sendVacationCheckIns'` passes.
- The full `tests/app.test.js` run is green.
- `git diff 54ca1e3 -- tests/auth/sms-login.js` shows only the two expectation edits.

---

## Task 1a-16: [BE] Slice 1a gate: code checks and full suite
Depends on: 1a-1 … 1a-15
Parallel-safe with: — (last in slice)
Covers: AC13, AC38 (code check), AC59, AC60 (verification), and confirms AC1–AC45 run green together

### Files
- None expected. If a check fails, report the offending file and line back to the coordinator. Do not fix files owned by other tasks.

### Instructions
1. **AC13:**
   - `grep -rnE "require\(['\"]twilio['\"]\)\s*\(" src config` gives exactly one hit, in `src/api/sms/services/transport.js`.
   - `grep -rnE "messages\s*\.\s*create|client\.messages" src config` gives only `transport.js`.
   - `grep -rn "TWILIONUM" src config` gives only `transport.js`.
2. **AC38 code check:** list every send call with
   `grep -rnE "\.(handleSms|sendSms|sendContactCard)\(|api::sms\.sms'\)\.send\(" src config`.
   For each hit outside `src/api/sms/services/sms.js`, confirm the argument object (or `opts`) carries `category:`.
   - The volunteer-day `send` passes `opts.category`. Both of its callers (controller L552, cron-helper L116) pass one. That's accepted.
   - `sendContactCard` callers rely on the built-in `transactional` default. That's accepted.
3. Run `node --check` on every `.js` file changed since 54ca1e3: `git diff --name-only 54ca1e3 -- '*.js'` plus the untracked new files.
4. **AC59 (unmodified files):** `git diff --exit-code 54ca1e3 -- tests/water-morning.test.js tests/tasks/crontest.js tests/general/index.js tests/tasks/transfer.js tests/tasks/poll.js` exits 0.
5. **Full suite:** `NODE_ENV=test npx jest --runInBand` is green. The only failure allowed is the pre-existing `day-sheet-inspection` P6.
6. **No credentials needed in test:** `TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= DATABASE_FILENAME=.tmp/test-1a-16.db NODE_ENV=test npx jest tests/app.test.js` is still green. dotenv does not override already-set empty vars, so any Twilio client construction would throw "username is required".
7. **AC60:** confirm `billing: cs-campaign`, `billing: cs-vday`, and `billing: cs-weekly` ran and passed in step 5.

### Done when
- Steps 1–7 all pass. Report the grep outputs in your hand-off.

---

# Slice 1b: Twilio signature validation on `POST /api/sms`

Starts only after Slice 1a is committed and green.

## Task 1b-1: [BE] Add the pure signature evaluator `src/utils/twilio-signature.js`
Depends on: Slice 1a
Parallel-safe with: — (1b-2 depends on it)
Covers: unit support for AC46–AC50

### Files
- `src/utils/twilio-signature.js`: new.
- `tests/billing/twilio-signature.test.js`: new standalone file.

### Current state
`require('twilio').validateRequest(authToken, signature, url, params)` exists in twilio 3.84.1 and returns a boolean (verified). An empty signature returns `false`. It checks the URL both with and without the port.

### Instructions
1. Export `{ resolveMode, evaluate }`.
   - `resolveMode(raw)` returns `{ mode: 'enforce', unknown: false }` when `raw === 'enforce'`. When `raw` is `undefined`, `''` or `'log'`, it returns `{ mode: 'log', unknown: false }`. Anything else returns `{ mode: 'log', unknown: true }`.
   - `evaluate({ mode, authToken, url, signature, params })` returns `{ mode, valid, allow, reason, missing }`. It never throws.
     - `missing` is an array containing `'TWILIO_WEBHOOK_URL'` if `!url` and `'TWILIO_AUTH_TOKEN'` if `!authToken`.
     - If `missing.length`: `{ valid: false, allow: mode !== 'enforce', reason: 'missing-config' }`.
     - Else if `!signature`: `{ valid: false, allow: mode !== 'enforce', reason: 'missing-signature' }`.
     - Else: `valid = require('twilio').validateRequest(authToken, signature, url, params || {})`, wrapped in try/catch (on a throw, `valid = false` with `reason 'validation-error'`). `reason = valid ? 'ok' : 'invalid-signature'`, and `allow = valid || mode !== 'enforce'`.
2. Tests (standalone):
   - Every row of the design §9 table, using `require('twilio/lib/webhooks/webhooks').getExpectedTwilioSignature('tok', 'https://example.test/api/sms', params)` for valid signatures.
   - A wrong signature, a missing signature, and each missing var under both modes.
   - All 4 `resolveMode` inputs: `undefined`, `'log'`, `'enforce'`, and `'weird'` (unknown).

### Done when
- `node --check src/utils/twilio-signature.js` passes.
- `NODE_ENV=test npx jest tests/billing/twilio-signature.test.js` passes.

## Task 1b-2: [BE] Add the route middleware `api::message.twilio-signature` on `POST /api/sms`
Depends on: 1b-1
Parallel-safe with: —
Covers: AC46, AC47, AC48, AC49, AC50, AC59 (slice green)

### Files
- `src/api/message/middlewares/twilio-signature.js`: new (registers `api::message.twilio-signature`).
- `src/api/message/routes/message.js`: the `/sms` route's `config.middlewares` only.
- `.env.example`: add 2 vars.
- `tests/billing/signature.js`: new.

### Current state
`src/api/message/routes/message.js` L22-30:
```js
{
method: 'POST',
path: '/sms',
handler: 'message.fetchSms',
config: {
  policies: [],
  middlewares: [],
},
},
```
- Route middlewares run after users-permissions auth and before the controller.
- `ctx.request.body` is the parsed form body (`strapi::body`).
- The header is `ctx.request.header['x-twilio-signature']`.

### Instructions
1. Middleware (factory `(config, { strapi }) => async (ctx, next) => {...}`). Read `process.env` **on every request**:
   ```js
   'use strict';
   const { resolveMode, evaluate } = require('../../../utils/twilio-signature');
   let warnedUnknownMode = false;
   module.exports = (config, { strapi }) => async (ctx, next) => {
     const { mode, unknown } = resolveMode(process.env.TWILIO_SIGNATURE_MODE);
     if (unknown && !warnedUnknownMode) {
       warnedUnknownMode = true;
       strapi.log.warn('[twilio-signature] unknown TWILIO_SIGNATURE_MODE, using log');
     }
     const r = evaluate({
       mode, authToken: process.env.TWILIO_AUTH_TOKEN, url: process.env.TWILIO_WEBHOOK_URL,
       signature: ctx.request.header['x-twilio-signature'], params: ctx.request.body || {},
     });
     if (r.missing.length) {
       if (mode === 'enforce') {
         strapi.log.error(`[twilio-signature] mode=enforce rejected: missing ${r.missing.join(', ')}`);
         ctx.status = 403; ctx.body = ''; return;
       }
       strapi.log.warn(`[twilio-signature] skipped: missing ${r.missing.join(', ')}`);
       return next();
     }
     if (r.valid) {
       if (mode === 'log') strapi.log.info('[twilio-signature] mode=log valid=true');
       return next();
     }
     strapi.log.warn(`[twilio-signature] mode=${mode} valid=false reason=${r.reason}`);
     if (r.allow) return next();
     ctx.status = 403; ctx.body = ''; return;
   };
   ```
   - The URL is **never** derived from `ctx.href`.
   - No log line includes the body, `From`, or any phone number.
   - Set `ctx.status` before `ctx.body` so Koa keeps the 403.
2. Route: `middlewares: ['api::message.twilio-signature']` on the `/sms` route only.
3. `.env.example`, under the Twilio block:
   ```
   # Exact public URL configured in the Twilio console for inbound SMS (including any query string).
   TWILIO_WEBHOOK_URL=
   # log (default) = validate and log only; enforce = reject unsigned/invalid with 403.
   TWILIO_SIGNATURE_MODE=
   ```
4. `tests/billing/signature.js` with `describe('billing: signature', ...)`.
   - Setup:
     - `grantPrivileges(2, 'api::message.message', ['fetchSms'])`;
     - fixtures from Task 1a-14's pattern (an org, a garden linked to it, and `u` with `activeGarden`);
     - in each test, `setEnv(...)` and `restore()` in `afterEach`;
     - `const URL = 'https://example.test/api/sms'`, `params = { From: u.phoneNumber, Body: 'smiles' }`;
     - `sig = require('twilio/lib/webhooks/webhooks').getExpectedTwilioSignature('tok', URL, params)`.
   - **AC46:**
     - `setEnv({ TWILIO_SIGNATURE_MODE: undefined, TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: 'tok' })` and `warn = patch(strapi.log, 'warn', jest.fn())`.
     - POST without the header returns 200 with the AC42 `smiles` TwiML, and a `webhook.reply` row exists.
     - Some `warn` call contains `twilio-signature` and `valid=false`. That line contains neither `u.phoneNumber` nor `smiles`.
   - **AC47:** `TWILIO_SIGNATURE_MODE: 'enforce'` plus the header `X-Twilio-Signature: sig` returns 200 with the `smiles` TwiML, even though supertest hits 127.0.0.1.
   - **AC48:**
     - Use `enforce`, with first a wrong signature and then no header.
     - Patch `strapi.service('api::sms.transport').create` with `stubTransport()` and `patch(SmsHelper, 'getUser', jest.fn())`.
     - Each request returns 403 with `res.text === ''`.
     - User count, `api::message.message` count, and ledger count are unchanged. The transport and `getUser` record 0 calls.
   - **AC49:**
     - `enforce` with `TWILIO_WEBHOOK_URL` unset returns 403, and `patch(strapi.log, 'error', jest.fn())` saw a message containing `TWILIO_WEBHOOK_URL`. Repeat with `TWILIO_AUTH_TOKEN` unset.
     - `log` with the URL unset returns 200, and a `warn` contains `skipped`.
   - **AC50:** in one test, a request under `enforce` with no signature returns 403. Then `process.env.TWILIO_SIGNATURE_MODE = 'log'`, and the same request returns 200.

### Done when
- `node --check` passes on the middleware and route files.
- `DATABASE_FILENAME=.tmp/test-1b-2.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: signature|billing: twiml'` passes.
- **Slice 1b green:** `NODE_ENV=test npx jest --runInBand` (only the pre-existing P6 failure).

---

# Slice 1c: every garden belongs to an organization

Starts only after Slice 1b is committed and green. Gardens are mapped to orgs via `--map` (Decisions Q1(b) and Q2). The backfill is never run with `--apply` before Cameron reviews the map. That is an operator step, not a code task.

## Task 1c-1: [BE] Auto-create an org on garden create (Document Service middleware)
Depends on: Slice 1b
Parallel-safe with: —
Covers: AC51, AC52, AC53, AC54 (first half: `db.query` create makes no org)

### Files
- `src/api/billing/services/coverage.js`: new, with `provisionForGardenCreate` only.
- `src/index.js`: register the middleware.
- `tests/billing/org-create.js`: new.

### Current state
`src/index.js` L79-88 registers the slug middleware:
```js
strapi.documents.use(async (context, next) => {
  const config = SLUG_CONTENT_TYPES[context.uid];
  if (config && ['create', 'update'].includes(context.action)) { ... }
  return next();
});
```
- Garden: `sms_slug` is `unique` and `required`; `title` is required; `organization` is `manyToOne` → `api::organization.organization` (`inversedBy: 'gardens'`). Both types are draft & publish.
- Existing tests that create gardens through the Document Service:
  - `tests/event/brief.js` L40 (with an org documentId: must create **no** org);
  - `tests/event/cancel.js` L47 and `tests/garden/full-pii.js` L19 (no org: will now get one, and nothing asserts on it).

### Instructions
1. `src/api/billing/services/coverage.js`, factory form. Constants are `ORG = 'api::organization.organization'` and `GARDEN = 'api::garden.garden'`.
   - Helper `hasOrganization(v)`:
     - `undefined`, `null`, and `''` give `false`.
     - An array gives `v.length > 0`.
     - A plain object with any of `connect`/`set`/`disconnect` keys gives `nonEmpty(v.connect) || nonEmpty(v.set)`, where `nonEmpty(x)` is `Array.isArray(x) ? x.length > 0 : (x != null && x !== '')`.
     - Any other object (`{ id }`/`{ documentId }`) gives `true`.
     - A string or number gives `true`.
   - `async provisionForGardenCreate(context, next)`:
     ```js
     if (context.uid !== GARDEN || context.action !== 'create') return next();
     const data = context.params?.data;
     if (!data || hasOrganization(data.organization)) return next();
     let org;
     try {
       org = await strapi.documents(ORG).create({ data: { title: data.title }, status: 'published' });
     } catch (err) {
       strapi.log.error(`[billing.coverage] could not auto-create org for new garden: ${err.message}`);
       return next();                     // never block garden creation
     }
     data.organization = org.documentId;
     try {
       return await next();
     } catch (err) {
       try { await strapi.documents(ORG).delete({ documentId: org.documentId }); }
       catch (e) { strapi.log.error(`[billing.coverage] could not remove org ${org.documentId} after failed garden create: ${e.message}`); }
       throw err;
     }
     ```
2. `src/index.js`: right after the slug `strapi.documents.use(...)` block (after L88), add:
   ```js
   // Every new garden gets an organization (SMS billing attribution). Logic in api::billing.coverage.
   strapi.documents.use((context, next) => strapi.service('api::billing.coverage').provisionForGardenCreate(context, next));
   ```
3. `tests/billing/org-create.js` with `describe('billing: org-create', ...)`. Count orgs by title with `strapi.db.query(UID.ORG).findMany({ where: { title } })`.
   - **AC51:** three inputs, each with a distinct title/slug, because `sms_slug` is unique:
     - `{ title: 'Coverage A', sms_slug: uniq('cova') }` with no org key;
     - `{ title: 'Coverage B', sms_slug: uniq('covb'), organization: null }`;
     - `{ title: 'Coverage C', sms_slug: uniq('covc'), organization: { connect: [], disconnect: [] } }`.

     For each, after `strapi.documents(UID.GARDEN).create({ data })` (draft only):
     - exactly 2 org rows have that title, sharing **one** documentId: one draft and one published;
     - `gardenRows(doc).draft.organization.documentId` is that org;
     - after `strapi.documents(UID.GARDEN).publish({ documentId })`, `gardenRows(...).published.organization` is the org's **published** row (`publishedAt` not null);
     - after `clearResolver()`, `resolveContext({ garden: doc.documentId })` returns that org.
   - **AC52:**
     - `const existing = await makeOrg()`, then count all org rows.
     - Create a garden with `organization: existing.documentId`, and another with `organization: { connect: [existing.documentId] }`.
     - The org row count is unchanged.
   - **AC53:** Strapi v5 skips `unique` validation for **draft** entries (`@strapi/core/dist/services/entity-validator/validators.js` L178). A draft-only duplicate therefore succeeds, so both creates here must pass `status: 'published'`; the duplicate then fails inside `create`'s internal publish.
     - Create a garden with slug `s` and `status: 'published'`, then count org rows.
     - Creating another garden with the same `sms_slug: s`, a new title, and `status: 'published'` rejects.
     - The org row count is unchanged, and no org has the second title.
   - **AC54 (first half):** `strapi.db.query(UID.GARDEN).create({ data: { title: uniq('Raw'), sms_slug: uniq('raw'), publishedAt: new Date() } })` leaves the org row count unchanged.

### Done when
- `node --check` passes on `coverage.js` and `src/index.js`.
- `DATABASE_FILENAME=.tmp/test-1c-1.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: org-create|Event page payload|cancel|full'` passes.
- The full `tests/app.test.js` run is green (`brief.js`, `cancel.js`, and `full-pii.js` included).

## Task 1c-2: [BE] Add `coverage.audit()` and `coverage.backfill({ apply, map })`
Depends on: 1c-1
Parallel-safe with: —
Covers: AC54 (second half: audit reports ORPHAN), AC55, AC56, AC57

### Files
- `src/api/billing/services/coverage.js`: add two methods.
- `tests/billing/org-coverage.js`: new. It runs last (`index.js` order), because `backfill({apply: true})` is DB-wide.

### Current state
After 1c-1, `coverage.js` exports `provisionForGardenCreate`.
- The garden afterUpdate lifecycle (`src/api/garden/content-types/garden/lifecycles.js` L55) refreshes the garden cache on every `db.query` update. That's harmless noise.
- `documents().update`/`publish` on a garden would publish pending draft edits, so they **must not** be used here.

### Instructions
1. **`async audit()`** is read-only.
   - Load gardens:
     `rows = await strapi.db.query(GARDEN).findMany({ select: ['id', 'documentId', 'title', 'sms_slug', 'publishedAt'], populate: { organization: { select: ['id', 'documentId', 'publishedAt'] } }, orderBy: { id: 'asc' } })`.
     Skip rows without a `documentId` (count them in `summary.noDocumentId`).
   - Group rows by `documentId` into `{ draft, published }`.
   - Load org versions:
     `strapi.db.query(ORG).findMany({ where: { documentId: { $in: [...all referenced org documentIds] } }, select: ['id', 'documentId', 'publishedAt'] })`
     and build `orgVersions: documentId -> { draftId, publishedId }`.
   - For each garden document:
     - `draftOrg = draft?.organization?.documentId ?? null` and `publishedOrg = published?.organization?.documentId ?? null`.
     - `classification`, with the first rule that matches winning:
       1. `!draftOrg && !publishedOrg` → `ORPHAN`;
       2. both set and different → `MISMATCH`;
       3. `linked = publishedOrg || draftOrg`; `!orgVersions[linked]?.publishedId` → `ORG_UNPUBLISHED`;
       4. `published && !publishedOrg` → `PUBLISHED_UNLINKED`;
       5. `draft && !draftOrg` → `DRAFT_UNLINKED`. This is an addition to the design's list. Cameron decided (2026-10-17) that the backfill **fixes** it; see the DRAFT_UNLINKED action below;
       6. otherwise → `OK`.
   - Entry: `{ documentId, title: (published || draft).title, sms_slug: (published || draft).sms_slug, hasPublished: !!published, publishedOrg, draftOrg, classification, draftRowId: draft?.id ?? null, publishedRowId: published?.id ?? null }`.
   - Return `{ gardens: entries, summary: { total, OK, ORPHAN, PUBLISHED_UNLINKED, DRAFT_UNLINKED, MISMATCH, ORG_UNPUBLISHED, noDocumentId } }`. Every key is always present and numeric.
2. **`async backfill({ apply = false, map = {} } = {})`**:
   - `const { gardens } = await this.audit();` then build `actions = []` and `skipped = []`.
   - **ORPHAN with `map[g.documentId]`:**
     - Look up the target org's rows by documentId.
     - If it lacks a draft **or** a published row, push `{ gardenDocumentId, organizationDocumentId: target, reason: 'map target org not found or not published' }` to `skipped`.
     - Otherwise push this action:
       `{ type: 'link-mapped-org', gardenDocumentId, gardenTitle: g.title, organizationDocumentId: target, links: [...] }`.
   - **ORPHAN without a map entry:** action
     `{ type: 'create-org', gardenDocumentId, gardenTitle: g.title, organizationDocumentId: null, links: [...] }`.
     The org gets **exactly** `g.title` (the published title when there is one).
   - **PUBLISHED_UNLINKED:** action
     `{ type: 'link-published-row', gardenDocumentId, gardenTitle, organizationDocumentId: g.draftOrg, links: [{ version: 'published', gardenRowId: g.publishedRowId, orgRowId: <org publishedId> }] }`.
   - `links` holds one entry per existing garden row: `{ version: 'draft', gardenRowId: g.draftRowId, orgRowId: <org draftId> }` and/or `{ version: 'published', gardenRowId: g.publishedRowId, orgRowId: <org publishedId> }`. For a planned `create-org`, `orgRowId` is null until applied.
   - **DRAFT_UNLINKED** (Cameron's decision: fix it, so a later admin publish doesn't drop the link): action
     `{ type: 'link-draft-row', gardenDocumentId, gardenTitle, organizationDocumentId: g.publishedOrg, links: [{ version: 'draft', gardenRowId: g.draftRowId, orgRowId: <org draftId> }] }`.
     If the org has no draft row, push to `skipped` with reason `'org has no draft row'`.
   - `MISMATCH`, `ORG_UNPUBLISHED`, and `OK` produce no action.
   - **When `apply`:**
     - For `create-org`, run `strapi.documents(ORG).create({ data: { title: g.title }, status: 'published' })`. Re-read its rows to fill `organizationDocumentId` and each link's `orgRowId`.
     - Then, for every link, run `strapi.db.query(GARDEN).update({ where: { id: link.gardenRowId }, data: { organization: link.orgRowId } })`.
     - No other garden field is written. Never call `documents(GARDEN).update` or `publish`.
   - Return `{ apply, actions, skipped }`. It is idempotent: a second run finds no ORPHAN, PUBLISHED_UNLINKED or DRAFT_UNLINKED, so it returns `actions: []`. The tests must cover a DRAFT_UNLINKED fixture (link the draft row and leave the published row and every other field untouched) alongside the others.
3. `tests/billing/org-coverage.js` with `describe('billing: org-coverage', ...)`. Build fixtures with helpers plus `db.query` edits. The 1c-1 middleware is live, so every Document Service garden gets an org unless you unlink it:
   - **OK:** `makeGarden({ organization: makeOrg().documentId })`.
   - **ORPHAN, two rows:** `makeGarden({ organization: null })` (the helper unlinks both rows).
   - **ORPHAN, title-differs:**
     - `makeGarden({ organization: null, title: T })`.
     - Then `strapi.db.query(UID.GARDEN).update({ where: { id: draftRowId }, data: { title: T + ' (draft edit)' } })`.
   - **ORPHAN, raw (AC54):** `strapi.db.query(UID.GARDEN).create({ data: { title, sms_slug, publishedAt: new Date() } })`.
   - **PUBLISHED_UNLINKED:** `makeGarden({ organization: O.documentId })`, then unlink the published row only.
   - **MISMATCH:** `makeGarden({ organization: A.documentId })`, then set the published row's org to B's `publishedId` via `db.query` update.
   - **ORG_UNPUBLISHED:**
     - `const D = makeOrg({ publish: false })`.
     - `makeGarden({ organization: D.documentId, publish: false })`. This is draft-only; the explicit org skips the middleware.
   - **MAPPED ORPHAN (AC57):** `makeGarden({ organization: null })` plus `existingOrg = makeOrg()`.

   Assertions:
   - **AC54:** `audit()` classifies the raw garden as `ORPHAN`.
   - **AC55:**
     - Count rows in the garden table, the org table, and the join table before and after `audit()`. Use `strapi.db.metadata.get(UID.GARDEN).tableName`, `...get(UID.ORG).tableName`, and `strapi.db.metadata.get(UID.GARDEN).attributes.organization.joinTable.name` (expect `gardens_organization_lnk`) via `strapi.db.connection(table).count({ n: '*' })`.
     - The counts are equal.
     - Every fixture has its expected classification.
   - **AC56 dry run:** `backfill({ apply: false, map })` leaves the same three counts unchanged. Its `actions` include each fixture ORPHAN (`create-org`) and the PUBLISHED_UNLINKED (`link-published-row`).
   - **AC56/AC57 apply:**
     - Let `orphansBefore` = audit entries with `ORPHAN`, excluding the mapped one.
     - `backfill({ apply: true, map: { [mapped.documentId]: existingOrg.documentId } })`.
     - The org **document** count grew by exactly `orphansBefore.length`.
     - Each fixture orphan's draft row links to an org row with `publishedAt` null, and its published row links to the same org's published row. That org's title is exactly the garden title.
     - The title-differs garden still has its draft title `T + ' (draft edit)'` and its published title `T`.
     - The mapped garden links to `existingOrg` on both rows (draft→`draftId`, published→`publishedId`), and no org is titled after it.
     - The PUBLISHED_UNLINKED published row now links to O's published row.
     - The MISMATCH and ORG_UNPUBLISHED links are unchanged.
   - **AC56 idempotent:** a second `backfill({ apply: true })` returns `actions.length === 0`, and `audit().summary.ORPHAN === 0`.

### Done when
- `node --check src/api/billing/services/coverage.js` passes.
- `DATABASE_FILENAME=.tmp/test-1c-2.db NODE_ENV=test npx jest tests/app.test.js -t 'billing: org-coverage'` passes.
- The full `tests/app.test.js` run is green.

## Task 1c-3: [BE] Add the operator scripts `audit-org-coverage.js` and `backfill-garden-orgs.js`
Depends on: 1c-2
Parallel-safe with: —
Covers: operational path for AC55–AC57 (manual, deploy steps 2–3); AC59 (slice green)

### Files
- `scripts/audit-org-coverage.js`: new.
- `scripts/backfill-garden-orgs.js`: new.

### Current state
`scripts/diagnose-reminders.js` is the template:
- its header comment warns that booting Strapi runs crons and schema sync (L1-20);
- `process.env.CRON_ENABLED = 'false';` is set **before** `require('@strapi/strapi')` (L23);
- `const strapi = await createStrapi().load();`, then work in `try`, then `await strapi.destroy()` in `finally`;
- `.then(() => process.exit(0)).catch(... process.exit(1))`.

### Instructions
1. `scripts/audit-org-coverage.js`:
   - Copy the header style, adapted: it is read-only and is run with `fly ssh console -C "node scripts/audit-org-coverage.js"`.
   - Call `strapi.service('api::billing.coverage').audit()`.
   - With `--json`, `console.log(JSON.stringify(result, null, 2))`. Otherwise:
     - `console.table(result.gardens.map(({ documentId, title, sms_slug, hasPublished, draftOrg, publishedOrg, classification }) => ({ ... })))`;
     - then a summary line per classification.
   - Exit 0.
2. `scripts/backfill-garden-orgs.js`:
   - Header: it's a dry run by default; **never** pass `--apply` until the `--map` file has been reviewed (Decision Q1(b)); `--map <file.json>` takes `{ "<gardenDocumentId>": "<organizationDocumentId>" }`.
   - Parse argv: `--apply` (boolean) and `--map <path>`.
     - Read the map with `JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'))`.
     - It must be a plain object whose keys and values are non-empty strings. Otherwise print the error and exit 2 **before** booting Strapi.
   - Call `strapi.service('api::billing.coverage').backfill({ apply, map })`.
   - Print each action as one line: `type gardenDocumentId "title" -> organizationDocumentId (links: version:gardenRowId->orgRowId, ...)`. Print each skipped entry the same way.
   - When not applying, end with `DRY RUN: nothing written. Re-run with --apply to write.`
   - Exit 0, or 1 on error.
3. Both scripts use `console.log` for output (CLI) and never print phone numbers.

### Done when
- `node --check` passes on both scripts.
- Smoke runs on a fresh sqlite DB (schema sync creates it):
  - `NODE_ENV=test DATABASE_FILENAME=.tmp/script-smoke.db node scripts/audit-org-coverage.js --json` prints JSON with `gardens: []` and exits 0;
  - `NODE_ENV=test DATABASE_FILENAME=.tmp/script-smoke.db node scripts/backfill-garden-orgs.js` prints the DRY RUN line and exits 0;
  - `node scripts/backfill-garden-orgs.js --map /nonexistent.json` exits 2 without booting.

  Then `rm -f .tmp/script-smoke.db*`.
- **Slice 1c green:** `NODE_ENV=test npx jest --runInBand` (only the pre-existing P6 failure).

---

# Slice 1d: reconciliation

Starts only after Slice 1c is committed and green.

## Task 1d-1: [BE] Add the reconcile core and `scripts/reconcile-twilio-usage.js`
Depends on: Slice 1c
Parallel-safe with: —
Covers: AC58, AC59 (slice green); manual deploy step 4

### Files
- `scripts/lib/reconcile-usage.js`: new pure core. It lives under `scripts/` so `src/` keeps zero Twilio client construction (AC13).
- `scripts/reconcile-twilio-usage.js`: new.
- `tests/billing/reconcile.test.js`: new standalone file.

### Current state
- `api::billing.usage.getTotals({ period })` (Task 1a-6) returns `{ period, smsSegments, mmsCount, byCategory, byDirection, attributed: {rows, segments, units}, unattributed: {...} }`.
- twilio 3.84.1 has `client.usage.records.list({ category, startDate, endDate })`. It accepts `'YYYY-MM-DD'` strings (`serialize.iso8601Date` passes strings through). Each record has string `usage` and `count` fields.

### Instructions
1. `scripts/lib/reconcile-usage.js` (pure, no Strapi, no `require('twilio')`) exports:
   - `currentPeriod(now = new Date())`: returns `now.toISOString().slice(0, 7)`.
   - `monthRange(period)`: returns `{ startDate: 'YYYY-MM-01', endDate: 'YYYY-MM-<last day>' }`, using `new Date(Date.UTC(y, m, 0)).getUTCDate()`.
   - `parseArgs(argv)`:
     - `--period YYYY-MM` defaults to `currentPeriod()` and must match `/^\d{4}-(0[1-9]|1[0-2])$/`.
     - `--max-drift <n>` defaults to `0.02` and must be finite and ≥ 0.
     - Invalid input throws `Error` with a usage message.
     - Returns `{ period, maxDrift }`.
   - `async fetchTwilioTotals(client, period)`:
     - Calls `client.usage.records.list` for `category: 'sms-outbound'` and `category: 'mms-outbound'` with `monthRange(period)`.
     - `smsSegments` = sum of `Number(r.usage)` over the SMS records. `mmsCount` = sum of `Number(r.count)` over the MMS records.
     - Returns `{ smsSegments, mmsCount }`.
   - `drift(ledger, twilio)`: `twilio === 0 ? (ledger === 0 ? 0 : 1) : (ledger - twilio) / twilio`.
   - `async reconcile({ period, maxDrift = 0.02, twilioClient, getTotals })`:
     - Fetch both sides.
     - `unattributedShare = total segments ? unattributed.segments / (attributed.segments + unattributed.segments) : 0`.
     - Return `{ period, maxDrift, twilio, ledger, drift: { sms, mms }, unattributedShare, exitCode: Math.abs(driftSms) > maxDrift ? 1 : 0 }`.
     - It writes nothing.
   - `formatReport(result)` returns a multi-line string with:
     - the period;
     - Twilio vs ledger SMS segments and MMS count;
     - drift as a signed percentage with 2 decimals (for example `-1.00%`);
     - the byCategory, byDirection, and attributed/unattributed breakdown;
     - the unattributed share;
     - a final `PASS` or `FAIL (|sms drift| > X%)` line;
     - the three known drift sources from design §11 as a footnote.
2. `scripts/reconcile-twilio-usage.js`:
   - Header like `diagnose-reminders.js`: read-only, `fly ssh console -C "node scripts/reconcile-twilio-usage.js [--period YYYY-MM] [--max-drift 0.02]"`.
   - `process.env.CRON_ENABLED = 'false'` before requiring `@strapi/strapi`.
   - Run `parseArgs` before booting; on error print it and exit 2.
   - `const strapi = await createStrapi().load()` (this loads `.env`).
   - If `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` is missing, print an error and exit 2 after `destroy`.
   - Build the read-only usage client with `require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)`. Design §11 allows this one client outside the transport.
   - `result = await reconcile({ ...args, twilioClient, getTotals: (a) => strapi.service('api::billing.usage').getTotals(a) })`, then `console.log(formatReport(result))`.
   - `await strapi.destroy()` in `finally`, then `process.exit(result.exitCode)`.
3. `tests/billing/reconcile.test.js` (standalone):
   - Stub client: `{ usage: { records: { list: jest.fn(async ({ category }) => category === 'sms-outbound' ? [{ usage: '100', count: '100' }] : [{ usage: '6', count: '2' }]) } } }`.
   - Stub `getTotals` returns `{ smsSegments: 99, mmsCount: 2, byCategory: {}, byDirection: {}, attributed: { rows: 0, segments: 99, units: 99 }, unattributed: { rows: 0, segments: 0, units: 0 } }`.
   - `reconcile({ period: '2026-09', twilioClient, getTotals })`:
     - `drift.sms` is close to −0.01 and `drift.mms` is 0;
     - `exitCode` is 0;
     - `formatReport` contains `-1.00%`.
   - With 90 segments: `drift.sms` is close to −0.10, `exitCode` is 1, and the report contains `-10.00%`.
   - `list` was called with `{ category: 'sms-outbound', startDate: '2026-09-01', endDate: '2026-09-30' }` and the MMS equivalent.
   - "Writes nothing": `getTotals` is the only data dependency, and it is a stub. Assert the client has no other methods called.
   - Also test `monthRange('2028-02')` gives an end of `2028-02-29`, and `parseArgs` defaults and rejections.

### Done when
- `node --check` passes on both script files.
- `NODE_ENV=test npx jest tests/billing/reconcile.test.js` passes.
- `node scripts/reconcile-twilio-usage.js --period 2026-13` exits 2 without booting.
- **Slice 1d green:** `NODE_ENV=test npx jest --runInBand` (only the pre-existing P6 failure).

---

## AC → task map

| AC | Task(s) |
|---|---|
| AC1–AC6 | 1a-1 |
| AC7, AC8 | 1a-4 |
| AC9 | 1a-6 |
| AC10, AC11, AC12 | 1a-3 |
| AC13 | 1a-3 (transport), 1a-8 / 1a-9 / 1a-11 (clients removed), 1a-16 (grep gate) |
| AC14–AC19, AC21–AC24 | 1a-7 |
| AC20 | 1a-7 (gate seam), 1a-6 (unpatched `canSend` allows every category) |
| AC25–AC29 | 1a-5 |
| AC30, AC31 | 1a-6 |
| AC32, AC33, AC34 | 1a-7 |
| AC35 | 1a-8 |
| AC36 | 1a-9 (groupSms path, dry-run return), 1a-10 (cron path) |
| AC37 | 1a-11 |
| AC38 | runtime: #1 #8 #9 #10 → 1a-8; #2 broadcast, #15, #16 → 1a-9; #2 reminder, #4, #5 → 1a-10; #3 → 1a-11; #6 #7 #14 #17 → 1a-12; #11 #12 #13 → 1a-13; #18 #21 → 1a-14; #19 #20 → 1a-15. Code check → 1a-16 |
| AC39, AC40 | 1a-15 |
| AC41 | 1a-8 |
| AC42–AC45 | 1a-14 |
| AC46–AC50 | 1b-2 (with 1b-1 for the evaluator) |
| AC51, AC52, AC53 | 1c-1 |
| AC54 | 1c-1 (no org from `db.query`), 1c-2 (audit says ORPHAN) |
| AC55, AC56, AC57 | 1c-2 (scripts: 1c-3) |
| AC58 | 1d-1 |
| AC59 | 1a-16; slice-green steps in 1b-2, 1c-3, 1d-1; specific bullets in 1a-8 (sms-campaign-vacation) and 1a-13 (registration L76) |
| AC60 | 1a-8, 1a-9, 1a-11; verified in 1a-16 |

Unplaced ACs: none.
