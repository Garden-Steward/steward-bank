# Tasks for SMS One-Time-Code Login (from design.md, Revision 2)

Source of truth: `/home/user/steward-bank/.claude/specs/sms-login/design.md`.
This is a **combo feature**:

- **[BE]** tasks run in `/home/user/steward-bank`. The `implementer` agent runs them.
- **[FE]** tasks run in `~/git/gardensteward/garden-vue` (`/root/git/gardensteward/garden-vue`, HEAD `af00ff9`). The `frontend-implementer` agent runs them.

FE briefs only reference the **API contract** section of design.md. They never reference backend source.

## Global rules (apply to every task)

- **Do NOT commit or push, in either repo.** Leave all changes in the working tree.
  - steward-bank: the dispatcher commits.
  - garden-vue: this session cannot push. The dispatcher turns the working tree into a patch against `af00ff9`.
- **Environment setup:** `node_modules` is not installed in either repo yet.
  - The dispatcher should run the install once per repo **before** dispatching parallel tasks. Two concurrent `yarn install` runs in one repo will race.
  - Every brief also has an idempotent guard: if `node_modules/` is missing in the repo you are working in, run `yarn install --frozen-lockfile` there first.
  - If `--frozen-lockfile` fails, **stop and report**. Do not regenerate `yarn.lock`.
  - Do not add, remove or upgrade any dependency. `package.json` and `yarn.lock` must stay byte-identical in both repos.
- **No new dependencies** in either repo (design: "No new dependencies in either repo").
- **Backend tests:**
  - Run with `yarn test` (`NODE_ENV=test jest --runInBand`, sqlite via better-sqlite3). One Strapi boot happens in `tests/app.test.js`.
  - Test modules are plain `.js` files `require`d from it. **Never** name a Strapi-dependent test `*.test.js`, because jest would run it standalone with no Strapi boot.
  - Twilio is always mocked: stub `api::sms.sms.sendSms` and `handleSms` with `patchService` (`tests/helpers/patch.js`). The global `afterEach` in `tests/app.test.js` restores them.
- **Frontend checks:**
  - Use `npx eslint <files> --no-fix`. The repo's `yarn lint` script has `--fix` baked in, so do not use it.
  - Run `yarn build` only where a task says so.
  - garden-vue has no unit-test runner.

## Dependency graph and parallel groups

```
BE lane:  T1 [BE] schema  ──►  T2 [BE] service + service tests  ──►  T3 [BE] controller/routes + HTTP tests
FE lane:  T4 [FE] task_status bugfix   (no deps)
          T5 [FE] auth store  ──►  T6 [FE] LoginModal + App mount
                              └─►  T7 [FE] router beforeEach
          T4, T6, T7  ──►  T8 [FE] build/lint gate
E2E:      T3 + T8  ──►  T9 [E2E] manual browser verification (human/dispatcher)
```

| Wave | Tasks that may run concurrently | Why they are safe together |
|---|---|---|
| 1 | T1 [BE], T4 [FE], T5 [FE] | Different repos. T4 touches `garden-task.store.js` and `VolunteerActivity.vue`; T5 touches `auth.store.js` |
| 2 | T2 [BE], T6 [FE], T7 [FE] | T6 touches `LoginModal.vue`, `modals/index.js` and `App.vue`; T7 touches `router.js`. These are disjoint |
| 3 | T3 [BE], T8 [FE] | Different repos |
| 4 | T9 [E2E] | Needs both lanes landed |

FE tasks never depend on BE tasks. They are built against the design.md API contract.

---

## Task 1 [BE]: Add the five private `sms_login_*` attributes to the user schema
**Status: DONE** (steward-bank `ab131b1`)
Depends on: nothing
Parallel-safe with: T4, T5, T6, T7, T8 (other repo)
Covers: AC-B17 (schema part), and the prerequisite for everything in the BE lane

### Files
- `src/extensions/users-permissions/content-types/user/schema.json`: add 5 attributes

### Current state
Lines 155-170 of the schema, the end of `attributes`:
```json
    "email_verification_token": {
      "type": "string",
      "private": true
    },
    "email_verification_expires": {
      "type": "datetime",
      "private": true
    },
    "email_confirmed": {
      "type": "boolean",
      "default": false
    },
    "automated_emails_sent": {
      "type": "json",
      "description": "Array of automated emails sent to this user: [{type, sent_at, sender_email, garden_id, resend_message_id}]"
    }
  }
}
```

### Instructions
1. If `/home/user/steward-bank/node_modules` does not exist, run `yarn install --frozen-lockfile` in `/home/user/steward-bank`.
2. **Record a baseline before editing:** run `yarn test 2>&1 | tail -60` and note which tests (if any) already fail. Put that list in your report. Later tasks are judged on "no new failures".
3. In `schema.json`, add these five attributes immediately **after** `email_verification_expires` (before `email_confirmed`). Use exactly these names and types:
   ```json
       "sms_login_code_hash": {
         "type": "string",
         "private": true
       },
       "sms_login_code_expires": {
         "type": "datetime",
         "private": true
       },
       "sms_login_attempts": {
         "type": "integer",
         "default": 0,
         "private": true
       },
       "sms_login_last_sent": {
         "type": "datetime",
         "private": true
       },
       "sms_login_send_log": {
         "type": "json",
         "private": true
       },
   ```
4. Do not touch any other attribute. Do not add a migration or a script. Strapi's schema sync creates the columns on boot (design, "Migration").

### Done when
- `node -e "JSON.parse(require('fs').readFileSync('src/extensions/users-permissions/content-types/user/schema.json','utf8'))"` exits 0.
- `node -e "const a=require('./src/extensions/users-permissions/content-types/user/schema.json').attributes; for (const k of ['sms_login_code_hash','sms_login_code_expires','sms_login_attempts','sms_login_last_sent','sms_login_send_log']) { if(!a[k]||a[k].private!==true) throw new Error(k) }"` exits 0.
- `yarn test` boots Strapi (the schema sync accepts the new columns) and shows no failures beyond the baseline from step 2.
- `git diff --stat` shows only `schema.json`.

---

## Task 2 [BE]: Implement the `api::auth.sms-login` service and service-level tests
**Status: DONE** (steward-bank `570d307`)
Depends on: Task 1
Parallel-safe with: T4–T8 (other repo). **Not** parallel with T3 (same test file, and T3 needs this service)
Covers: service logic for AC-B2, B4, B5, B9–B14, B16, B19–B27

### Files
- `src/api/auth/services/sms-login.js`: new
- `src/api/auth/services/index.js`: register `'sms-login'`
- `tests/auth/sms-login.js`: new. It is a plain `.js` module, **not** `*.test.js`
- `tests/app.test.js`: add `require('./auth/sms-login');`

### Current state
`src/api/auth/services/index.js`:
```js
'use strict';

module.exports = {};
```
Closest existing pattern: `src/api/auth/controllers/phone-verification.js`.
- It uses `strapi.db.query('plugin::users-permissions.user')` and `normalizePhoneNumber` from `../../../utils/phone`.
- It sets `role: authenticatedRole.id` in `setPassword`.
- It also stores plaintext tokens, compares with `!==` and 404s on unknown numbers. **Do not copy those choices.**

`src/utils/phone.js` exports `normalizePhoneNumber(phoneNumber)`:
- valid input returns `{ valid: true, phoneNumber: '+1XXXXXXXXXX' }`;
- invalid input returns `{ valid: false, message: 'Invalid US phone number format. Please provide a 10-digit number with or without the country code.' }`.
- The first digit after the optional leading 1 must be 2–9.

`src/api/sms/services/sms.js` exports `sendSms(toNum, body, mediaUrl)`.
- It is fire-and-forget: it returns `undefined` and does not await Twilio.
- **Do not modify `sms.js`. Do not call `handleSms`**, because it writes the body to a `message` row.

Test harness facts:
- `tests/app.test.js` boots Strapi once and `require`s modules. Its last line today is `require('./event/day-sheet');`.
- `tests/helpers/patch.js` exports `patchService(uid, method, impl)`. The global `afterEach` in app.test.js calls `restoreAll()`.
- A neighboring template for stubbing is `tests/user/registration.js`, which has `patchService('api::sms.sms', 'sendContactCard', jest.fn()...)`.
- Direct user creation via `strapi.db.query('plugin::users-permissions.user').create({ data })` is used in `tests/user/index.js:97`.
- Other tests use phone numbers `+1303883333x`. Use the `720555xxxx` range defined below to avoid collisions, because lookup picks the lowest id per phone.

### Instructions

**A. `src/api/auth/services/sms-login.js`.** CommonJS, `'use strict'`, factory form `module.exports = ({ strapi }) => ({ ... })`.

Module-level constants and private helpers (not exported):
```js
const crypto = require('crypto');
const { normalizePhoneNumber } = require('../../../utils/phone');

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_THROTTLE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURLY_CAP = 5;
const DAILY_CAP = 10;
const MAX_ATTEMPTS = 5;

const smsBody = (code) =>
  `Your Garden Steward login code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this text.`;
const hashCode = (userId, code) =>
  crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const codeMatches = (storedHex, userId, code) => {
  if (typeof storedHex !== 'string' || !/^[0-9a-f]{64}$/.test(storedHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(storedHex, 'hex'), Buffer.from(hashCode(userId, code), 'hex'));
};
// Returns an array of valid Date objects; tolerates null, non-arrays, JSON strings and junk entries.
const parseSendLog = (raw) => {
  let arr = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => new Date(t)).filter((d) => !Number.isNaN(d.getTime()));
};
```

Public methods returned by the factory. Implement exactly these names and return shapes.

1. `async resolveUser(rawPhone)`
   - If `rawPhone` is `null` or `undefined`, is not a string or number, or is a string that is empty after `.trim()`, return `{ invalid: true, message: 'Phone number is required' }`.
   - `const n = normalizePhoneNumber(rawPhone)`. If `!n.valid`, return `{ invalid: true, message: n.message }`.
   - Run `strapi.db.query(USER_UID).findMany({ where: { phoneNumber: n.phoneNumber }, orderBy: { id: 'asc' }, populate: ['role'] })`.
   - If more than one row comes back, `strapi.log.warn(\`sms-login: ${rows.length} users share a phone number; using id ${rows[0].id} (ids: ${rows.map(r => r.id).join(',')})\`)`. Log ids only, never the phone.
   - Return `{ invalid: false, phoneNumber: n.phoneNumber, user: rows[0] || null }`.
2. `async isEligible(user)`
   - Read `const advanced = await strapi.store({ type: 'plugin', name: 'users-permissions' }).get({ key: 'advanced' });`
   - Return `!!user && !user.blocked && (!(advanced && advanced.email_confirmation) || user.confirmed === true)`.
   - **Do not look at `role`.**
3. `async authenticatedRoleId()`
   - Run `strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } })`.
   - Return its numeric `id`, or `null` if it is not found. Never hard-code `1`.
