# SMS One-Time-Code Login for the Management Dashboard
Status: DESIGNED
Requested by / date: Cameron (cameron@oufp.org) / 2026-09-25
Revision 2 (2026-09-25, approved by Cameron with revisions): added per-user send caps (5/rolling hour, 10/rolling day); role-less users are now eligible and get the `authenticated` role on their first successful verify.
Type: COMBO feature (steward-bank backend + garden-vue frontend), plus one unrelated FE bugfix (AC-F13)

## Intent
A garden manager who is not logged in and opens any `/manage` page is shown a
login dialog on the spot instead of being sent to `/login`. They type their
phone number, get a 6-digit code by text, enter it, and land on the page they
were trying to reach. The same dialog has an "use email & password" option that
also lands them on that page. The backend never says whether a phone number is
registered: requesting a code for a registered number, an unregistered number, a
blocked account or a throttled resend all return the same response. Codes are
single-use, expire after 10 minutes, are stored only as hashes, allow at most 5
wrong guesses, and can be re-sent at most once every 60 seconds per user. On
top of that, a user gets at most 5 codes per rolling hour and 10 per rolling
day; a capped request looks exactly like a throttled one. Volunteers who were
created by text message and have no role can also log in this way: the first
time they verify a code they are given the standard "authenticated" role. A
role is only ever granted after the code is proven, never when a code is
requested, and an existing role is never changed. A successful code login
returns the same `{ jwt, user }` shape as email login, so the rest of the
dashboard works unchanged. `/login` keeps working, and public
pages (e.g. `/gardens/:slug/tasks`) stay public and never show the dialog.

## Current state

Backend (steward-bank):
- `src/api/auth/` is a custom API with no content type. Routes are collected in
  `src/api/auth/routes/index.js` from `routes/phone-verification.js`. Controllers
  are registered in `controllers/index.js`. `services/index.js` exports `{}`.
  The existing `phone-signup`, `verify-email` and `set-password` routes have no
  `auth: false`, so they depend on Public-role grants.
- `src/api/auth/controllers/phone-verification.js:17-97` (`phoneSignup`) is the
  closest pattern: it normalizes the phone, looks the user up with
  `strapi.db.query`, and stores a token and expiry on the user. It does NOT meet
  our bar: it returns 404 for unknown numbers (which lets anyone check whether
  a number is registered), stores the token in plaintext, compares with `!==`,
  and returns `userId`. Do not copy any of those choices.
- User schema `src/extensions/users-permissions/content-types/user/schema.json:155-162`:
  `email_verification_token` / `email_verification_expires` are `private: true`.
  This is the naming and privacy pattern to follow. `phoneNumber` (line 90) is a
  plain string, **not unique**.
- `src/utils/phone.js` `normalizePhoneNumber` returns `{ valid, phoneNumber: '+1XXXXXXXXXX' }`
  or `{ valid:false, message }`.
- `src/api/sms/services/sms.js:21-38` `sendSms(toNum, body)` is fire-and-forget:
  it does not return or await the Twilio promise. When `ENVIRONMENT == 'test'` it
  logs the body and returns without sending. `handleSms` (line 42) also writes a
  `message` row, which would store the body in plaintext, so it must **not**
  be used for OTPs.
- Upstream users-permissions v5.36 `auth.callback` (POST `/api/auth/local`) runs
  `findOne` **without populate**. The `?populate=role` the frontend adds is
  ignored, so today's email-login `user` has **no `role`**. The `isAdmin` getter
  (`auth.store.js:20`) is therefore always false for email logins. It is not
  used anywhere else.
- The users-permissions auth strategy calls `user.role.id` on every
  authenticated request. A user with a null role (users created by SMS
  `SmsHelper.joinGarden`, `src/api/message/controllers/SmsHelper.js:190-199`,
  are created with no role) gets 401 on every call. Issuing them a JWT would
  just start a logout loop in the frontend. That is why this design assigns the
  `authenticated` role on successful verify (Revision 2).
- The server has no `proxy: true` (`config/server.js`), so `ctx.request.ip` on
  Fly is the proxy's IP. IP-based limiting like `src/api/project/middlewares/rate-limit.js`
  would in practice be a single global bucket.
- Tests: one Strapi instance is booted in `tests/app.test.js`, which
  `require`s module files (plain `.js`, not `*.test.js`). Stubs go through
  `tests/helpers/patch.js` (`patchService`, `patchQuery`), and a global
  `afterEach` restores them. sqlite, with the schema auto-synced on boot.

Frontend (garden-vue):
- `src/stores/auth.store.js:41-56` `login()` posts to `/api/auth/local?populate=role`,
  writes state and localStorage (`user`, `_stewToken`), then always calls
  `router.push(returnUrl || '/manage')`. Nothing else can reuse the
  session-setting part.
- `src/helpers/router.js:188-221` `beforeEach`: if the route needs auth and there
  is no `auth.user`, it sets `auth.returnUrl` and `return '/login'`.
- `src/helpers/fetch-wrapper.js:62-65`: any 401/403 while `user` is set calls
  `logout()`, which pushes `/login`.
- `src/App.vue` has no global modal host. `index.html` has `<div id="modals">`,
  which is where modals Teleport to.
- Dark mode is the `dark` class on `<html>`, toggled by `Nav.vue` (Tailwind
  `darkMode: 'class'`). `PhoneLoginModal.vue` uses a `darkMode` prop plus
  scoped CSS tokens (`#2d3e26` panel, `#3d4d36` border, `#8aa37c` accent). Its
  `formatPhoneNumber` / `(XXX) XXX-XXXX` input formatting is the part to reuse.