4. `async requestCode(rawPhone)`: returns `{ invalid: true, message }` **or** `{ invalid: false, outcome }`, where `outcome` is one of `'sent' | 'unknown' | 'ineligible' | 'throttled' | 'capped'`.
   1. `const r = await this.resolveUser(rawPhone)`. If `r.invalid`, return it unchanged.
   2. If there is no `r.user`, return outcome `'unknown'`. Do not write.
   3. If `!(await this.isEligible(r.user))`, return `'ineligible'`. Do not write.
   4. Set `const now = Date.now()`. If `r.user.sms_login_last_sent` is set and `now - new Date(r.user.sms_login_last_sent).getTime() < RESEND_THROTTLE_MS`, return `'throttled'`. Do not write.
   5. `const log = parseSendLog(r.user.sms_login_send_log)`.
      - `hourCount` = entries with `getTime() > now - HOUR_MS`; `dayCount` = entries with `getTime() > now - DAY_MS`.
      - If `hourCount >= HOURLY_CAP || dayCount >= DAILY_CAP`, run `strapi.log.info(\`sms-login: send cap reached for user ${r.user.id}\`)` and return `'capped'`. Do not write.
   6. Set `const code = generateCode()` and `const nowIso = new Date(now).toISOString()`.
   7. Make exactly one update: `strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data })` where `data` is:
      ```js
      {
        sms_login_code_hash: hashCode(r.user.id, code),
        sms_login_code_expires: new Date(now + CODE_TTL_MS).toISOString(),
        sms_login_attempts: 0,
        sms_login_last_sent: nowIso,
        sms_login_send_log: [
          ...log.filter((d) => d.getTime() > now - DAY_MS).sort((a, b) => a - b).map((d) => d.toISOString()),
          nowIso,
        ],
      }
      ```
      **Never put `role` in this update.**
   8. After the update, send the SMS inside `try { ... } catch (err) { ... }`:
      - Look up the service **at call time** with `const smsService = strapi.service('api::sms.sms');` and call `const p = smsService.sendSms(r.phoneNumber, smsBody(code));`. Do not destructure it at module load, or the test stub won't apply.
      - If `p` is thenable, attach `p.catch((e) => strapi.log.error(\`sms-login: sendSms failed for user ${r.user.id}: ${e && e.name}\`))` and **do not await** it.
      - In the `catch`, run `strapi.log.error(\`sms-login: sendSms failed for user ${r.user.id}: ${err && err.name}\`)`.
      - Never log `code`, the body, or the hash.
   9. Return `'sent'`.
   - Log each non-`sent` / non-`capped` outcome at `strapi.log.debug` with the user id when there is one, and nothing else.
5. `async verifyCode(rawPhone, code)`: returns `{ ok: true, user, jwt }` or `{ ok: false, reason }`. Reasons: `'malformed'`, `'invalid_phone'`, `'unknown'`, `'ineligible'`, `'no_code'`, `'expired'`, `'mismatch'`, `'exhausted'`, `'no_auth_role'`. Steps, in this order:
   1. `const codeStr = String(code ?? '').trim()`. If it does not match `/^\d{6}$/`, return `{ ok: false, reason: 'malformed' }`. No DB access.
   2. `const r = await this.resolveUser(rawPhone)`. If `r.invalid`, return `'invalid_phone'`. If there is no `r.user`, return `'unknown'`. Make no writes in either case.
   3. If `!(await this.isEligible(r.user))`, return `'ineligible'`. No write.
   4. If `!r.user.sms_login_code_hash`, return `'no_code'`. No write.
   5. If `!r.user.sms_login_code_expires || new Date(r.user.sms_login_code_expires).getTime() <= Date.now()`, update `{ sms_login_code_hash: null, sms_login_code_expires: null }` and return `'expired'`.
   6. If `!codeMatches(r.user.sms_login_code_hash, r.user.id, codeStr)`:
      - `const attempts = (r.user.sms_login_attempts ?? 0) + 1`, then `data = { sms_login_attempts: attempts }`.
      - If `attempts >= MAX_ATTEMPTS`, also set `data.sms_login_code_hash = null` and `data.sms_login_code_expires = null`.
      - Update, then return `'exhausted'` if `attempts >= MAX_ATTEMPTS`, otherwise `'mismatch'`.
      - **Never write `role` here.**
   7. On a match:
      - `const data = { sms_login_code_hash: null, sms_login_code_expires: null, sms_login_attempts: 0 }`. Do **not** touch `sms_login_last_sent` or `sms_login_send_log`.
      - If `!r.user.role`: `const roleId = await this.authenticatedRoleId()`.
        - If it is null, run `strapi.log.error('sms-login: authenticated role not found; refusing to log in role-less user ' + r.user.id)` and return `{ ok: false, reason: 'no_auth_role' }` **without any update**, so the code stays unused.
        - Otherwise set `data.role = roleId`, a numeric id as in `phone-verification.js` `setPassword`.
      - If `r.user.role` is set, **do not include a `role` key at all**. Do not write `role: r.user.role.id` back.
      - Update once with `data`.
      - `const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: r.user.id });` Use the numeric `id`, never `documentId`.
      - `const user = await strapi.db.query(USER_UID).findOne({ where: { id: r.user.id }, populate: ['role'] });`
      - Return `{ ok: true, user, jwt }`. The user is **unsanitized**; the controller (T3) sanitizes it.
   - Log each failure reason at `strapi.log.debug` with the user id where there is one. Never log the code or the hash.
6. All DB access uses `strapi.db.query` (the user type has `draftAndPublish: false`), not `strapi.documents`. Do not add lifecycles.

**B. `src/api/auth/services/index.js`:**
```js
'use strict';

const smsLogin = require('./sms-login');

module.exports = {
  'sms-login': smsLogin,
};
```
This gives the uid `api::auth.sms-login`.

**C. `tests/auth/sms-login.js` (service-level suite).** Create a `tests/auth/` directory. The module must export nothing and must only register `describe` blocks. Structure:

```js
'use strict';
const { patchService } = require('../helpers/patch');

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
let seq = 0;
const nextPhoneDigits = () => { seq += 1; return `720555${String(1000 + seq).padStart(4, '0')}`; }; // e.g. '7205551001'
const e164 = (digits) => `+1${digits}`;
const svc = () => strapi.service('api::auth.sms-login');

async function makeUser({ role = 'authenticated', blocked = false, confirmed = true, extra = {} } = {}) {
  const digits = nextPhoneDigits();
  let roleId = null;
  if (role === 'authenticated') roleId = (await strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } })).id;
  else if (typeof role === 'number') roleId = role;
  const user = await strapi.db.query(USER_UID).create({ data: {
    username: `smslogin_${Date.now()}_${seq}`, email: `smslogin_${Date.now()}_${seq}@example.com`,
    provider: 'local', confirmed, blocked, phoneNumber: e164(digits), role: roleId, ...extra,
  }});
  return { user, digits };
}
const readUser = (id) => strapi.db.query(USER_UID).findOne({ where: { id }, populate: ['role'] });
const setCols = (id, data) => strapi.db.query(USER_UID).update({ where: { id }, data });
const codeFrom = (sendSms, callIndex = 0) => sendSms.mock.calls[callIndex][1].match(/\b(\d{6})\b/)[1];
const wrongCode = (code) => String((Number(code) + 1) % 1000000).padStart(6, '0');
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();
```
T3 appends its HTTP suite to this same file and reuses these helpers directly.

- Add `beforeEach` inside the top-level `describe('sms-login service', ...)`:
  - `sendSms = patchService('api::sms.sms', 'sendSms', jest.fn())`
  - `handleSms = patchService('api::sms.sms', 'handleSms', jest.fn())`
- Test pattern: for every new code, call `requestCode(digits)` and take the code with `codeFrom(sendSms)`.
- Use a **fresh user per test**, and a fresh one per cap test (design, Verification plan).

Required test cases. One `it` per bullet; the AC tag goes in the test name.
- B2/B19: after `requestCode` returns `{ invalid:false, outcome:'sent' }`, check the row:
  - `sms_login_code_hash` matches `/^[0-9a-f]{64}$/` and `!== code`;
  - expires within ±30 s of now+10 min;
  - attempts `0`; last_sent within ±30 s of now;
  - `send_log` is an array whose last entry is within ±30 s of now;
  - no column value on the row (iterate `Object.values`, stringify) contains the 6-digit code string.
  - `sendSms` was called once with `(e164(digits), expect.stringMatching(/\d{6}/))`, and `handleSms` was never called.
- B19 pruning: pre-seed `send_log` with `[agoIso(25h), agoIso(30h)]`. After the send, the log has length 1 (only the new entry).
- B3 service-level: an unregistered number gives `'unknown'`, and a blocked user gives `'ineligible'`. `sendSms` is called 0 times, and every `sms_login_*` column on the blocked user is unchanged (compare before/after).
- B4: a second `requestCode` right away gives `'throttled'`. `sendSms` stays at 1 call. Hash, expires and last_sent are unchanged, and the first code still verifies `ok:true`.
- B5: after the first send, run `setCols(id, { sms_login_last_sent: agoIso(61s) })`. The next request gives `'sent'`, the hash changes, and attempts is `0`. `verifyCode` with the old code gives `ok:false`, and with the new code gives `ok:true`.
- B9: after a successful verify, hash and expires are null, attempts is 0, and last_sent is unchanged. Re-verifying the same code gives `ok:false`.
- B10: a wrong code gives `ok:false`, and attempts goes up by 1.
- B11: 4 wrong codes, then the right one, gives `ok:true`.
- B12: 5 wrong codes give 5 × `ok:false`, then hash and expires are null. The 6th attempt with the correct code gives `ok:false`.
- B13: run `setCols(id, { sms_login_code_expires: agoIso(1000) })`. The correct code gives `ok:false`, and afterwards the hash is null.
- B14: request, then `setCols(id, { blocked: true })`. The correct code gives `ok:false`, and the result has no `jwt` property.
- B15 service-level: each of these gives `ok:false`, and the attempts on a real user with an active code stay unchanged:
  - `verifyCode(digits, '12345')`, `verifyCode(digits, 'abcdef')`, `verifyCode(digits, undefined)`;
  - `verifyCode('123', code)` and an unregistered number.
- B20 hourly cap: set `send_log` to 5 ISO timestamps at 5, 15, 25, 40 and 55 min ago, and `last_sent = agoIso(5 min)`. Pre-set a known active code by first calling `requestCode` on a fresh user, then overwriting `last_sent` and `send_log` via `setCols`. A request gives `'capped'` with 0 new `sendSms` calls. Hash, expires, attempts, last_sent and send_log are all unchanged (deep-equal before/after), and the existing code still verifies `ok:true`.
- B21: 4 entries in the last hour gives `'sent'`. Separately, 5 entries at 61–119 min ago gives `'sent'`. Use `last_sent` = 5 min ago in both.
- B22 daily cap: 10 entries spread between 2 h and 23 h ago, and `last_sent` = 2 h ago, gives `'capped'` and no column changes.
- B23: 9 entries in 2–23 h gives `'sent'`. 10 entries at 24h1m–30h ago gives `'sent'`, and afterwards `send_log.length === 1`.
- B24: user with `role: null`. The request gives `'sent'`, `sendSms` is called once, the code fields are set, and `readUser(id).role` is `null`.
- B25: that role-less user:
  - a wrong-code verify gives `ok:false`, and `role` is still `null`;
  - the correct code gives `ok:true`, `result.user.role.type === 'authenticated'`, the DB role id equals `await svc().authenticatedRoleId()`, and `typeof result.jwt === 'string'`.
- B26 custom role:
  - Create a role with `strapi.db.query(ROLE_UID).create({ data: { name: 'SMS Login Test Manager', description: 'test', type: 'sms-login-test-manager' } })`. Create it once in a `beforeAll` of this describe, or reuse it if it already exists: `findOne` by type first.
  - Create a user with that role id. Request, then verify gives `ok:true`. The DB role id is unchanged, and `result.user.role.type === 'sms-login-test-manager'`.
  - Repeat with an authenticated-role user: the role id is unchanged.
- B27:
  - A role-less **blocked** user gives `'ineligible'`, 0 SMS, and role stays null.
  - Then, in `try/finally`, toggle `email_confirmation`:
    ```js
    const store = strapi.store({ type:'plugin', name:'users-permissions' });
    const adv = await store.get({ key:'advanced' });
    await store.set({ key:'advanced', value:{ ...adv, email_confirmation:true } });
    ```
    With it on, a role-less `confirmed:false` user gives `'ineligible'`, 0 SMS, and role stays null.
  - In `finally`, run `await store.set({ key:'advanced', value: adv })`.
- `resolveUser` duplicate rule: create two users with the same phone (the second via `makeUser`, then `setCols(second.id, { phoneNumber: e164(first.digits) })`). `resolveUser(first.digits).user.id === first.user.id` (the lowest id).

Datetime columns may come back from sqlite as strings or Dates. Always compare via `new Date(x).getTime()`.

**D. `tests/app.test.js`:** append `require('./auth/sms-login');` as the last line.

### Done when
- `node --check` passes on `src/api/auth/services/sms-login.js`, `src/api/auth/services/index.js` and `tests/auth/sms-login.js`.
- `yarn test` passes: every case above is green, with no new failures versus the T1 baseline.
- `grep -n "timingSafeEqual\|randomInt" src/api/auth/services/sms-login.js` shows both.
- `grep -n "strapi.log\|console" src/api/auth/services/sms-login.js` shows no interpolation of `code`, `codeStr`, `smsBody(` or `sms_login_code_hash`, and no `console` calls at all.
- `grep -n "role" src/api/auth/services/sms-login.js` shows `role` written only in `verifyCode`'s match branch.
- `git diff --stat -- src/api/sms src/api/auth/controllers/phone-verification.js package.json yarn.lock` is empty.

---

## Task 3 [BE]: Add the `sms-login` controller, `auth: false` routes and HTTP tests
**Status: DONE** (steward-bank `d20c3f2`)
Depends on: Task 2
Parallel-safe with: T4–T8 (other repo)
Covers: AC-B1, B3, B6, B7, B8, B15 (HTTP deep-equality), B16 (controller part), B17, B18, B25 (`/users/me` part)

### Files
- `src/api/auth/controllers/sms-login.js`: new
- `src/api/auth/controllers/index.js`: register `'sms-login'`
- `src/api/auth/routes/sms-login.js`: new
- `src/api/auth/routes/index.js`: spread the new routes
- `tests/auth/sms-login.js`: append a second top-level `describe('sms-login HTTP', ...)`

### Current state
`src/api/auth/controllers/index.js`:
```js
'use strict';

const phoneVerification = require('./phone-verification');

module.exports = {
  'phone-verification': phoneVerification
};
```
`src/api/auth/routes/index.js`:
```js
'use strict';

const phoneVerification = require('./phone-verification');

module.exports = {
  routes: [
    ...phoneVerification.routes
  ]
};
```
`src/api/auth/routes/phone-verification.js` shows the route object shape (`method`, `path`, `handler: 'phone-verification.phoneSignup'`, `config: { policies: [], middlewares: [] }`).

Precedent for `auth: false`: `src/api/garden/routes/01-custom-garden.js:16`. No `01-` prefix is needed here: this API has no core router (design).

The service from T2 (`api::auth.sms-login`) exposes:
- `requestCode(raw)`, which returns `{ invalid, message }` or `{ invalid:false, outcome }`;
- `verifyCode(raw, code)`, which returns `{ ok:true, user, jwt }` or `{ ok:false, reason }`.

### Instructions
1. **`src/api/auth/controllers/sms-login.js`.** Use `'use strict'` and the factory form:
   ```js
   'use strict';

   const REQUEST_OK_BODY = Object.freeze({
     ok: true,
     message: 'If that number belongs to a Garden Steward account, a login code has been sent.',
     resendAfterSeconds: 60,
     expiresInSeconds: 600,
   });
   const VERIFY_FAIL_MESSAGE = 'Invalid or expired code';

   module.exports = ({ strapi }) => ({
     async request(ctx) {
       const { phoneNumber } = ctx.request.body || {};
       const result = await strapi.service('api::auth.sms-login').requestCode(phoneNumber);
       if (result.invalid) {
         return ctx.badRequest(result.message);
       }
       ctx.status = 200;
       ctx.body = { ...REQUEST_OK_BODY };
     },

     async verify(ctx) {
       const { phoneNumber, code } = ctx.request.body || {};
       const result = await strapi.service('api::auth.sms-login').verifyCode(phoneNumber, code);
       if (!result.ok) {
         return ctx.badRequest(VERIFY_FAIL_MESSAGE);
       }
       const userSchema = strapi.getModel('plugin::users-permissions.user');
       const user = await strapi.contentAPI.sanitize.output(result.user, userSchema, { auth: ctx.state.auth });
       ctx.status = 200;
       ctx.body = { jwt: result.jwt, user };
     },
   });
   ```
   - Do **not** read `ctx.state.user`. It is never set on `auth: false` routes.
   - Pass `ctx.state.auth` exactly as-is. A fabricated auth object would strip `role`.
   - Do not catch errors: unexpected exceptions go to Strapi's error middleware as 500.
   - Do not log anything that includes the body's `code`.
2. **`src/api/auth/controllers/index.js`:** add `const smsLogin = require('./sms-login');` and the entry `'sms-login': smsLogin`. Keep `'phone-verification'`.
3. **`src/api/auth/routes/sms-login.js`:**
   ```js
   'use strict';

   module.exports = {
     routes: [
       {
         method: 'POST',
         path: '/auth/sms-login/request',
         handler: 'sms-login.request',
         config: { auth: false, policies: [], middlewares: [] },
       },
       {
         method: 'POST',
         path: '/auth/sms-login/verify',
         handler: 'sms-login.verify',
         config: { auth: false, policies: [], middlewares: [] },
       },
     ],
   };
   ```
4. **`src/api/auth/routes/index.js`:** `const smsLogin = require('./sms-login');` and `routes: [...phoneVerification.routes, ...smsLogin.routes]`.
5. **No permission seeding.** Do not edit any `scripts/seed-*permissions*.js`, and do not grant Public-role permissions for these routes. `auth: false` bypasses users-permissions entirely (design, Permissions).
6. **Tests.** Append to `tests/auth/sms-login.js`, reusing the helpers from T2 in the same file.
   - Add `const request = require('supertest');` at the top.
   - Add `const { grantPrivileges } = require('../helpers/strapi');` at the top.
   - Use `const http = () => request(strapi.server.httpServer);` as in `tests/user/user.http.js`.
   - `beforeEach` stubs `sendSms` and `handleSms` with `patchService`, as in T2.
   - `beforeAll` of this describe:
     - `const authRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });`
     - `await grantPrivileges(authRole.id, 'plugin::users-permissions.user', ['me']);`
     - Note: design.md's example `grantPrivileges(1, 'plugin::users-permissions.controllers.user.me')` passes no `routes` array, so with this helper's signature `(roleID, modelUID, routes)` it is a no-op. Use the form above.
     - If this helper call throws, remove it. The v5 default Authenticated role already allows `user.me`. Confirm `/api/users/me` returns 200 without it.
   - Never send an `Authorization` header to the sms-login endpoints.

   Required cases:
   - **B1:** create an eligible user and POST `/api/auth/sms-login/request` with body `{ phoneNumber: '(720) 555-xxxx' }`, the formatted version of its digits.
     - The response is 200, and `res.body` `toEqual` exactly `{ ok: true, message: 'If that number belongs to a Garden Steward account, a login code has been sent.', resendAfterSeconds: 60, expiresInSeconds: 600 }`.
     - `sendSms` is called once with `(e164(digits), stringMatching(/\d{6}/))`, and `handleSms` is not called.
   - **B3:** request for an unregistered number (`nextPhoneDigits()` never created), and for a blocked user.
     - Each `res.body` `toEqual` the B1 body, and `sendSms` is not called.
     - The blocked user's `sms_login_*` columns are unchanged.
   - **B6:**
     - `{}` gives 400 with `res.body.error.message === 'Phone number is required'`.
     - `{ phoneNumber: '123' }` gives 400 with `error.message` equal to `'Invalid US phone number format. Please provide a 10-digit number with or without the country code.'`.
     - `sendSms` is not called.
   - **B7:** request, then verify with the correct code (as a **string**). The response is 200 with:
     - `typeof body.jwt === 'string'`;
     - `typeof body.user.id === 'number'` and `typeof body.user.documentId === 'string'`;
     - `body.user.role.type === 'authenticated'`;
     - none of these keys on `body.user`: `password`, `resetPasswordToken`, `confirmationToken`, `email_verification_token`, `email_verification_expires`, `sms_login_code_hash`, `sms_login_code_expires`, `sms_login_attempts`, `sms_login_last_sent`, `sms_login_send_log`.
   - **B8:** with the B7 jwt, `GET /api/users/me` with `Authorization: Bearer <jwt>` returns 200 with the same `id`, and the body has no key starting with `sms_login_`.
   - **B10 / B15:**
     - a wrong code gives 400 with `body` `toEqual({ data: null, error: { status: 400, name: 'BadRequestError', message: 'Invalid or expired code', details: {} } })`;
     - verify for an unregistered number, `phoneNumber: '123'`, `code: '12345'`, `code: 'abcdef'` and a missing `code` each give a body `toEqual` to that wrong-code body;
     - the malformed-code calls do not change `sms_login_attempts` on the user with the active code.
   - **B25 (HTTP):** a role-less user (`makeUser({ role: null })`) does request, then verify. The response is 200 with `body.user.role.type === 'authenticated'`, and `GET /api/users/me` with the returned jwt gives 200 with the same `id`.
   - **B26 (HTTP):** a user with the `sms-login-test-manager` role (reuse it or create it as in T2) does request, then verify. `body.user.role.type === 'sms-login-test-manager'`, and the DB role id is unchanged.

### Done when
- `node --check` passes on all four `src/api/auth/**` files touched and on `tests/auth/sms-login.js`.
- `yarn test` passes, with no failures beyond the T1 baseline. Both `sms-login service` and `sms-login HTTP` suites are green.
- `grep -n "jwt').issue\|jwt\").issue" src/api/auth/services/sms-login.js` matches.
- `grep -n "ctx.state.user" src/api/auth/controllers/sms-login.js` has no matches.
- `git diff --stat -- src/api/sms/services/sms.js src/api/auth/controllers/phone-verification.js package.json yarn.lock scripts/` is empty (AC-B17).
- Report `git status --short` in your hand-off. Do not commit.

---

## Task 4 [FE]: Fix the `status` filter bug by using `task_status`
**Status: DONE** (garden-vue `6471576`)
Depends on: nothing
Parallel-safe with: everything (T1–T3 are the other repo; T5–T7 touch other files)
Covers: AC-F13

### Files
- `src/stores/garden-task.store.js`: lines 64 and 224
- `src/components/VolunteerActivity.vue`: line 24

### Current state
- In `garden-task` (Strapi v5, `draftAndPublish: true`), `status` is the draft/publish query parameter. The server rejects `filters[status]` with 400 "Invalid key status".
- The real attribute is `task_status`: an uppercase enum (`FINISHED`, `STARTED`, `PENDING`, …) with **no default**, so some rows are NULL.

`src/stores/garden-task.store.js:64` (`getGardenTasks`):
```js
return fetchWrapper.get(`${baseUrl}?populate[0]=volunteers&populate[1]=recurring_task&populate[2]=primary_image&populate[3]=instruction&filters[garden][id][$eq]=${gardenId}&filters[status][$nei]=finished`)
```
`src/stores/garden-task.store.js:224` (`getTasksByGardenSlug`):
```js
return fetchWrapper.get(`${baseUrl}?populate[0]=volunteers&populate[1]=recurring_task&populate[2]=primary_image&populate[3]=garden&populate[4]=instruction&filters[garden][slug][$eq]=${slug}&filters[status][$nei]=finished`)
```
`src/components/VolunteerActivity.vue:24`:
```js
`${import.meta.env.VITE_API_URL}/api/garden-tasks?filters[garden][id][$eq]=${props.gardenId}&filters[status][$in][0]=FINISHED&filters[status][$in][1]=STARTED&filters[status][$in][2]=PENDING&populate=volunteers&populate=recurring_task&sort[0]=updatedAt:desc&pagination[limit]=20`
```

### Instructions
1. If `node_modules/` is missing in garden-vue, run `yarn install --frozen-lockfile` (see Global rules).
2. On lines 64 and 224, replace the trailing `&filters[status][$nei]=finished` with exactly:
   `&filters[$or][0][task_status][$ne]=FINISHED&filters[$or][1][task_status][$null]=true`
   The `$null` branch keeps tasks whose `task_status` was never set. A bare `$ne` would drop NULL rows. Change nothing else on those lines.
3. On `VolunteerActivity.vue:24`, replace each `filters[status][$in][N]` with `filters[task_status][$in][N]`, keeping the values `FINISHED`, `STARTED`, `PENDING` and indices 0, 1, 2. Change nothing else.
4. Do not commit.