- Bug: `src/stores/garden-task.store.js:64` (`getGardenTasks`) and `:224`
  (`getTasksByGardenSlug`, used by public `GardenTasksPublic.vue`) send
  `filters[status][$nei]=finished`. `src/components/VolunteerActivity.vue:24`
  sends `filters[status][$in][...]`. `garden-task` has `draftAndPublish: true`,
  and in v5 `status` is the draft/publish parameter, so the server rejects these
  with 400 "Invalid key status". The real attribute is `task_status`, an
  uppercase enum with no default.

## Design

### Backend: files and boundaries
- `src/api/auth/routes/sms-login.js` defines two routes, both `config: { auth: false }`.
  Spread them into `src/api/auth/routes/index.js` next to `phoneVerification.routes`.
  The `01-` prefix is not needed: this API has no core router to sort against.
- `src/api/auth/controllers/sms-login.js` has actions `request` and `verify`,
  registered in `controllers/index.js` as `'sms-login'`. The controller stays
  thin: it reads the body, calls the service, and maps the result to the
  contract responses.
- `src/api/auth/services/sms-login.js` is registered in `services/index.js` as
  `'sms-login'` (uid `api::auth.sms-login`). All the logic lives here:
  - `resolveUser(rawPhone)`: normalizes the phone. Invalid input gives
    `{ invalid: true, message }`. Otherwise it runs
    `strapi.db.query('plugin::users-permissions.user').findMany({ where: { phoneNumber }, orderBy: { id: 'asc' }, populate: ['role'] })`
    and takes the **first** row (lowest id).
    - Why lowest id: `phoneNumber` is not unique, and express-interest or SMS
      soft-signup can create duplicates. The oldest account is usually the
      real one.
    - Both endpoints must use this one resolver so the request and the verify
      always pick the same user.
  - `isEligible(user)`: true if `!user.blocked` and, when the plugin's advanced
    setting `email_confirmation` is on, `user.confirmed === true`.
    **`role` is not part of eligibility** (Revision 2). A user with
    `role = null` is eligible; they get a role at verify time (see Verify flow).
  - `authenticatedRoleId()`: `strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })`,
    returning its numeric `id`. Look it up by `type`; never hard-code `1`.
  - `requestCode(rawPhone)`: returns `{ invalid, message }`, or an internal
    outcome of `sent` / `unknown` / `ineligible` / `throttled` / `capped`. The outcome is
    for logs only; the controller turns every non-invalid outcome into the same
    200 response.
  - `verifyCode(rawPhone, code)`: returns `{ ok: true, user }` or `{ ok: false, reason }`.
    `reason` is for logs only.
  - Hashing, comparing and generating the code are private helpers in this file.
- SMS sending goes through `strapi.service('api::sms.sms').sendSms(phone, body)`.
  - Do not use `handleSms`, because it stores the body in a `message` row.
  - Wrap the call in try/catch. Log failures without the body.
  - `sms.js` must not be changed.

### Schema change (users-permissions user extension)
Add five attributes, all `"private": true`, named like `email_verification_*`:

| attribute | type | notes |
|---|---|---|
| `sms_login_code_hash` | string | hex SHA-256 of `` `${user.id}:${code}` `` (64 chars). Null when no active code |
| `sms_login_code_expires` | datetime | issue time + 10 min. Null when no active code |
| `sms_login_attempts` | integer, default 0 | failed verifies against the current code. Treat null as 0 |
| `sms_login_last_sent` | datetime | time of the last code actually sent. Used for the 60 s throttle. **Not** cleared on success or exhaustion |
| `sms_login_send_log` | json | array of ISO-8601 timestamps of codes actually sent, oldest first, pruned to the last 24 h on every send (so at most 10 entries). Used for the hourly and daily caps. Null/missing = `[]`. **Not** cleared on success or exhaustion |

Cap representation (Revision 2): the request suggested two fields such as
window-start + counter pairs. I chose one json timestamp log instead because
fixed windows are not *rolling*: with window counters, 5 sends at 10:59 and 5
more at 11:01 would pass an "hourly" cap. A log of at most 10 timestamps gives
exact rolling-hour and rolling-day counts, stays tiny, and needs one column. If
Cameron prefers the two-counter form, only the internals of the cap check
change; the contract and ACs stay the same. Timestamps that fail to parse are
ignored (treated as outside every window).

Migration: these are nullable, additive columns. Strapi's schema sync creates
them on boot in both Postgres and sqlite. No backfill and no script are needed.
`private` hides the fields from the content API (`/users/me`, `/users`, auth
responses) but not from the admin Content Manager. That is acceptable.

### Request flow (`requestCode`)
1. If `phoneNumber` is missing or not a string/number, or `normalizePhoneNumber`
   rejects it, return a 400 (see contract). This does not reveal whether an
   account exists.
2. Call `resolveUser`. If there is no user, or `!isEligible(user)`, stop: no DB
   write, no SMS, return the generic 200.
3. **Throttle:** if `sms_login_last_sent` is less than 60 s ago, stop: no write,
   no SMS, return the generic 200.
   - Decision: throttled requests are indistinguishable from successful ones. A
     429 would reveal that the number is registered, since only registered
     numbers can be throttled.
   - The code already on the account stays valid. The frontend enforces the
     60 s wait with its own countdown.
4. **Send caps (Revision 2):** read `sms_login_send_log`. If it has **≥ 5**
   entries newer than now − 60 min, or **≥ 10** entries newer than now − 24 h,
   stop: no write, no SMS, return the generic 200. This is exactly the throttled
   behavior: same body, stored code and all `sms_login_*` columns unchanged.
   Log `capped` at `info` with the user id only.