### Done when
- `grep -rn "filters\[status\]" src/` prints nothing.
- `grep -c "filters\[\$or\]\[0\]\[task_status\]\[\$ne\]=FINISHED&filters\[\$or\]\[1\]\[task_status\]\[\$null\]=true" src/stores/garden-task.store.js` prints `2`.
- `npx eslint src/stores/garden-task.store.js src/components/VolunteerActivity.vue --no-fix` reports no errors that were not already present at `af00ff9`. Check with `git stash` if unsure, then `git stash pop`.
- `git diff --stat` shows only those two files.

---

## Task 5 [FE]: Add session helper, SMS-code actions and login-modal state to the auth store
**Status: DONE** (garden-vue `e8098ec`)
Depends on: nothing
Parallel-safe with: T1–T3 (other repo), T4
Covers: AC-F1, AC-F2 (and the store side of F5, F7, F9)

### Files
- `src/stores/auth.store.js`

### Current state (entire relevant part)
```js
import { defineStore } from 'pinia';
import { fetchWrapper, router } from '@/helpers';
const baseUrl = `${import.meta.env.VITE_API_URL}`;
import { localStorageTokenKey } from '../constants';

export const useAuthStore = defineStore({
    id: 'auth',
    state: () => ({
        user: JSON.parse(localStorage.getItem('user')),
        auth: { accessToken: localStorage.getItem(localStorageTokenKey) },
        returnUrl: null
    }),
    getters: { isLoggedIn: ..., isAdmin: (state) => state.user?.role?.type === 'administrator' },
    actions: {
        async initGoogle() { ... },
        async loginGoogle(code) { ... },
        async login(username, password) {
            const {jwt, user} = await fetchWrapper.post(`${baseUrl}/api/auth/local?populate=role`, { identifier: username, password });
            console.log("login: ", user)
            this.user = user;
            this.auth.status = 'logged_in';
            this.auth.accessToken = jwt;
            localStorage.setItem('user', JSON.stringify(user));
            localStorage.setItem(localStorageTokenKey, jwt);
            router.push(this.returnUrl || '/manage');
        },
        async forgot(email) { ... },
        async setPassword(...) { ... },
        logout() { ... router.push('/login'); }
    }
});
```

`fetchWrapper` (`src/helpers/fetch-wrapper.js`) behaves as follows:
- It attaches `Authorization: Bearer` only when the store has both `user` and `accessToken`, so it sends none while logged out.
- On a non-2xx with a Strapi error envelope, it rejects with `{ message, details, status }`.
- On a non-JSON error, it rejects with a string. On a network failure, it rejects with a `TypeError`.
- It calls `logout()` only on 401/403 while `user` is set.

API contract (design.md, "API contract"):
- `POST ${VITE_API_URL}/api/auth/sms-login/request` with body `{ "phoneNumber": "5551234567" }`, 10 digits only.
  - 200 returns `{ ok, message, resendAfterSeconds: 60, expiresInSeconds: 600 }`.
  - 400 returns the Strapi error envelope.
- `POST ${VITE_API_URL}/api/auth/sms-login/verify` with body `{ "phoneNumber": "5551234567", "code": "012345" }`. `code` is a **string**.
  - 200 returns `{ jwt, user }`, where `user` includes a populated `role`. Numeric `id` and string `documentId` are both present. Nothing in this flow keys on either.
  - Every failure returns 400 `"Invalid or expired code"`.
- Both endpoints are unauthenticated. Branch only on HTTP status.

### Instructions
1. If `node_modules/` is missing, run `yarn install --frozen-lockfile`.
2. State: add `loginModalOpen: false` after `returnUrl: null`.
3. Add the action `setSession(jwt, user)`. It performs exactly the five writes `login()` does today:
   ```js
   setSession(jwt, user) {
       this.user = user;
       this.auth.status = 'logged_in';
       this.auth.accessToken = jwt;
       localStorage.setItem('user', JSON.stringify(user));
       localStorage.setItem(localStorageTokenKey, jwt);
   },
   ```
4. Replace `login` with the version below. It uses the same endpoint and query string as before, and `LoginView.vue` keeps calling `login(username, password)` unchanged.
   ```js
   async login(username, password, { redirect = true } = {}) {
       const { jwt, user } = await fetchWrapper.post(`${baseUrl}/api/auth/local?populate=role`, { identifier: username, password });
       this.setSession(jwt, user);
       if (redirect) {
           router.push(this.returnUrl || '/manage');
       }
       return user;
   },
   ```
   Drop the `console.log("login: ", user)` line. No copy of the localStorage writes may remain in `login` (AC-F2).
5. Add these actions:
   ```js
   async requestSmsCode(phone) {
       const phoneNumber = String(phone ?? '').replace(/\D/g, '');
       return fetchWrapper.post(`${baseUrl}/api/auth/sms-login/request`, { phoneNumber });
   },
   async verifySmsCode(phone, code) {
       const phoneNumber = String(phone ?? '').replace(/\D/g, '');
       const { jwt, user } = await fetchWrapper.post(`${baseUrl}/api/auth/sms-login/verify`, { phoneNumber, code: String(code ?? '').trim() });
       this.setSession(jwt, user);
       return user;
   },
   openLoginModal(returnUrl) {
       this.returnUrl = returnUrl || null;
       this.loginModalOpen = true;
   },
   closeLoginModal() {
       this.loginModalOpen = false;
       this.returnUrl = null;
   },
   finishModalLogin() {
       const target = this.returnUrl;
       this.loginModalOpen = false;
       this.returnUrl = null;
       if (target) {
           router.push(target);
       }
   },
   ```
   - **Deliberate exception to the `handleError` → alert convention:** `requestSmsCode` and `verifySmsCode` must **reject** to their caller, because the modal shows errors inline. Do not catch them or call `useAlertStore` here.
   - `verifySmsCode` does **not** navigate.
6. Do not change `initGoogle`, `loginGoogle`, `forgot`, `setPassword`, `logout` or the getters.
7. Do not commit.

### Done when
- `npx eslint src/stores/auth.store.js --no-fix` shows no new errors.
- `grep -c "localStorage.setItem('user'" src/stores/auth.store.js` prints `2`: one in `setSession` and the existing one in `loginGoogle`.
- `grep -n "loginModalOpen\|setSession\|requestSmsCode\|verifySmsCode\|openLoginModal\|closeLoginModal\|finishModalLogin" src/stores/auth.store.js` shows every name.
- `git diff --stat` shows only `auth.store.js`.

---

## Task 6 [FE]: Build `LoginModal.vue` and mount it globally in `App.vue`
**Status: DONE** (garden-vue `b86a1a0`)
Depends on: Task 5 (uses its store actions and state)
Parallel-safe with: T1–T3 (other repo), T4, T7
Covers: AC-F3 (dismissal), F5, F6, F7, F8, F9, F10 (UI parts)

### Files
- `src/components/modals/LoginModal.vue`: new
- `src/components/modals/index.js`: add the export
- `src/App.vue`: mount the modal

### Current state
- `src/App.vue`:
  ```vue
  <script setup>
  import { Nav, Alert } from '@/components';
  import Footer from '@/components/Footer.vue';
  import { RouterView } from 'vue-router';
  import '@fortawesome/fontawesome-free/css/all.css'
  </script>

  <template>
      <div class="app-container">
          <Nav />
          <Alert />
          <div class="container px-0 pb-4 md:px-4 md:pt-4 pt-[5px]"> <RouterView /> </div>
          <Footer />
      </div>
  </template>
  ```
- `src/components/modals/index.js` has 7 lines of `export { default as X } from './X.vue';`.
- `index.html` has `<div id="modals" class="relative z-20"></div>`, the Teleport target.
- Dark mode is the `dark` class on `<html>`, toggled by `Nav.vue`. Tailwind has `darkMode: 'class'`.
- **Template to copy from:** `src/components/modals/PhoneLoginModal.vue`. Reuse:
  - its `formatPhoneNumber` / `handlePhoneInput` / `isValidPhone` logic (lines 29-53);
  - the backdrop + centered panel + close-X markup (lines 106-130);
  - its scoped light-mode CSS (lines 197-331), renamed from `phone-modal-*` to `login-modal-*`.
- **Dark-mode pattern to copy:** `src/components/modals/SmsCampaignModal.vue` lines 610-630. That file adds a second, **non-scoped** `<style>` block with `html.dark .sms-modal-*` rules using `!important`, including the `-webkit-autofill` override.
- Store API from T5 (`useAuthStore()`):
  - state: `loginModalOpen`, `returnUrl`;
  - actions: `requestSmsCode(phone)`, `verifySmsCode(phone, code)`, `login(u, p, { redirect:false })`, `closeLoginModal()`, `finishModalLogin()`.
- Error shapes from `fetchWrapper`:
  - a Strapi error rejects with `{ message, status }`;
  - a non-JSON error rejects with a string;
  - a network failure rejects with a `TypeError`.
- Contract: request returns 200 or 400 (`error.message` is displayable). Verify returns 200 `{ jwt, user }` or 400. Branch **only on status**.

### Instructions
1. If `node_modules/` is missing, run `yarn install --frozen-lockfile`.
2. **Create `src/components/modals/LoginModal.vue`**, `<script setup>`, no props, no emits. It is rendered only while `auth.loginModalOpen` is true (App.vue controls that).

   Script:
   - Imports: `ref`, `computed`, `nextTick`, `watch`, `onMounted`, `onBeforeUnmount` from `vue`; `useAuthStore` from `@/stores`.
   - Constants:
     - `RESEND_SECONDS = 60`
     - `GENERIC_SEND_ERROR = "Couldn't send a code. Try again or use email & password."`
     - `INVALID_CODE_ERROR = 'That code is invalid or expired.'`
   - Refs:
     - `step` (`'phone' | 'code' | 'email'`, initially `'phone'`);
     - `phoneDisplay` (formatted string); `code`; `email`; `password`;
     - `error` (string); `info` (string, e.g. "New code sent."); `isSubmitting` (bool);
     - `resendRemaining` (number, 0 means enabled);
     - template refs `phoneInput`, `codeInput`, `emailInput`.
   - `formatPhoneNumber(value)`: copy it verbatim from PhoneLoginModal, and cap digits at 10 with `value.replace(/\D/g, '').slice(0, 10)`.
   - `phoneDigits = computed(() => phoneDisplay.value.replace(/\D/g, ''))` and `isValidPhone = computed(() => phoneDigits.value.length === 10)`.
   - Countdown:
     - `let timer = null`.
     - `startCountdown()` sets `resendRemaining.value = RESEND_SECONDS`, clears any existing timer, then runs `timer = setInterval(() => { resendRemaining.value -= 1; if (resendRemaining.value <= 0) { resendRemaining.value = 0; clearInterval(timer); timer = null; } }, 1000)`.
     - Clear the timer in `onBeforeUnmount`.
   - `focusStep()`: `await nextTick()`, then focus `phoneInput`, `codeInput` or `emailInput` according to `step`. Call it in `onMounted`, and in `watch(step, focusStep)`.
   - `sendErrorMessage(err)`: return `err && err.status === 400 && err.message ? err.message : GENERIC_SEND_ERROR`.
   - `submitPhone()`:
     - Guard on `isValidPhone`. Set `isSubmitting = true`, `error = ''`.
     - Run `await auth.requestSmsCode(phoneDigits.value)`.
     - On success: `step = 'code'`, `code = ''`, `startCountdown()`.
     - On catch: `error = sendErrorMessage(err)`.
     - `finally`: `isSubmitting = false`.
     - Move to the code step on **any** 200, whatever the backend did.
   - `resend()`:
     - Guard on `resendRemaining > 0 || isSubmitting`. Call `requestSmsCode` again.
     - On success: `info = 'New code sent.'`, `error = ''`, `startCountdown()`.
     - On catch: `error = sendErrorMessage(err)`. Stay on the code step.
   - `submitCode()`:
     - Guard on `/^\d{6}$/.test(code)`. Set `isSubmitting = true`, `error = ''`.
     - Run `await auth.verifySmsCode(phoneDigits.value, code.value)`, then `auth.finishModalLogin()`.
     - On **any** failure: `error = INVALID_CODE_ERROR`, `code = ''`, `focusStep()`. Stay on `'code'`. Do not navigate or log out.
     - `finally`: `isSubmitting = false`.
   - `onCodeInput(e)`: `code.value = e.target.value.replace(/\D/g, '').slice(0, 6)`.
   - `useDifferentNumber()`: `step = 'phone'`, `error = ''`, `info = ''`, `code = ''`.
   - `useEmail()`: `step = 'email'`, `error = ''`, `info = ''`. `usePhone()`: `step = 'phone'`, `error = ''`, `info = ''`.
   - `submitEmail()`:
     - Guard on non-empty `email` and `password`. Set `isSubmitting` and clear `error`.
     - Run `await auth.login(email.value, password.value, { redirect: false })`, then `auth.finishModalLogin()`.
     - On catch: `error = (err && err.message) || (typeof err === 'string' ? err : 'Login failed. Check your email and password.')`.
     - `finally`: `isSubmitting = false`.
   - `close()`: `auth.closeLoginModal()`.
   - Escape handling: `onKeydown = (e) => { if (e.key === 'Escape') close(); }`. Add it with `window.addEventListener('keydown', onKeydown)` in `onMounted`, and remove it in `onBeforeUnmount`.

   Template:
   - Root is `<Teleport to="#modals">`, containing `<div class="login-modal-wrapper">`.
   - Backdrop: `<div class="login-modal-backdrop" @click="close">`.
   - Centering layer: `fixed inset-0 flex items-center justify-center p-4` with `@click="close"`.
   - Panel: `<div class="login-modal-content" role="dialog" aria-modal="true" aria-labelledby="login-modal-title" @click.stop>`.
     - Close X button, `type="button"`, `aria-label="Close"`, `@click="close"`.
     - `<h2 id="login-modal-title" class="login-modal-title">Log in to continue</h2>`.
   - **Phone step** (`v-if="step === 'phone'"`): a `<form @submit.prevent="submitPhone">` containing:
     - label "Phone number";
     - `<input ref="phoneInput" id="login-modal-phone" type="tel" autocomplete="tel" :value="phoneDisplay" @input="phoneDisplay = formatPhoneNumber($event.target.value)" placeholder="(555) 555-5555" class="login-modal-input">`;
     - the error `<p class="login-modal-error">` if `error`;
     - a submit button "Text me a code", `:disabled="!isValidPhone || isSubmitting"`, showing "Sending..." while submitting;
     - a link-style `<button type="button" class="login-modal-link" @click="useEmail">Use email &amp; password instead</button>`.
   - **Code step** (`v-else-if="step === 'code'"`):
     - `<p class="login-modal-subtitle">If that number has an account, we texted a code.</p>`;
     - `<p>Sent to {{ phoneDisplay }} <button type="button" class="login-modal-link" @click="useDifferentNumber">Use a different number</button></p>`;
     - a form with `@submit.prevent="submitCode"` containing `<input ref="codeInput" id="login-modal-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\d{6}" :value="code" @input="onCodeInput" class="login-modal-input" placeholder="123456">`;
     - the error if `error`, and the info `<p class="login-modal-info">` if `info`;
     - a submit button "Verify", `:disabled="code.length !== 6 || isSubmitting"`;
     - a resend `<button type="button" class="login-modal-link" :disabled="resendRemaining > 0 || isSubmitting" @click="resend">`, with text `{{ resendRemaining > 0 ? `Resend in ${resendRemaining}s` : 'Resend code' }}`;
     - the "Use email & password instead" link.
   - **Email step** (`v-else`):
     - a form with `@submit.prevent="submitEmail"`;
     - `<input ref="emailInput" type="email" autocomplete="username" v-model="email" class="login-modal-input">`;
     - `<input type="password" autocomplete="current-password" v-model="password" class="login-modal-input">`;
     - the error if `error`;
     - a submit button "Log in";
     - `<button type="button" class="login-modal-link" @click="usePhone">Use a text code instead</button>`.

   Styles:
   - `<style scoped>`: copy PhoneLoginModal's light-mode rules, renamed to `login-modal-*` (wrapper, backdrop, content, close, title, subtitle, label, input, input focus, info, btn and its states, error).
     - Use a single `.login-modal-btn` with `background-color:#16a34a`, `:hover:not(:disabled)` `#15803d`, and `:disabled` `opacity:.5; cursor:not-allowed`.
     - Add `.login-modal-link { color:#16a34a; text-decoration:underline; font-size:.875rem; background:none; border:none; cursor:pointer; }` with `:disabled { opacity:.5; cursor:not-allowed; text-decoration:none; }`.
     - Keep `.login-modal-wrapper { z-index: 10001; }`.
   - A second, **non-scoped** `<style>` block, following the SmsCampaignModal pattern, with `!important`:
     ```css
     html.dark .login-modal-backdrop { background-color: rgba(0,0,0,0.8) !important; }
     html.dark .login-modal-content { background-color: #2d3e26 !important; color: #f5f5f5 !important; border: 1px solid #3d4d36 !important; }
     html.dark .login-modal-title, html.dark .login-modal-label { color: #f5f5f5 !important; }
     html.dark .login-modal-subtitle, html.dark .login-modal-info { color: #d0d0d0 !important; }
     html.dark .login-modal-input { background-color: #344a34 !important; border-color: #3d4d36 !important; color: #f5f5f5 !important; }
     html.dark .login-modal-input::placeholder { color: #a8b89e !important; }
     html.dark .login-modal-input:focus { box-shadow: 0 0 0 2px #8aa37c !important; }
     html.dark .login-modal-input:-webkit-autofill,
     html.dark .login-modal-input:-webkit-autofill:hover,
     html.dark .login-modal-input:-webkit-autofill:focus { -webkit-box-shadow: 0 0 0 1000px #344a34 inset !important; -webkit-text-fill-color: #f5f5f5 !important; caret-color: #f5f5f5; }
     html.dark .login-modal-btn { background-color: #8aa37c !important; }
     html.dark .login-modal-btn:hover:not(:disabled) { background-color: #6b8560 !important; }
     html.dark .login-modal-link { color: #8aa37c !important; }
     html.dark .login-modal-error { color: #f87171 !important; }
     html.dark .login-modal-close:hover { color: #f5f5f5 !important; }
     ```
   - No `darkMode` prop. Use no dynamic Tailwind color classes, so no safelist change is needed.
3. **`src/components/modals/index.js`:** append `export { default as LoginModal } from './LoginModal.vue';`
4. **`src/App.vue`:**
   - In `<script setup>`, add `import { LoginModal } from '@/components/modals';`, `import { useAuthStore } from '@/stores';` and `const auth = useAuthStore();`.
   - In the template, add `<LoginModal v-if="auth.loginModalOpen" />` directly after `<Alert />`.
   - Change nothing else.
5. Do not touch `PhoneLoginModal.vue`, `LoginView.vue` or `router.js` (T7 owns `router.js`).
6. Do not commit.

### Done when
- `npx eslint src/components/modals/LoginModal.vue src/components/modals/index.js src/App.vue --no-fix` shows no errors.
- `grep -n 'autocomplete="one-time-code"' src/components/modals/LoginModal.vue` and `grep -n 'inputmode="numeric"'` both match. `grep -n 'role="dialog"'` and `grep -n 'aria-modal="true"'` both match.
- `git diff --stat` shows only the three files. `LoginModal.vue` is untracked-new.

---

## Task 7 [FE]: Open the login modal from the router guard instead of redirecting to `/login`
**Status: DONE** (garden-vue `e8098ec`)
Depends on: Task 5 (calls `auth.openLoginModal`)
Parallel-safe with: T1–T3 (other repo), T4, T6
Covers: AC-F3, AC-F4, AC-F11 (routing parts)

### Files
- `src/helpers/router.js`: the `beforeEach` at lines 188-222 only

### Current state
```js
router.beforeEach(async (to) => {
    const publicPages = [ ... ];
    const isPublicRoute = publicPages.includes(to.path) || ...;
    const authRequired = to.meta.requiresAuth || to.path.startsWith('/manage/');
    const auth = useAuthStore();

    if (authRequired && !auth.user) {
        auth.returnUrl = to.fullPath;
        return '/login';
    }
});
```

### Instructions
1. If `node_modules/` is missing, run `yarn install --frozen-lockfile`.
2. Change the guard signature to `async (to, from) =>`.
3. Replace the body of the `if (authRequired && !auth.user)` block with:
   ```js
   auth.openLoginModal(to.fullPath);
   // First load / deep link (START_LOCATION has no matched records): render the public home behind the modal.
   if (from.matched.length === 0) {
       return '/';
   }
   // In-app navigation: stay on the current page with the modal on top.
   return false;
   ```
4. Leave `publicPages`, `isPublicRoute` and `authRequired` exactly as they are. `isPublicRoute` is already unused; do not remove it, to keep the diff minimal.
5. Do not change `logout()` or anything that pushes `/login`. The expired-session path must keep going to `/login`.
6. Do not commit.

### Done when
- `npx eslint src/helpers/router.js --no-fix` reports no errors that were not present at `af00ff9`.
- `grep -n "return '/login'" src/helpers/router.js` has no matches, and `grep -n "openLoginModal" src/helpers/router.js` has one match.
- `git diff --stat` shows only `router.js`.

---

## Task 8 [FE]: Build and lint gate for all garden-vue changes
**Status: DONE** (inspection: `vite build` exit 0; eslint clean apart from the `router.js` `isPublicRoute` error that already exists at `af00ff9`)
Depends on: Task 4, Task 6, Task 7
Parallel-safe with: T3
Covers: AC-F12, AC-F2 (code review), AC-F13 (grep)

### Files
- None expected. Fix-ups only if the build breaks, and only in files touched by T4–T7.

### Instructions
1. If `node_modules/` is missing, run `yarn install --frozen-lockfile`.
2. Run `yarn build`. It must succeed. If it fails, fix only the offending lines in T4–T7's files and report what you changed.
3. Run `npx eslint src/stores/auth.store.js src/stores/garden-task.store.js src/components/VolunteerActivity.vue src/components/modals/LoginModal.vue src/components/modals/index.js src/App.vue src/helpers/router.js --no-fix`. It must report no new errors versus `af00ff9`.
4. Run `git diff --exit-code -- package.json yarn.lock`. It must exit 0.
5. Run `grep -rn "filters\[status\]" src/`. It must print nothing.
6. Read `src/stores/auth.store.js` and confirm `login` delegates to `setSession`, with no duplicated localStorage writes (AC-F2).
7. Report `git status --short`, and `git diff --stat` against `af00ff9`. Do not commit.

### Done when
- Steps 2–6 all pass. `dist/` is produced (it is gitignored, so do not commit it).

---

## Task 9 [E2E]: Manual end-to-end verification (dispatcher or human, not a subagent)
Depends on: Task 3, Task 8
Covers: AC-F1, F3–F11, F13 (UI-observable), and the deploy-skew check

This task is verification only, following design.md's "Verification plan" rows F1–F11, F5/F7/F13 and "Deploy skew".
- Run steward-bank `yarn develop` with `ENVIRONMENT=test`, so `sendSms` prints the code to the server console and Twilio is not called.
- Run garden-vue `yarn dev` with `VITE_API_URL=http://localhost:1337`.
- In DevTools, confirm:
  - request and verify bodies match the contract (digits-only phone, string code, no `Authorization` header);
  - `garden-tasks` calls use the `task_status` filters and return 200.
- Also check the deploy-skew case: the new FE against a backend without the routes shows the generic send error, and the email fallback still works.
- After this, the dispatcher produces the garden-vue patch against `af00ff9`.

---
---

# Fix round 1: inspection findings 1–6 (T10–T13)

Source: `/home/user/steward-bank/.claude/specs/sms-login/inspection.md` (verdict PASS WITH FINDINGS). Cameron approved fixing findings 1–6. This round also folds in the cheap "implementer test gaps" from that report, but only where they touch the same test file:
- make the B3 blocked-user "unchanged" check able to fail;
- strengthen B24;
- stop swallowing the `grantPrivileges` error.