5. Generate `code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')`.
6. Save with one `db.query().update`:
   `sms_login_code_hash`, `sms_login_code_expires = now + 10 min`,
   `sms_login_attempts = 0`, `sms_login_last_sent = now`, and
   `sms_login_send_log = [...entries newer than now − 24 h, now]`. Any earlier
   code is replaced and becomes invalid. **The role is never touched here**, even
   for a role-less user.
7. Send the SMS after the save. Body (fixed text; tests extract `\d{6}`):
   `Your Garden Steward login code is 123456. It expires in 10 minutes. If you didn't request it, ignore this text.`
8. Never write the plaintext code to logs, `message` rows, or the response.

### Verify flow (`verifyCode`)
Every failure path returns the **same** 400 body (see contract). The order of
checks:
1. Normalize the phone. `code = String(code ?? '').trim()` must match `/^\d{6}$/`.
   Malformed input fails **without** using up an attempt.
2. Call `resolveUser`. Fail if there is no user.
3. Fail if `!isEligible(user)`. This covers a user blocked after the code was
   sent.
4. Fail if `sms_login_code_hash` is null, meaning no active code: never
   requested, already used, or exhausted.
5. Fail if `sms_login_code_expires <= now`. Also clear hash and expiry.
6. Compare with `crypto.timingSafeEqual(Buffer.from(storedHex,'hex'), Buffer.from(sha256(`${user.id}:${code}`),'hex'))`.
   Both buffers are always 32 bytes.
   - On a mismatch, `attempts = (attempts ?? 0) + 1`. If `attempts >= 5`, clear
     hash and expiry too.
   - Then fail.
7. On a match, clear `sms_login_code_hash`, `sms_login_code_expires` and
   `sms_login_attempts` (set to 0). Keep `sms_login_last_sent`.
   - **Role assignment (Revision 2):** if `user.role` is null, set
     `role = authenticatedRoleId()` in the **same** update that clears the code.
     If `user.role` is non-null, do not include `role` in the update at all, so
     an existing role (Authenticated, a manager role, an admin role, anything)
     is never changed. If the `authenticated` role cannot be found, treat it as
     a server misconfiguration: log `error`, leave the user unchanged, and fail
     with the generic 400 (do not issue a JWT for a role-less user).
   - Role is only ever assigned here, after the code matches. Failed verifies
     (any reason) never change `role`.
   - Issue `jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: user.id })`.
     `await` is harmless in the default legacy mode and required if
     `jwtManagement: 'refresh'` is ever turned on.
   - Re-fetch the user with `populate: ['role']` and return
     `strapi.contentAPI.sanitize.output(user, strapi.getModel('plugin::users-permissions.user'), { auth: ctx.state.auth })`.
     This is the same sanitizer the upstream auth controller uses. On an
     `auth: false` route `ctx.state.auth` is unset, so the populated `role` is
     kept.
   - The sanitize call belongs in the controller, because it needs `ctx`.

So "max 5 attempts" means: guesses 1–4 wrong and guess 5 right succeeds; five
wrong guesses kill the code, and even the right code then fails.

### Permissions
- Both routes are `auth: false`. They skip the users-permissions strategy and
  role checks entirely.
- **No permission seeding** is needed: no change to `scripts/seed-*permissions*.js`
  and no `grantPrivileges` in tests.
- In-controller checks are the eligibility rules above.
- **Auth model change (Revision 2, approved by Cameron):** SMS login **widens
  who can log in**. Every non-blocked user with a phone number, including
  role-less volunteers created by the SMS bot, can now get a JWT. On their
  first successful verify they get the `authenticated` role, so they get
  exactly the Authenticated role's content-API permissions, the same as any
  email-registered user. They get nothing beyond that: garden-level checks in
  controllers (`ctx.state.user` / garden membership) still apply.
- Proving the phone is what gates the role grant: requests never write
  `role`, and failed verifies never write `role`.

### Explicitly out of scope
- Backfilling roles for role-less users who never SMS-login (they stay role-less).
- Changing an existing role (upgrading or downgrading) through this flow.
- Rate limits per IP or per hour/day (see Risks).
- WebOTP `@domain #code` SMS suffix.
- Changing `sendSms`, `/auth/local`, `phone-verification.js`, or refresh-token mode.
- Normalizing phone numbers already stored in a non-E.164 format.
- Fixing `/auth/local` not populating `role`.

## API contract
Base: `${VITE_API_URL}/api`. Both endpoints are **unauthenticated** (`auth: false`).
No role grants. Clients should not send `Authorization`; if they do, it is
ignored. JSON bodies. Query parameters are ignored; there is no `populate` param,
and `role` is always populated on verify.

### POST /api/auth/sms-login/request
Request body:
```json
{ "phoneNumber": "5551234567" }
```
`phoneNumber` is a string in any format `normalizePhoneNumber` accepts: a
10-digit US number, or 11 digits with a leading 1, with any punctuation. The
frontend sends the 10 digits only.

**200**: identical for registered, unregistered, ineligible (blocked,
unconfirmed when confirmation is required), throttled (< 60 s), capped (5/hour
or 10/day), and actually-sent. Role-less users are eligible and are actually
sent a code:
```json
{ "ok": true, "message": "If that number belongs to a Garden Steward account, a login code has been sent.", "resendAfterSeconds": 60, "expiresInSeconds": 600 }
```
`resendAfterSeconds` and `expiresInSeconds` are constants, never computed per
user.