Out of scope, so do not do these: per-IP limiting, HMAC hashing, any change to the controller's response bodies, `/auth/phone-signup`, and the router.js `isPublicRoute` lint error.

## Fix-round rules (in addition to the global rules at the top)

- **No commits in either repo.** Leave every change in the working tree. The dispatcher commits.
- **The backend tests need the env file sourced in the same shell as jest.** Copy these commands exactly:
  - Targeted (only the sms-login suites; Strapi still boots once):
    `cd /home/user/steward-bank && . /tmp/claude-0/-home-user-steward-bank/58bb94f2-7c36-57e6-96f6-28e4babfd573/scratchpad/test.env && NODE_ENV=test npx jest --runInBand tests/app.test.js -t "sms-login" 2>&1 | tail -80`
  - Full:
    `cd /home/user/steward-bank && . /tmp/claude-0/-home-user-steward-bank/58bb94f2-7c36-57e6-96f6-28e4babfd573/scratchpad/test.env && yarn test 2>&1 | tail -80`
- **Baseline before this round:** 3 failed / 458 passed / 461 total. The 3 failures are known and unrelated:
  - `transferTask` ×2;
  - `PROBE: garden-anchored day sheet › G2`.

  After each BE task, the full run must show **exactly those 3 failures**. The total grows by the number of tests you add.
- **Response bytes are frozen (AC-B3, AC-B15).**
  - Do not edit `src/api/auth/controllers/sms-login.js` or `src/api/auth/routes/sms-login.js`.
  - Every new failure path in the service returns an existing shape: `{ invalid: false, outcome: 'throttled' }` for request and `{ ok: false, reason: <string> }` for verify. The controller already maps these to the frozen 200 body and the frozen 400 body.
- **Test file rule.** `tests/auth/sms-login.js` is a plain module `require`d from `tests/app.test.js`. Do not rename it to `*.test.js`.
- **Test DB.** It is sqlite with `pool: { min: 1, max: 1 }` (`config/env/test/database.js`), so HTTP requests are effectively serialized.
  - Write concurrency tests by calling the **service** directly inside `Promise.all`. That is how the inspection reproduced Finding 1.
  - Do not use fake timers.
- **Logging.** Use `strapi.log.*` only. Never interpolate the code or a hash into a log line.
- `node --check <file>` must pass on every changed `.js` file.

## Dependency graph and parallel groups (fix round)

```
BE lane:  T10 [BE] atomic throttle/caps/attempts + concurrency tests
            ──►  T11 [BE] uniform DB work on verify/request (timing)
                   ──►  T12 [BE] reject non-string code + test-gap cleanups + contract text
FE lane:  T13 [FE] LoginModal: labels, wrapper stacking, resend guard   (no deps)
E2E:      T12 + T13  ──►  re-run the relevant T9 checks (dispatcher)
```

| Wave | Run concurrently | Why this is safe |
|---|---|---|
| A | T10 [BE], T13 [FE] | Different repos |
| B | T11 [BE] (T13 continues if it is still running) | T11 edits the same two files as T10, so it must wait for T10 |
| C | T12 [BE] | Same two files as T10 and T11 |
| D | T9 re-check (dispatcher) | Needs both lanes |

T10, T11 and T12 are **strictly serial**. All three edit `src/api/auth/services/sms-login.js` and `tests/auth/sms-login.js`. T13 never depends on a BE task. Nothing in this round changes the API contract as seen by the FE, which already sends `code` as a string.

---

## Task 10 [BE]: Make the resend throttle, send caps and 5-attempt limit atomic, with concurrency tests
Depends on: T1–T3 (done)
Parallel-safe with: T13 (other repo). **Not** parallel with T11 or T12, which edit the same files
Covers: inspection Finding 1; design intent for AC-B4, B11, B12, B20–B23 under concurrency. AC-B3 and AC-B15 bodies stay unchanged

### Files
- `src/api/auth/services/sms-login.js`: make the requestCode write conditional; make the verifyCode mismatch, success and expiry writes conditional or atomic
- `tests/auth/sms-login.js`: add a `describe('sms-login service concurrency', …)` block

### Current state
`src/api/auth/services/sms-login.js` (190 lines). These are the parts you change.

requestCode: the throttle and cap checks are done in JS on a stale read (lines 82–111). The write is then unconditional:
```js
    const now = Date.now();
    if (r.user.sms_login_last_sent && now - new Date(r.user.sms_login_last_sent).getTime() < RESEND_THROTTLE_MS) {
      ...return { invalid: false, outcome: 'throttled' };
    }
    const log = parseSendLog(r.user.sms_login_send_log);
    ...cap check → return { invalid: false, outcome: 'capped' };

    const code = generateCode();
    const nowIso = new Date(now).toISOString();

    await strapi.db.query(USER_UID).update({
      where: { id: r.user.id },
      data: {
        sms_login_code_hash: hashCode(r.user.id, code),
        sms_login_code_expires: new Date(now + CODE_TTL_MS).toISOString(),
        sms_login_attempts: 0,
        sms_login_last_sent: nowIso,
        sms_login_send_log: [
          ...log.filter((d) => d.getTime() > now - DAY_MS).sort((a, b) => a - b).map((d) => d.toISOString()),
          nowIso,
        ],
      },
    });

    try { ...sendSms(r.phoneNumber, smsBody(code)) ... }
```
verifyCode, expiry, mismatch and success (lines 151–188):
```js
    if (!r.user.sms_login_code_expires || new Date(r.user.sms_login_code_expires).getTime() <= Date.now()) {
      await strapi.db.query(USER_UID).update({
        where: { id: r.user.id },
        data: { sms_login_code_hash: null, sms_login_code_expires: null },
      });
      ...return { ok: false, reason: 'expired' };
    }

    if (!codeMatches(r.user.sms_login_code_hash, r.user.id, codeStr)) {
      const attempts = (r.user.sms_login_attempts ?? 0) + 1;          // stale read + 1: lost updates
      const data = { sms_login_attempts: attempts };
      if (attempts >= MAX_ATTEMPTS) { data.sms_login_code_hash = null; data.sms_login_code_expires = null; }
      await strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data });
      ...return { ok: false, reason };
    }

    const data = { sms_login_code_hash: null, sms_login_code_expires: null, sms_login_attempts: 0 };
    if (!r.user.role) {
      const roleId = await this.authenticatedRoleId();
      if (roleId === null) { strapi.log.error(...); return { ok: false, reason: 'no_auth_role' }; }
      data.role = roleId;
    }
    await strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data });   // unconditional: wins even after 5 failures
    const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: r.user.id });
    const user = await strapi.db.query(USER_UID).findOne({ where: { id: r.user.id }, populate: ['role'] });
    return { ok: true, user, jwt };
```
The inspection reproduced both races at service level:
- 20 parallel `requestCode` calls → 20 `sendSms` calls, send log length 1.
- 30 wrong codes plus 1 right code in parallel → the right code returned `ok: true` and attempts ended at 0.

Facts about the Strapi v5.36 internals that these instructions rely on (checked in `node_modules/@strapi/database`):
- `strapi.db.query(uid).updateMany({ where, data })` returns `{ count }`, the affected row count, on both sqlite and Postgres.
  - `where` values on datetime attributes are cast through the field's `toDB`, so `$lte` with an ISO string compares correctly in both dialects. Sqlite stores datetimes as epoch-ms integers.
  - `data` goes through `processData`, so the JSON `sms_login_send_log` is serialized exactly as `update` does it.
- Raw knex is `strapi.db.connection`. `knex(table).where(...).update(...)` resolves to the affected row count on both better-sqlite3 (`changes`) and pg (`rowCount`).
- Table and column names come from `strapi.db.metadata.get(USER_UID)`: `.tableName` (`up_users`) and `.attributes[<attr>].columnName`. Use the metadata rather than hard-coding them.

### Instructions
**Write the tests first** (step 1), run them, and confirm the new concurrency tests **fail** on the current code. Then fix the service (steps 2–5). Put the red-run counts in your report.

1. **Tests.** In `tests/auth/sms-login.js`, add a new top-level block after the `describe('sms-login service', …)` block ends (line 478) and before `const formatted = …`.
   - Name it `describe('sms-login service concurrency', () => { … })`.
   - Copy the same `beforeEach` that patches `sendSms` and `handleSms` with `patchService` (lines 31–37 are the template).
   - Reuse the module helpers `makeUser`, `readUser`, `setCols`, `codeFrom`, `wrongCode`, `agoIso` and `svc`.
   - Parse the send log the way B19 does: `Array.isArray(x) ? x : JSON.parse(x)`.

   Add these tests:
   - **`C1: 20 parallel requestCode calls send exactly one SMS`**
     - `makeUser()`, then `const results = await Promise.all(Array.from({ length: 20 }, () => svc().requestCode(digits)))`.
     - Expect `sendSms` to have been called 1 time.
     - Expect exactly 1 result to deep-equal `{ invalid: false, outcome: 'sent' }` and the other 19 to deep-equal `{ invalid: false, outcome: 'throttled' }`.
     - Expect the row's send log to have length 1.
     - Expect `svc().verifyCode(digits, codeFrom(sendSms))` to give `ok: true`. This proves the stored hash belongs to the code that was actually texted.
   - **`C2: a parallel burst cannot exceed the hourly cap`**
     - `makeUser()`, then `setCols` with `sms_login_last_sent: agoIso(2 * 60 * 1000)` and a `sms_login_send_log` of 4 entries at 2, 10, 20 and 30 minutes ago.
     - Burst 10 parallel `requestCode` calls.
     - Expect `sendSms` to have been called 1 time.
     - Expect the log to have 5 entries newer than 1 h.
   - **`C3: a parallel burst cannot exceed the daily cap`**
     - `makeUser()`, then `setCols` with `sms_login_last_sent: agoIso(2 * 60 * 60 * 1000)` and 9 log entries spread over 2–23 h ago. Copy the B23 loop at lines 340–344.
     - Burst 10 parallel `requestCode` calls.
     - Expect `sendSms` to have been called 1 time.
     - Expect the log length to be 10.
   - **`C4: 4 parallel wrong guesses are all counted, and the right code still works`**
     - `makeUser()` and request a code. Then run `Promise.all` of 4 `svc().verifyCode(digits, wrongCode(code))` calls.
     - Expect all 4 results to have `ok: false`.
     - Expect `row.sms_login_attempts` to be `4` exactly. This checks for lost updates.
     - Then expect `verifyCode(digits, code)` to give `ok: true`.
   - **`C5: 10 parallel wrong guesses stop at 5 attempts and kill the code`**
     - Request a code, then run `Promise.all` of 10 wrong verifies.
     - Expect all 10 results to have `ok: false`.
     - Expect `row.sms_login_attempts` to be `5`.
     - Expect `sms_login_code_hash` and `sms_login_code_expires` to be `null`.
     - Then expect `verifyCode(digits, code)` to give `ok: false`.
   - **`C6: the right code in a burst after 10 wrong guesses does not log in`**
     - Request a code. Build an array of 10 `svc().verifyCode(digits, wrongCode(code))` calls followed by **one** `svc().verifyCode(digits, code)` as the **last** element, and `Promise.all` it.
     - Expect the last result to have `ok: false` and no `jwt` property.
     - Expect `row.sms_login_attempts` to be `5`, and the hash and expiry to be `null`.
     - The ordering is deterministic on the single-connection sqlite pool, because every call issues the same queries in lockstep, so the right code's write is queued behind the wrong guesses' writes. **If C6 is flaky after the fix** (passes on some runs and fails on others), do not loosen it. Stop and report.
   - **`C7: role-less user — right code in a burst after failures does not assign a role`**
     - Same as C6, but with `makeUser({ role: null })`.
     - Additionally expect `row.role` to be `null`.
2. **Column helper.** Add this module-level helper to `sms-login.js`, below `parseSendLog`:
   ```js
   // Raw table/column names for the statements that need SQL expressions (atomic counters).
   const userColumns = (strapi) => {
     const meta = strapi.db.metadata.get(USER_UID);
     const col = (attr) => meta.attributes[attr].columnName;
     return {
       table: meta.tableName,
       HASH: col('sms_login_code_hash'),
       EXPIRES: col('sms_login_code_expires'),
       ATTEMPTS: col('sms_login_attempts'),
     };
   };
   ```
3. **requestCode: compare-and-set write.**
   - Keep the JS throttle and cap checks exactly as they are. They are the fast path and produce the `capped` log line.
   - Replace the unconditional `strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data: {…} })` with `updateMany`. Use the **same `data` object** and this `where`:
     ```js
     where: {
       id: r.user.id,
       $or: [
         { sms_login_last_sent: { $null: true } },
         { sms_login_last_sent: { $lte: new Date(now - RESEND_THROTTLE_MS).toISOString() } },
       ],
     },
     ```
   - Destructure `const { count } = await …`. If `count !== 1`:
     - log `strapi.log.debug(\`sms-login: requestCode outcome=throttled (concurrent send) user=${r.user.id}\`)`;
     - return `{ invalid: false, outcome: 'throttled' }`;
     - **do not** call `sendSms`.
   - Only when `count === 1` fall through to the existing `sendSms` block.
   - Add a 3-line comment above it explaining the logic. Only one concurrent request can move `sms_login_last_sent` out of the window. A loser's stale send-log read is therefore never written, and that is what makes the hourly and daily caps hold too.
4. **verifyCode: expiry write.**
   - Change the expiry-path `update` to `updateMany` with `where: { id: r.user.id, sms_login_code_hash: r.user.sms_login_code_hash }` and the same `data`.
   - This clears only the code we read, not a code a concurrent resend just issued. Ignore the count, and keep returning `{ ok: false, reason: 'expired' }`.
5. **verifyCode: atomic mismatch and conditional success.** Replace everything from `if (!codeMatches(` to `return { ok: true, user, jwt };` with:
   ```js
    const knex = strapi.db.connection;
    const { table, HASH, EXPIRES, ATTEMPTS } = userColumns(strapi);
    const storedHash = r.user.sms_login_code_hash;

    if (!codeMatches(storedHash, r.user.id, codeStr)) {
      // One atomic statement: increment attempts, and clear the code when this failure is the 5th.
      // Scoped to the code we compared against, so a guess at a replaced code never counts against the new one.
      const bumped = await knex(table)
        .where({ id: r.user.id, [HASH]: storedHash })
        .update({
          [ATTEMPTS]: knex.raw('COALESCE(??, 0) + 1', [ATTEMPTS]),
          [HASH]: knex.raw('CASE WHEN COALESCE(??, 0) + 1 >= ? THEN NULL ELSE ?? END', [ATTEMPTS, MAX_ATTEMPTS, HASH]),
          [EXPIRES]: knex.raw('CASE WHEN COALESCE(??, 0) + 1 >= ? THEN NULL ELSE ?? END', [ATTEMPTS, MAX_ATTEMPTS, EXPIRES]),
        });
      strapi.log.debug(`sms-login: verifyCode reason=mismatch counted=${bumped === 1} user=${r.user.id}`);
      return { ok: false, reason: 'mismatch' };
    }

    let roleId = null;
    if (!r.user.role) {
      roleId = await this.authenticatedRoleId();
      if (roleId === null) {
        strapi.log.error('sms-login: authenticated role not found; refusing to log in role-less user ' + r.user.id);
        return { ok: false, reason: 'no_auth_role' };
      }
    }

    // Claim the code atomically: succeeds only if it is still the code we matched and fewer than 5 failures are recorded.
    const claimed = await knex(table)
      .where({ id: r.user.id, [HASH]: storedHash })
      .andWhere((qb) => qb.whereNull(ATTEMPTS).orWhere(ATTEMPTS, '<', MAX_ATTEMPTS))
      .update({ [HASH]: null, [EXPIRES]: null, [ATTEMPTS]: 0 });
    if (claimed !== 1) {
      strapi.log.debug(`sms-login: verifyCode reason=claim_lost user=${r.user.id}`);
      return { ok: false, reason: 'claim_lost' };
    }

    if (roleId !== null) {
      await strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data: { role: roleId } });
    }

    const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: r.user.id });
    const user = await strapi.db.query(USER_UID).findOne({ where: { id: r.user.id }, populate: ['role'] });
    return { ok: true, user, jwt };
   ```
   - The role write now happens right after the code is claimed, not in the same statement. This is deliberate: `role` is a relation and cannot be set with a raw column update. The design invariants still hold:
     - the role is set only after a successful claim;
     - a missing `authenticated` role leaves the user completely unchanged, because it is checked **before** the claim.
   - The `'exhausted'` reason goes away, since it is no longer computed. No test asserts on `reason` (checked by grep), and the controller maps every `!ok` to the same 400.
   - Do not add a read-back query just for logging.
6. Do not change `resolveUser`, `isEligible`, `authenticatedRoleId`, `parseSendLog`, the constants or the SMS body.

### Done when
- `node --check src/api/auth/services/sms-login.js && node --check tests/auth/sms-login.js` passes.
- Your report includes the red run: C1–C7 were run against the unmodified service, and at minimum C1, C4, C5 and C6 failed.
- The targeted run (see the fix-round rules) passes, with every existing sms-login test plus C1–C7 green.
- The full `yarn test` run shows exactly the 3 known failures. Total = 461 + 7.
- `git diff --stat` shows only `src/api/auth/services/sms-login.js` and `tests/auth/sms-login.js`.
- `grep -n "update({ where: { id: r.user.id }, data })" src/api/auth/services/sms-login.js` returns nothing. No unconditional code or attempts write remains.

---

## Task 11 [BE]: Make verify and request do the same DB reads for registered and unknown numbers (timing)
Depends on: Task 10
Parallel-safe with: T13 (other repo). **Not** parallel with T10 or T12
Covers: inspection Finding 2 (verify unknown vs registered-no-code was 3.1 ms vs 4.1 ms because only registered users read the plugin store)

### Files
- `src/api/auth/services/sms-login.js`: add `advancedSettings()`, change `isEligible` to accept the settings, read the settings on every valid-phone path, and do a dummy compare on the early-exit verify paths
- `tests/auth/sms-login.js`: add a `describe('timing uniformity', …)` block

### Current state
After T10, the service still has:
```js
  async isEligible(user) {
    const advanced = await strapi.store({ type: 'plugin', name: 'users-permissions' }).get({ key: 'advanced' });
    return !!user && !user.blocked && (!(advanced && advanced.email_confirmation) || user.confirmed === true);
  },
```
Both `requestCode` and `verifyCode` return early on `!r.user` **before** calling `isEligible`. An unknown number therefore does 1 query (the user lookup), while a registered number does 2 (user lookup + plugin store). In `verifyCode` the paths `unknown`, `ineligible` and `no_code` (registered, no active code) send no SMS and write nothing. That makes the extra read a silent oracle.

`isEligible` is only called from this file (checked by grep).

### Instructions
1. Add a module constant after `hashCode`: `const DUMMY_HASH = hashCode(0, '000000');`. It is used to burn one `timingSafeEqual` on paths that have no stored hash.
2. Add a service method before `isEligible`:
   ```js
     async advancedSettings() {
       return strapi.store({ type: 'plugin', name: 'users-permissions' }).get({ key: 'advanced' });
     },
   ```
3. Change `isEligible` to:
   ```js
     async isEligible(user, advanced) {
       const adv = advanced === undefined ? await this.advancedSettings() : advanced;
       return !!user && !user.blocked && (!(adv && adv.email_confirmation) || user.confirmed === true);
     },
   ```
4. **requestCode.** Directly after `if (r.invalid) return r;`, add `const advanced = await this.advancedSettings();`. Change the eligibility call to `this.isEligible(r.user, advanced)`. Nothing else changes.
5. **verifyCode.**
   - Directly after the `if (r.invalid) { … }` block, add `const advanced = await this.advancedSettings();`.
   - Change the eligibility call to `this.isEligible(r.user, advanced)`.
   - On each of these three early returns, call `codeMatches(DUMMY_HASH, 0, codeStr);` (ignore the result) immediately before the `return`:
     - `reason: 'unknown'`;
     - `reason: 'ineligible'`;
     - `reason: 'no_code'`.
   - Do **not** add dummy work to the `expired` or `mismatch` paths. Both exist only after a code was actually texted, so they are not silent. This matches the design's accepted timing leak.
6. Tests. Add a block at the end of the service-level section, after the T10 concurrency block, named `describe('sms-login service timing uniformity', …)`. Use the same `sendSms`/`handleSms` `beforeEach`. In each test, wrap the real method so it still works:
   ```js
   const orig = svc().advancedSettings;
   const spy = patchService('api::auth.sms-login', 'advancedSettings', jest.fn(function (...a) { return orig.apply(this, a); }));
   ```
   - **`U1: verify reads advanced settings exactly once on unknown, registered-no-code and blocked paths`**
     - Call `verifyCode(nextPhoneDigits(), '123456')` and expect the result `{ ok: false, reason: 'unknown' }`. Then expect `spy` to have been called 1 time, and call `spy.mockClear()`.
     - Call `verifyCode` for a `makeUser()` with no requested code. Expect `reason: 'no_code'` and 1 call. `mockClear`.
     - Call `verifyCode` for a `makeUser({ blocked: true })`. Expect `reason: 'ineligible'` and 1 call.
   - **`U2: request reads advanced settings exactly once for unknown and blocked numbers`**
     - Call `requestCode(nextPhoneDigits())`. Expect outcome `unknown` and 1 call. `mockClear`.
     - Call it for a blocked user. Expect outcome `ineligible` and 1 call.
     - Expect `sendSms` not to have been called.
7. The existing B27 tests toggle `email_confirmation` through `strapi.store(...).set` and rely on it being read on every call. They must keep passing unchanged. Do **not** cache the settings across calls.

### Done when
- `node --check` passes on both changed files.
- The targeted run passes: all sms-login tests, including C1–C7, B27 and the new U1/U2.
- The full `yarn test` run shows exactly the 3 known failures.
- `git diff --stat` (relative to the T10 working tree) shows only the same two files. The controller is untouched.

---

## Task 12 [BE]: Reject non-string `code` without consuming an attempt; tighten three existing tests; align the contract text
Depends on: Task 11
Parallel-safe with: T13 (other repo). **Not** parallel with T10 or T11
Covers: inspection Finding 3, plus the test-quality items "B3 unchanged is trivially true", "B24 is partial" and "swallowed setup error"

### Files
- `src/api/auth/services/sms-login.js`: add a type guard at the top of `verifyCode`
- `tests/auth/sms-login.js`: add non-string code tests (service + HTTP); strengthen B3 (service + HTTP) and B24; fix the HTTP `beforeAll`
- `.claude/specs/sms-login/design.md`: update the contract wording only (3 small text edits below)

### Current state
Top of `verifyCode`:
```js
  async verifyCode(rawPhone, code) {
    const codeStr = String(code ?? '').trim();
    if (!/^\d{6}$/.test(codeStr)) {
      return { ok: false, reason: 'malformed' };
    }
```
`String(["123456"])` is `"123456"`. So an array code passes. A wrong array code uses up an attempt, and a right one logs in.

The contract in design.md (lines 288–289) currently says:
> `code` must be a **string**, so leading zeros survive. A JSON number is turned into a string and fails if it has fewer than 6 digits.

That second sentence **permits** a 6-digit JSON number. Cameron's decision for this round is stricter: **any non-string `code` (number, array, object, boolean, null, missing) → generic 400 with no attempt used.** The frontend always sends a string (verified F7), so no FE change is needed.

Test-gap context in `tests/auth/sms-login.js`:
- The service B3 (line 83) and HTTP B3 (line 522) blocked users are created with every `sms_login_*` column null. The "unchanged" loop can therefore never detect a write.
- B24 (line 370) checks only the hash and the role.
- The HTTP `beforeAll` (lines 494–501) wraps `grantPrivileges(authRole.id, 'plugin::users-permissions.user', ['me'])` in a `try/catch` that swallows every error.