**400**: `phoneNumber` missing or invalid. Standard Strapi error envelope:
```json
{ "data": null, "error": { "status": 400, "name": "BadRequestError", "message": "Phone number is required" | "<normalizePhoneNumber message>", "details": {} } }
```
There are no 401, 403, 404 or 429 responses from this endpoint.

### POST /api/auth/sms-login/verify
Request body:
```json
{ "phoneNumber": "5551234567", "code": "012345" }
```
`code` must be a **string**, so leading zeros survive. A JSON number is turned
into a string and fails if it has fewer than 6 digits.

**200**:
```json
{
  "jwt": "<string>",
  "user": {
    "id": 12,                     // number: internal id, same as /auth/local
    "documentId": "abc123...",    // string: v5 public id
    "username": "...", "email": "...", "provider": "local",
    "confirmed": true, "blocked": false,
    "firstName": "...", "lastName": "...", "phoneNumber": "+15551234567",
    "...": "all other non-private scalar user fields, as /auth/local returns",
    "role": { "id": 1, "documentId": "...", "name": "Authenticated", "type": "authenticated", "description": "...", "createdAt": "...", "updatedAt": "..." }
  }
}
```
- `user` must never include `password`, `resetPasswordToken`, `confirmationToken`,
  `email_verification_token`, `email_verification_expires`, or any `sms_login_*`
  field.
- Relations other than `role` (gardens, activeGarden, profilePhoto…) are **not**
  populated, the same as `/auth/local`.

**400**: every failure (unknown number, invalid phone, malformed code, wrong
code, expired, exhausted, no active code, blocked, ineligible) returns the same
body:
```json
{ "data": null, "error": { "status": 400, "name": "BadRequestError", "message": "Invalid or expired code", "details": {} } }
```
There are no 401, 403 or 404 responses. 400 was chosen over 401/403 on purpose:
`fetch-wrapper.js` calls `logout()` on 401/403, and we do not want failure
responses to have side effects.

The frontend must branch only on HTTP status, never on `error.message`
(except to display it).

### Compatibility and deploy order
- **Backend schema and API changes are additive.** There are two new routes and
  five new private, nullable columns. No existing response shape changes. The
  one data-level behavior change is the role grant described below.
- The success `user` is a **superset** of what `/auth/local` returns today: it
  adds `role`. Any code reading `user` from localStorage keeps working, and
  `isAdmin` starts working correctly for SMS logins.
- A previously role-less user who verifies comes back with
  `role.type === "authenticated"`. From then on they can also use any other
  Authenticated-role endpoint.
- **Data side effect (Revision 2):** the first successful SMS login of a
  role-less user writes `role` on their row. This is a permanent data change,
  not reverted by logout. Nothing else in the codebase keys on "role is null"
  (the SMS bot identifies new/unfinished users by `email == 'test@test.com'` and
  `phoneNumber == username`), so the bot's registration flow is unaffected.

- **Deploy order: backend first** (`fly deploy`; the schema sync adds the
  columns on boot), then garden-vue (`firebase deploy`).
  - Skew window (new backend, old frontend): no impact, because the old
    frontend never calls the new routes.
  - Reverse skew (new frontend, old backend, e.g. a rollback): the request
    returns 404/405. The modal shows a generic "couldn't send code" error, and
    the "use email & password" fallback still works.
- The bugfix (AC-F13) only changes query strings to a form the **current**
  backend already accepts, so it has no backend dependency.
- garden-vue changes are delivered as a patch file (this session cannot push).
  The patch must apply cleanly to garden-vue `af00ff9`.

## Frontend intent

### `src/stores/auth.store.js`
- **State:** add `loginModalOpen: false`. Keep `returnUrl`.
- **`setSession(jwt, user)`:** sets `this.user`, `auth.accessToken` and
  `auth.status = 'logged_in'`, and writes localStorage `user` and `_stewToken`
  (`localStorageTokenKey`). This is exactly what `login()` does today at lines
  47-53.
- **`login(username, password, { redirect = true } = {})`:** calls
  `/auth/local`, then `setSession`, then `router.push(returnUrl || '/manage')`
  **only if** `redirect`. `LoginView.vue` calls it unchanged, so `/login`
  behaves exactly as before.
- **`requestSmsCode(phone)`:** strips `phone` to digits and POSTs `request`.
  Resolves with the response and rejects on 400 or network errors.
- **`verifySmsCode(phone, code)`:** POSTs `verify`, calls `setSession(jwt, user)`,
  and returns `user`. **No navigation.**
- **`openLoginModal(returnUrl)`:** sets `returnUrl` and `loginModalOpen = true`.
- **`closeLoginModal()`:** the user dismissed the dialog. Sets it closed and
  `returnUrl = null`.
- **`finishModalLogin()`:** sets it closed, captures `target = returnUrl`,
  sets `returnUrl = null`, then `router.push(target)` if `target` is set.

### `src/helpers/router.js` `beforeEach`
The test for which routes need auth is unchanged. When the route needs auth
and there is no `auth.user`:
- **In-app navigation** (`from.matched.length > 0`): call
  `auth.openLoginModal(to.fullPath)` and `return false`. The user stays on the
  current page with the dialog on top.
- **First load / deep link** (`from.matched.length === 0`, i.e. `START_LOCATION`):
  call `auth.openLoginModal(to.fullPath)` and `return '/'`. The public home
  renders behind the dialog.
- Public routes are never affected.
- `logout()` still pushes `/login`. The expired-session path does not change.