### Instructions
1. **Service.** Replace the first two lines of `verifyCode` with:
   ```js
     async verifyCode(rawPhone, code) {
       if (typeof code !== 'string') {
         return { ok: false, reason: 'malformed' };
       }
       const codeStr = code.trim();
       if (!/^\d{6}$/.test(codeStr)) {
   ```
   This return comes before any DB access, like the existing malformed path.
2. **Service test.** Add this to the `describe('sms-login service', …)` block after B15:
   - **`B15b: non-string codes fail without touching attempts or the code`**
     - Call `makeUser()`, request a code, get `code`, and read `before`.
     - Run these in sequence and expect each to deep-equal `{ ok: false, reason: 'malformed' }`:
       - `[code]`;
       - `Number(code)`;
       - `{ code }`;
       - `null`;
       - `true`.
     - Then expect `after.sms_login_attempts` to equal `before.sms_login_attempts`, and `after.sms_login_code_hash` to equal `before.sms_login_code_hash`.
     - Finally expect `verifyCode(digits, code)` to give `ok: true`.
3. **HTTP test.** Add this to the `describe('sms-login HTTP', …)` block after B10/B15:
   - **`B15b (HTTP): array and number codes give the generic 400 and use no attempt`**
     - Request a code over HTTP and read `before`.
     - POST verify with `{ phoneNumber: formatted(digits), code: [code] }` and expect `res.status` 400 and `res.body` `toEqual(WRONG_CODE_BODY)`.
     - Do the same with `code: Number(code)`.
     - Expect attempts to be unchanged.
     - Then POST verify with the real string `code` and expect 200. This proves the code survived.
4. **Strengthen B3 (service, line 83, and HTTP, line 522).** Create the blocked user with live-looking SMS state, so that any write would be detected:
   ```js
   const seeded = {
     sms_login_code_hash: 'a'.repeat(64),
     sms_login_code_expires: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
     sms_login_attempts: 2,
     sms_login_last_sent: agoIso(2 * 60 * 60 * 1000),   // outside the 60 s throttle, so only eligibility can stop a send
     sms_login_send_log: [agoIso(2 * 60 * 60 * 1000)],
   };
   const { user, digits: blockedDigits } = await makeUser({ blocked: true, extra: seeded });
   ```
   - Right after `const before = await readUser(user.id);`, add `expect(before.sms_login_code_hash).toBe('a'.repeat(64)); expect(before.sms_login_attempts).toBe(2);` to prove the seed landed.
   - Keep the existing "unchanged" loop.
   - Define `seeded` inline in each test. Do not add a shared helper.
5. **Strengthen B24 (line 370).**
   - Record `const before = Date.now();` before the request.
   - After the existing assertions, add the full B2 field set, copied from the B2/B19 test at lines 51–61:
     - expiry within 30 s of `before + 10 * 60 * 1000`;
     - `sms_login_attempts` equals 0;
     - `sms_login_last_sent` within 30 s of `before`;
     - the last send-log entry within 30 s of `before`.
   - Keep `expect(row.role).toBeNull()`.
6. **HTTP `beforeAll` (lines 494–501).**
   - Delete the whole `beforeAll` block, including the `grantPrivileges` call and the `try/catch`. The comment in it says the v5 default Authenticated role already allows `user.me`, and B7/B8 and B25 (HTTP) assert `/users/me` → 200.
   - Run the targeted suite.
     - **If B7/B8 and B25 (HTTP) still pass**, also remove the now-unused `grantPrivileges` import on line 4.
     - **If either returns 403 on `/users/me`**, restore the `beforeAll` with a plain `await grantPrivileges(authRole.id, 'plugin::users-permissions.user', ['me']);` and **no** try/catch, and keep the import.
   - State in your report which branch you took.
7. **design.md (text only, no other edits).**
   - Line 190 (verify flow step 1): replace `` `code = String(code ?? '').trim()` must match `/^\d{6}$/`. `` with `` `code` must be a JSON string, and `code.trim()` must match `/^\d{6}$/`. ``
   - Lines 288–289: replace the two sentences quoted above with: `` `code` must be a JSON **string**, so leading zeros survive. Any other type (number, array, object, boolean, null) or a missing `code` gets the generic 400 below and does not use up an attempt. ``
   - AC-B15's bullet list (after "a missing `code`."): add a bullet `- a non-string `code` (a number, an array such as `["123456"]`, or an object).`

### Done when
- `node --check` passes on both changed `.js` files.
- The targeted run passes: all sms-login tests, including B15b ×2, strengthened B3 ×2, B24, C1–C7 and U1/U2.
- The full `yarn test` run shows exactly the 3 known failures.
- `grep -n "catch (e)" tests/auth/sms-login.js` returns nothing.
- `git diff --stat` for this task shows only `src/api/auth/services/sms-login.js`, `tests/auth/sms-login.js` and `.claude/specs/sms-login/design.md`.

---

## Task 13 [FE]: LoginModal: label the email/password fields, give the wrapper its own stacking context, and guard Resend against double clicks
Depends on: T6 (done)
Parallel-safe with: T10, T11, T12 (other repo)
Covers: inspection Findings 4, 5 and 6. API usage is unchanged: see design.md "API contract". This task makes no new calls and does not change `auth.requestSmsCode`/`verifySmsCode`

### Files
- `/root/git/gardensteward/garden-vue/src/components/modals/LoginModal.vue`: the only file

### Current state
The repo is at `9ca9239` on branch `claude/tasks-login-flow-7ud71g`. `node_modules` is installed.

The email step (lines 252–269) has no labels. `autocomplete` is **already** correct (`username` / `current-password`):
```html
                    <form v-else @submit.prevent="submitEmail">
                        <input
                            ref="emailInput"
                            type="email"
                            autocomplete="username"
                            v-model="email"
                            class="login-modal-input"
                        />
                        <input
                            type="password"
                            autocomplete="current-password"
                            v-model="password"
                            class="login-modal-input"
                        />
```
The phone step shows the label pattern to copy (lines 199–201):
```html
                        <label for="login-modal-phone" class="login-modal-label">Phone number</label>
                        <input
                            id="login-modal-phone"
```
The code input (lines 224–236) has `id="login-modal-code"`, a placeholder `123456`, and no label or aria-label.

`resend()` (lines 90–100) checks `isSubmitting` but never sets it, so a fast double click sends two requests:
```js
const resend = async () => {
    if (resendRemaining.value > 0 || isSubmitting.value) return;
    try {
        await auth.requestSmsCode(phoneDigits.value);
        info.value = 'New code sent.';
        error.value = '';
        startCountdown();
    } catch (err) {
        error.value = sendErrorMessage(err);
    }
};
```
The Resend button is already `:disabled="resendRemaining > 0 || isSubmitting"`, and so is Verify.

Stacking (lines 277–279): `.login-modal-wrapper { z-index: 10001; }`. The wrapper is `position: static`, so that z-index does nothing.

Measured context, from a headless Chromium run on the current `dist/` at 1280×800:
- `#modals` in `index.html` is `class="relative z-20"`, which is a root stacking context at z 20.
- `.app-container` in `App.vue` is `position: relative; z-index: 1`.
- Nav (`nav.gs-navbar`, sticky, z-index 100, with children up to 99999) lives inside `.app-container`, so it is capped at z 1 relative to `#modals`.
- `document.elementFromPoint` over the Nav returns the modal's `fixed inset-0` layer in both light and dark mode. The Nav **is** dimmed today.
- The inspection's "Nav stays bright" was most likely the cream Nav under the dark backdrop.

The fix is therefore defensive. It makes the modal's stacking independent of `#modals`'s utility classes. **Do not edit `index.html`, `App.vue` or `Nav.vue`.**

### Instructions
1. **Labels (Finding 4).** In the email form, add a visible label before each input, and an `id` on each input:
   ```html
                        <label for="login-modal-email" class="login-modal-label">Email</label>
                        <input
                            id="login-modal-email"
                            ref="emailInput"
                            type="email"
                            autocomplete="username"
                            ...
                        />
                        <label for="login-modal-password" class="login-modal-label">Password</label>
                        <input
                            id="login-modal-password"
                            type="password"
                            autocomplete="current-password"
                            ...
                        />
   ```
   - Keep the existing `autocomplete`, `v-model` and `class` attributes.
   - Add `aria-label="Login code"` to the code input (`id="login-modal-code"`). It has a visible placeholder but no accessible name.
   - `.login-modal-label` already has light and dark styles, so add no new CSS for labels.
2. **Wrapper stacking (Finding 5).** Change the scoped rule to:
   ```css
   .login-modal-wrapper {
       position: fixed;
       inset: 0;
       z-index: 10001;
   }
   ```
   - Leave `.login-modal-backdrop` and the inner `fixed inset-0 flex …` div as they are. They stay `fixed` and now sit inside the wrapper's stacking context.
3. **Resend guard (Finding 6).** Make `resend()` set and clear `isSubmitting`:
   ```js
   const resend = async () => {
       if (resendRemaining.value > 0 || isSubmitting.value) return;
       isSubmitting.value = true;
       try {
           await auth.requestSmsCode(phoneDigits.value);
           info.value = 'New code sent.';
           error.value = '';
           startCountdown();
       } catch (err) {
           error.value = sendErrorMessage(err);
       } finally {
           isSubmitting.value = false;
       }
   };
   ```
   - Setting the flag synchronously, before the first `await`, is what blocks the second click. Do not move it below the `await`.
   - Verify is also disabled while a resend is in flight. That is intended.
4. Change nothing else: not the store, not the router, and no new components or dependencies.

### Done when
- `cd /root/git/gardensteward/garden-vue && npx eslint src/components/modals/LoginModal.vue --no-fix` exits 0.
- `cd /root/git/gardensteward/garden-vue && yarn build` exits 0. `dist/` is gitignored, so do not commit it.
- `grep -c 'class="login-modal-label"' src/components/modals/LoginModal.vue` prints `3`.
- `grep -n 'for="login-modal-email"\|for="login-modal-password"\|aria-label="Login code"' src/components/modals/LoginModal.vue` shows all three.
- **Stacking check** (headless; Chromium lives at `/opt/pw-browsers`, Playwright is global at `/opt/node22/lib/node_modules/playwright`):
  - Serve the fresh build: `npx --yes serve -s /root/git/gardensteward/garden-vue/dist -l 5055` in the background.
  - Run a script with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node <script>`. Put the script in a temp dir **outside** the repo. The script should:
    - open `http://localhost:5055/manage` at 1280×800 (logged out → modal opens over `/`);
    - wait 3 s;
    - print `getComputedStyle(document.querySelector('.login-modal-wrapper')).position`, which must be `fixed`;
    - print `document.elementFromPoint(r.left + 5, r.top + r.height / 2).closest('.login-modal-wrapper') !== null`, where `r = document.querySelector('nav.gs-navbar').getBoundingClientRect()`, which must be `true`;
    - repeat the second check after `document.documentElement.classList.add('dark')`.
  - Kill the server afterwards. Failed connections to googletagmanager or beehiiv in the output are expected noise.
  - If Chromium cannot launch in your environment, say so in the report and skip this check. Do not install anything.
- `git -C /root/git/gardensteward/garden-vue status --short` shows only `src/components/modals/LoginModal.vue`.

---

## After T12 + T13: dispatcher re-check (not a subagent task)
- Re-run the T9 live checks that these fixes touch:
  - **F6:** double-click "Resend code" once it is enabled. The Network tab shows a single POST `/api/auth/sms-login/request`.
  - **F9:** the email fallback shows "Email" and "Password" labels, and password-manager autofill still targets the fields.
  - **Stacking:** the backdrop covers the Nav on desktop and on a 375 px viewport.
- Optional: a Postgres-backed smoke test of Finding 1. Fire 20 parallel `request` calls for one number, then expect 1 SMS and a send log of length 1. That closes the "unverified on Postgres" item in inspection.md. The sqlite tests cannot prove pg isolation behaviour, although the conditional-UPDATE approach does not depend on it.