### `src/App.vue`
Mount `<LoginModal v-if="auth.loginModalOpen" />` once, next to `<Alert />`. It
Teleports to `#modals`. Export it from `components/modals/index.js`.

### `src/components/modals/LoginModal.vue`
What the user observes:
- **Phone step:**
  - Phone field (`type="tel"`, `autocomplete="tel"`) formatted as
    `(XXX) XXX-XXXX` while typing, using the same approach as `PhoneLoginModal`.
    Submit is enabled at 10 digits.
  - Submitting calls `requestSmsCode`. On 200 it moves to the code step
    **whatever the backend actually did**, with copy like "If that number has
    an account, we texted a code."
  - On 400 it shows the message inline. On a network error or 404 it shows a
    generic "Couldn't send a code. Try again or use email & password."
- **Code step:**
  - Input has `inputmode="numeric"`, `autocomplete="one-time-code"`,
    `maxlength="6"` and `pattern="\d{6}"`, and is autofocused.
  - Shows "Sent to (XXX) XXX-XXXX" with a "use a different number" link back
    to the phone step.
  - Submitting calls `verifySmsCode`. On success it calls `finishModalLogin()`.
    On failure it shows "That code is invalid or expired." inline, clears the
    input, and stays on this step.
  - "Resend code" is disabled with a live countdown ("Resend in 42s") for 60 s
    after each successful request, then becomes enabled. Resending restarts
    the countdown.
- **Fallback:**
  - "Use email & password instead" switches to email and password fields.
  - Submitting calls `login(email, password, { redirect: false })`, then
    `finishModalLogin()`. Errors show inline.
  - A link switches back to phone.
- **Dismissal:** close X, backdrop click and Escape call `closeLoginModal()`.
  The user stays on the current page.
- **Dark mode:** follows `html.dark`, set by Nav, with no prop. Use Tailwind
  `dark:` variants or `:global(html.dark)` selectors with the same tokens as
  `PhoneLoginModal`/`LoginView`: panel `#2d3e26`, border `#3d4d36`, input bg
  `#344a34`, accent `#8aa37c`, error `#f87171`.
- **Accessibility:** `role="dialog"` and `aria-modal="true"`. Each step focuses
  its first input.

### Bugfix (independent)
- `garden-task.store.js:64` and `:224`: replace `filters[status][$nei]=finished` with
  `filters[$or][0][task_status][$ne]=FINISHED&filters[$or][1][task_status][$null]=true`.
  - The `$null` branch keeps tasks whose `task_status` was never set.
    `task_status` has no default, and a bare `$ne` drops NULL rows in SQL. The
    old `status` filter would have kept them.
- `VolunteerActivity.vue:24`: `filters[task_status][$in][0]=FINISHED&filters[task_status][$in][1]=STARTED&filters[task_status][$in][2]=PENDING`.

No new dependencies in either repo.

## Risks & alternatives considered
- **Account enumeration:**
  - Handled by the identical 200 on request, the identical 400 on verify, and
    throttles being silent.
  - Remaining leak: timing. The eligible path does one extra DB write; the SMS
    send is not awaited. Accepted.
  - The old `/auth/phone-signup` still returns 404 for unknown numbers, so
    enumeration is already possible there. Out of scope; flagged for a
    follow-up.
- **Brute force (with caps, Revision 2):**
  - Guesses are bounded by codes × 5. With at most 10 codes per rolling day,
    an attacker gets at most **50 guesses/day** per account against 10^6
    codes: about **0.005%/day** (1 in 20,000), about 1.8%/year of sustained
    attack. The hourly cap bounds any single hour to 25 guesses.
  - Before the caps it was about 7,200 guesses/day (0.7%/day).
  - The victim receives at most 10 texts/day and 5/hour, which bounds
    harassment and Twilio cost per account. Aggregate cost across many
    registered numbers is still unbounded (at most 10 × number of accounts per
    day). A per-IP or global limiter is the follow-up and is not useful until
    `proxy: true` is configured.
  - Side effect: an attacker can burn a real user's daily allowance, so that
    user cannot SMS-login for up to 24 h (denial of service). They still have
    email and password where they have one. Accepted.
- **Role grant widens access (Revision 2):** anyone who holds a phone number on
  file can become an Authenticated user. That includes recycled phone numbers
  (a new owner of a volunteer's old number) and shared phones. Mitigated only
  by the Authenticated role's permissions and the in-controller garden checks.
  Blocking a user is the kill switch, because blocked users are ineligible.
  Worth a review of what the Authenticated role can do before deploy.
- **Hash choice:**
  - Plain SHA-256 of a 6-digit code can be brute-forced offline in
    milliseconds if the DB leaks. Binding the user id into the hash input stops
    a single precomputed table covering all users, but it is not a real
    defense.
  - The actual mitigations are the 10-minute lifetime and single use. An HMAC
    keyed on `jwtSecret` would be stronger. Rejected to keep the request's
    "SHA-256" wording and avoid coupling to the plugin config; it is easy to
    upgrade later.
- **Concurrent verifies** can each read `attempts` before either writes, so a
  burst could get slightly more than 5 guesses. Accepted, since the gain is
  bounded by request concurrency. An atomic increment
  (`attempts = attempts + 1 ... returning`) is the upgrade path.
- **Duplicate phone numbers:** the lowest-id rule is deterministic, but it can
  pick a stale duplicate. If the oldest match is blocked, the newer valid
  account cannot SMS-login; if it is a role-less SMS soft account, *that* account
  is the one that gets logged in and receives the `authenticated` role. That user can still use email and
  password. Logged at `warn` when there is more than one match (log ids only).
- **Non-normalized stored numbers:** express-interest stores `phone` raw, so
  those users won't match an E.164 lookup. They still have email login. No
  migration here.
- **Strapi traps:**
  - (a) `auth: false` means `ctx.state.user` is never set; the controller must
    not read it.
  - (b) `sanitize.output` with no `auth` keeps `role`. Passing a fabricated
    auth object would strip it. Pass `ctx.state.auth` as-is.
  - (c) `users-permissions` user has `draftAndPublish: false`, so `db.query` is
    correct and matches `phone-verification.js`. Use the numeric `id` for the
    JWT and the hash input, never `documentId`.
  - (d) No lifecycle is involved. Do not add a user lifecycle for this, and do
    not assign the role from a lifecycle or at request time.
  - (d2) `role` is a manyToOne relation. With `db.query().update`, set it as the
    numeric role id (`role: 3`), as `phone-verification.js` `setPassword` does.
    Omit the key entirely when the user already has a role; do not write
    `role: user.role.id` back.
  - (d3) sqlite and Postgres both store `json`; compare timestamps after
    `new Date(...)`, never as strings.
  - (e) A test file named `*.test.js` under `tests/auth/` would be run
    standalone by Jest with no Strapi boot. It must be a plain `.js` required
    from `tests/app.test.js`.
  - (f) In `ENVIRONMENT=test`, `sendSms` prints the body, including the code,
    to the console. That is acceptable only in test. Tests should stub
    `sendSms` with `patchService` anyway.
- **Alternatives considered:**
  - **A route-level `/login?modal`** was rejected: it is still a hard
    navigation and loses the page context.
  - **A dedicated `requiresAuth` wrapper component per view** was rejected: it
    would touch every manage view.
  - **Throttled requests returning 429** were rejected: that reveals the
    account exists.

## Acceptance criteria

### Backend (steward-bank)
- **AC-B1:** POST `/api/auth/sms-login/request` with no `Authorization` header
  and no Public-role grant, for a registered, eligible user's number (any
  accepted format, e.g. `"(555) 123-4567"`):
  - returns 200 with exactly `{ ok: true, message: <fixed string>, resendAfterSeconds: 60, expiresInSeconds: 600 }`;
  - calls `api::sms.sms.sendSms` exactly once, with the user's E.164 number
    and a body containing a 6-digit code;
  - never calls `handleSms`.
- **AC-B2:** After AC-B1, the user row has:
  - `sms_login_code_hash` equal to a 64-char lowercase hex string that is
    **not** the code;
  - `sms_login_code_expires` within ±30 s of now + 10 min;
  - `sms_login_attempts` = 0;
  - `sms_login_last_sent` within ±30 s of now.

  No column on the row contains the plaintext code.
- **AC-B3:** Each of these returns a 200 body **deep-equal** to AC-B1's, calls
  `sendSms` 0 times, and leaves every `sms_login_*` column on the relevant user
  unchanged:
  - an unregistered number;
  - a blocked user's number.
- **AC-B4 (throttle):** A second request for the same eligible user within 60 s
  returns the AC-B1 body, calls `sendSms` 0 more times, and leaves
  `sms_login_code_hash`, `sms_login_code_expires` and `sms_login_last_sent`
  unchanged. The first code still verifies successfully.
- **AC-B5 (resend after window):** After setting `sms_login_last_sent` to 61 s
  ago, a new request:
  - sends a new code;
  - changes `sms_login_code_hash`;
  - resets `sms_login_attempts` to 0.

  The **previous** code now fails verify with the generic 400.
- **AC-B6:** Request with a missing `phoneNumber` → 400,
  `error.message = "Phone number is required"`. Request with `"123"` → 400,
  with the `normalizePhoneNumber` message. `sendSms` is not called in either
  case.
- **AC-B7 (success):** Verify with the correct code:
  - returns 200 `{ jwt, user }`;
  - `user.id` is a number, `user.documentId` is a string, and
    `user.role.type === 'authenticated'` (or the user's actual role type);
  - `user` contains none of `password`, `resetPasswordToken`,
    `confirmationToken`, `email_verification_token`,
    `email_verification_expires`, `sms_login_code_hash`,
    `sms_login_code_expires`, `sms_login_attempts`, `sms_login_last_sent`.
- **AC-B8:** The `jwt` from AC-B7 works as a Bearer token: GET
  `/api/users/me` → 200, with the same `id`. That response also contains no
  `sms_login_*` field.
- **AC-B9 (single use):** After AC-B7, `sms_login_code_hash` and
  `sms_login_code_expires` are null, `sms_login_attempts` is 0, and
  `sms_login_last_sent` is unchanged. Verifying the same code again → generic
  400.
- **AC-B10 (wrong code):** Verify with a wrong 6-digit code → 400 with exactly
  `error.message = "Invalid or expired code"`, and `sms_login_attempts`
  increments by 1.
- **AC-B11 (attempt boundary):** 4 wrong codes, then the correct code → 200.
- **AC-B12 (exhaustion):**
  - 5 wrong codes → five 400s, and after the 5th, `sms_login_code_hash` and
    `sms_login_code_expires` are null;
  - a 6th attempt with the **correct** code → generic 400.
- **AC-B13 (expiry):** Set `sms_login_code_expires` to 1 s in the past. The
  correct code → generic 400, and afterwards the hash is null.
- **AC-B14 (blocked after send):** Request a code, then set `blocked = true`.
  The correct code → generic 400, and no JWT is issued.
- **AC-B15 (unknown / malformed):** Each of these returns a 400 body
  **deep-equal** to AC-B10's:
  - verify for an unregistered number;
  - an invalid phone;
  - `code: "12345"`;
  - `code: "abcdef"`;
  - a missing `code`.

  A malformed code does not change `sms_login_attempts`.
- **AC-B16:** The comparison uses `crypto.timingSafeEqual`; code generation
  uses `crypto.randomInt`; the JWT comes from
  `strapi.plugin('users-permissions').service('jwt').issue({ id })`. Logic
  lives in `api::auth.sms-login` (service), and the controller only maps
  results to responses. No `strapi.log` or `console` call includes the code or
  the hash.
- **AC-B17:** The five new attributes (including `sms_login_send_log`) exist in `schema.json` with
  `"private": true`. No new npm dependencies (`package.json` unchanged). No
  changes to `src/api/sms/services/sms.js` or `phone-verification.js`.
- **AC-B18:** `yarn test` / `npm test` passes, including a new
  `tests/auth/sms-login.js` required from `tests/app.test.js`. It covers
  AC-B1–B15 and AC-B19–B26, and at minimum: success, wrong code, expired,
  exhaustion, throttle, hourly cap, daily cap, blocked, unknown number,
  role-less user, existing role unchanged.

Send caps (Revision 2):
- **AC-B19 (log written):** After a successful send (AC-B1), `sms_login_send_log`
  is an array whose last entry is within ±30 s of now. Entries older than 24 h
  that were in the log before the send are gone.
- **AC-B20 (hourly cap):** Set the eligible user's `sms_login_send_log` to 5
  timestamps between 5 and 55 min ago and `sms_login_last_sent` to 5 min ago
  (so the 60 s throttle is not the cause). A request returns the AC-B1 body
  (deep-equal), calls `sendSms` 0 times, and leaves `sms_login_code_hash`,
  `sms_login_code_expires`, `sms_login_attempts`, `sms_login_last_sent` and
  `sms_login_send_log` unchanged. An existing unexpired code still verifies.
- **AC-B21 (hourly boundary):** Same as AC-B20 but with only 4 entries in the
  last hour → a code is sent. Separately, with 5 entries all 61–119 min ago → a
  code is sent.
- **AC-B22 (daily cap):** Set the log to 10 timestamps spread between 2 h and
  23 h ago (0 in the last hour) and `sms_login_last_sent` to 2 h ago. A request
  behaves exactly as in AC-B20: identical 200, no SMS, no column changes.
- **AC-B23 (daily boundary):** With 9 entries in the last 24 h (0 in the last
  hour) → a code is sent. With 10 entries all 24 h 1 min to 30 h ago → a code
  is sent, and afterwards the log contains only the new entry.

Role-less users (Revision 2):
- **AC-B24 (role-less gets a code):** For a non-blocked user created with
  `role: null`, a request returns the AC-B1 body and calls `sendSms` once, and
  the code fields are set as in AC-B2. **`role` is still null after the
  request.**
- **AC-B25 (role granted at verify):** For the AC-B24 user, verify with the
  correct code returns 200 with `user.role.type === 'authenticated'`. In the DB,
  the user's role is the role whose `type` is `authenticated`. The returned
  `jwt` works on GET `/api/users/me` → 200 with the same `id`. Before verify,
  the same user cannot use any JWT (there isn't one), and a wrong-code verify
  (400) leaves `role` null.
- **AC-B26 (existing role unchanged):** Create a custom role (e.g.
  `type: 'garden-manager'` via `strapi.plugin('users-permissions').service('role').createRole`,
  or the `public` role if creation is impractical in the test DB) and a user
  with it. After request + successful verify, the user's role id is unchanged
  and `res.body.user.role.type` is that role's type. The same holds for a user
  who already has the `authenticated` role (id unchanged, not rewritten).
- **AC-B27 (ineligible stays ineligible):** A role-less **blocked** user gets
  the generic 200 and no SMS; their `role` stays null. If the test sets the
  advanced setting `email_confirmation: true`, a role-less `confirmed: false`
  user also gets no SMS and stays role-less (restore the setting afterwards).

### Frontend (garden-vue)
- **AC-F1:** `/login` page behaviour is unchanged. Logging in with email and
  password stores `user` and `_stewToken` in localStorage and navigates to
  `returnUrl || '/manage'`. `login(u, p)` with no options still redirects, and
  `login(u, p, { redirect:false })` does not.
- **AC-F2:** The auth store exposes `setSession`, `requestSmsCode`,
  `verifySmsCode`, `openLoginModal`, `closeLoginModal`, `finishModalLogin` and
  `loginModalOpen`. `login()` uses `setSession` internally; there is no copy of
  the localStorage writes.
- **AC-F3:** Logged out, clicking an in-app link from `/gardens` to
  `/manage/projects`:
  - the URL stays `/gardens`, the LoginModal opens, and no request goes to
    `/login`;
  - dismissing (X, backdrop or Escape) closes it, leaves the URL at `/gardens`,
    and sets `returnUrl` to null.
- **AC-F4:** Logged out, loading `/manage/gardens/<slug>` directly lands on `/`
  with the LoginModal open. After a successful login the app is at
  `/manage/gardens/<slug>`.
- **AC-F5:** On the phone step, typing digits shows `(555) 123-4567`
  formatting. Submitting sends POST `/api/auth/sms-login/request` with body
  `{"phoneNumber":"5551234567"}` and no Authorization header, then moves to the
  code step. This happens for an unregistered number too.
- **AC-F6:** The code input has `autocomplete="one-time-code"`,
  `inputmode="numeric"` and `maxlength="6"`. "Resend" is disabled and shows a
  countdown from 60 after each request, then becomes enabled. Clicking it sends
  a new request and restarts the countdown.
- **AC-F7:** A correct code:
  - sends POST `/api/auth/sms-login/verify` `{"phoneNumber":"5551234567","code":"012345"}`,
    with the code as a string;
  - on 200, sets localStorage `user` (including `role`) and `_stewToken`;
  - closes the modal and navigates to the intended route.

  Later `/api` calls carry `Authorization: Bearer <jwt>`.
- **AC-F8:** A wrong code shows an inline error, keeps the modal on the code
  step, and does **not** log out or navigate.
- **AC-F9:** The fallback "Use email & password" logs in with valid credentials
  and continues to the intended route, not `/manage`, unless that was the
  intended route. Invalid credentials show an inline error.
- **AC-F10:** With `html.dark` (via Nav theme toggle), the modal uses the dark
  palette (panel `#2d3e26`, border `#3d4d36`), and the inputs are readable,
  including autofill. Light mode matches the existing modals.
- **AC-F11:** Logged out, `/gardens/<slug>/tasks`, `/gardens/<slug>`, `/` and
  `/events` load with no modal and no redirect.
- **AC-F12:** `npm run build` succeeds. `npm run lint` introduces no new
  errors in the touched files. `package.json` dependencies are unchanged.
- **AC-F13 (bugfix):**
  - Loading a garden's manage page, and loading public `/gardens/<slug>/tasks`,
    sends `garden-tasks` requests that use
    `filters[$or][0][task_status][$ne]=FINISHED&filters[$or][1][task_status][$null]=true`.
    Both requests return 200, not 400 "Invalid key status", and the lists show
    no FINISHED tasks.
  - `VolunteerActivity` sends `filters[task_status][$in][0..2]=FINISHED,STARTED,PENDING`
    and gets 200.
  - `grep -rn "filters\[status\]" src/` returns nothing.

## Verification plan

| AC | How | Layer |
|---|---|---|
| B1–B15, B19–B27 | supertest in `tests/auth/sms-login.js`. Create users with `strapi.db.query(...).create` (authenticated role looked up by type; one with `role: null`; one `blocked: true`; one with a custom role for B26). Capture the code with `patchService('api::sms.sms','sendSms', jest.fn())` and regex `\d{6}` from the body. Assert DB state via `db.query().findOne`. **Clock control:** do not use fake timers. Move `sms_login_last_sent` / `sms_login_code_expires` into the past, and write crafted `sms_login_send_log` arrays (B20–B23), with a direct `db.query().update`. Use a fresh user per cap test so logs don't leak between tests. Also assert `handleSms` is not called (patch it with a `jest.fn`). | Backend (supertest) |
| B7/B8 | Same suite. Check the absence of private keys on `res.body.user`, then GET `/api/users/me` with the Bearer token. Note: `/users/me` requires the Authenticated role to have `plugin::users-permissions.user.me`. Grant it in the test with `grantPrivileges(1, 'plugin::users-permissions.controllers.user.me')` if the test DB default lacks it. This is a test-setup grant, not a production seed. | Backend (supertest) |
| B3/B15/B20/B22 deep-equality | `expect(resUnknown.body).toEqual(resKnown.body)`; same for capped vs sent | Backend (supertest) |
| B24–B26 role | Read the user with `db.query('plugin::users-permissions.user').findOne({ where:{id}, populate:['role'] })` after the request (still null) and after verify (authenticated / unchanged). For B25, GET `/api/users/me` with the returned JWT; this is the proof the strategy accepts the newly granted role. Also a code-review check that `role` is written only in the verify-success update. | Backend (supertest) + code review |
| B27 | Toggle `email_confirmation` through `strapi.store({type:'plugin',name:'users-permissions'})` `advanced` key, restoring in `finally`. | Backend (supertest) |
| B16/B17 | Inspector code review plus `git diff --stat` (sms.js, phone-verification.js and package.json untouched), and a grep for `timingSafeEqual`, `randomInt` and `jwt').issue`. Check there is no log call interpolating the code. | Code review |
| B18 | `npm test` green | Backend |
| F1–F11 | Manual in a browser against both dev servers: steward-bank `npm run develop` with `ENVIRONMENT=development`. Twilio sends for real, or read the code from the DB/admin, or temporarily run with `ENVIRONMENT=test` so the body is printed to the server console. garden-vue runs with `npm run dev`, `VITE_API_URL=http://localhost:1337`. Toggle dark mode via Nav. There is no FE unit-test runner in garden-vue, so these are UI-observable only. | UI-observable |
| F5, F7, F13 | DevTools Network tab: check that the request method, path and body match the API contract exactly (string code, digits-only phone, no Authorization on request/verify) and that responses match the documented shapes. | Contract-level |
| F2 | Read `auth.store.js`: `login` delegates to `setSession`, and the action names match. | Code review |
| F12 | `npm run build && npm run lint` in garden-vue, and `git diff package.json` is empty. | FE build |
| F13 | Also curl the backend directly: `GET /api/garden-tasks?filters[garden][slug][$eq]=<slug>&filters[$or][0][task_status][$ne]=FINISHED&filters[$or][1][task_status][$null]=true` → 200. The old `filters[status][$nei]=finished` → 400, which confirms the diagnosis. | Contract-level + UI |
| Deploy skew | Before merging the FE patch, run the new FE against the current backend (no sms-login routes). Check that the modal shows the generic send error and that the email fallback works. | UI-observable |
