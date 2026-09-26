# Inspection: SMS One-Time-Code Login for the Management Dashboard (Revision 2)
Verdict: **PASS WITH FINDINGS**
Date / base ref: 2026-09-26. steward-bank `d4d37e7c` → `d20c3f2` (branch `claude/tasks-login-flow-7ud71g`); garden-vue `af00ff93` → `b86a1a0` (same branch name).

## Intent restated
A logged-out manager who opens any `/manage` page gets a login dialog on the spot. If they got there by clicking a link, they stay on the page they were on. If they opened the link directly, the public home loads behind the dialog. They enter a phone number, get a 6-digit text code, enter it, and land where they meant to go. An email & password fallback in the same dialog lands them in the same place.

The backend must never show whether a number is registered. That holds for the request endpoint (one identical 200 for every non-invalid case, including throttled and capped) and the verify endpoint (one identical 400 for every failure). Codes are hashed, single-use, expire after 10 minutes and allow 5 wrong guesses. Resends are limited to one per 60 s, 5 per rolling hour and 10 per rolling day.

Role-less SMS-bot volunteers can log in too. They get the `authenticated` role, but only after proving the code. Existing roles are never touched. The success shape matches `/auth/local` `{jwt, user}`, plus a populated `role`. Public pages never show the dialog. The unrelated `task_status` filter bug is fixed.

## Method / evidence sources
- `git diff d4d37e7c..HEAD` (backend) and `git diff af00ff93..HEAD` (garden-vue), read in full.
- `yarn test` with the placeholder env: **3 failed / 458 passed / 461**. The 3 failures are the known pre-existing ones (`transferTask ×2`, `PROBE: garden-anchored day sheet › G2`). All tests in `tests/auth/sms-login.js` pass.
- **Inspection probe** `tests/inspection/sms-login-inspection.test.js`. It boots its own Strapi and is not required from `app.test.js`. Run with `DATABASE_FILENAME=.tmp/probe-sms.db NODE_ENV=test npx jest --runInBand tests/inspection/sms-login-inspection.test.js` → **18/18 green**. Tests prefixed `PROBE-RISK` measure and log values; they do not assert the ideal. The file is left untracked for the main thread to keep or delete. Because it is named `*.test.js`, `yarn test` will pick it up (same as the existing day-sheet probe).
- **Live end-to-end:** steward-bank booted from a throwaway script on scratch sqlite (`NODE_ENV=test ENVIRONMENT=test CRON_ENABLED=false`, so `sendSms` prints the body and codes were read from the server log). garden-vue ran with `vite` and `VITE_API_URL=http://localhost:1337`. Chromium was driven by Playwright. All servers, scratch DBs and scripts stayed outside both trees and the servers were stopped.
  - The scratch DB granted every `api::*` action to Public and Authenticated. This was so the manage pages would not 403 and log the user out; it is not a production grant.
- garden-vue: `vite build` succeeded. `eslint` (without `--fix`) was run on the touched files. `git status` is clean in both `src/` trees.

## AC scorecard

### Backend
| AC | Status | Evidence |
|---|---|---|
| B1 | VERIFIED | `tests/auth/sms-login.js` "B1" (HTTP, formatted phone, `toEqual` body, `sendSms` 1× with E.164, `handleSms` 0×). Live: `{"ok":true,"message":"If that number…","resendAfterSeconds":60,"expiresInSeconds":600}` |
| B2 | VERIFIED | Suite "B2/B19" asserts: hash 64-hex ≠ code; expiry ±30 s; attempts 0; last_sent ±30 s; no column contains the code |
| B3 | VERIFIED (bodies) | Suite "B3" HTTP, plus probe "sent / unknown / blocked / throttled / hourly-capped / daily-capped / role-less are byte-identical 200s": `res.text` identical across all 7 outcomes, and so is `content-type`. See Finding 2 for timing |
| B4 | VERIFIED | Suite "B4" (service level): hash, expiry and last_sent unchanged; first code still verifies. HTTP body identity for throttled is covered by the probe above |
| B5 | VERIFIED | Suite "B5": new hash, attempts 0, old code fails, new one works |
| B6 | VERIFIED | Suite "B6" plus probe: the full envelope `{data:null,error:{status:400,name:'BadRequestError',message,details:{}}}` for missing and `"123"`. Object and array `phoneNumber` payloads → 400, and no query is built from them |
| B7 | VERIFIED | Suite "B7/B8". Probe: verify `user` keys equal the `/auth/local` user keys plus `role` exactly; no `gardens`/`activeGarden`/`profilePhoto`; no private keys. Live: localStorage `user.role.type === 'authenticated'` with no `sms_*` keys |
| B8 | VERIFIED | Suite "B7/B8": `/users/me` returns 200 with the same id and no `sms_login_*` |
| B9 | VERIFIED | Suite "B9" |
| B10 | VERIFIED | Suite "B10/B15" HTTP: `toEqual` on the exact body; attempts +1 |
| B11 | VERIFIED | Suite "B11" (service level) |
| B12 | VERIFIED | Suite "B12" (service level). Probe "B12 over HTTP": five 400s deep-equal to the generic body; hash and expiry null; attempts = 5; the correct 6th → identical 400; role stays null for a role-less user. See Finding 1 for concurrency |
| B13 | VERIFIED | Suite "B13" |
| B14 | VERIFIED | Suite "B14" (service) plus probe over HTTP: identical 400, no `jwt` |
| B15 | VERIFIED (bodies) | Suite "B10/B15" HTTP: unregistered, `"123"`, `"12345"`, `"abcdef"` and missing code are all deep-equal; malformed input leaves attempts alone. Probe adds numeric `12345`, `null`, object code, object phone and an empty body. Exception: an array code, Finding 3. Timing, Finding 2 |
| B16 | VERIFIED (review) | `services/sms-login.js:20` `crypto.randomInt`, `:23` `crypto.timingSafeEqual` (both buffers 32 bytes; the stored value is regex-checked first), `:185` `service('jwt').issue({ id })`. Logic is in the service and the controller only maps results. No log call interpolates the code or hash; logs carry ids/outcomes only. `sendSms` failure logs only `err.name` |
| B17 | VERIFIED | `schema.json` has 5 attributes, all `"private": true`. `git diff --stat` for `package.json`, `sms.js`, `phone-verification.js` and `scripts/` is empty |
| B18 | VERIFIED | `yarn test` is green apart from the 3 known pre-existing failures. `tests/auth/sms-login.js` is required from `app.test.js:55` |
| B19 | VERIFIED | Suite "B2/B19" and "B19 pruning" |
| B20 | VERIFIED | Suite "B20": all 5 columns unchanged; the existing code verifies. HTTP deep-equality from the probe |
| B21 | VERIFIED | Suite "B21" ×2 |
| B22 | VERIFIED | Suite "B22"; HTTP deep-equality from the probe |
| B23 | VERIFIED | Suite "B23" ×2 (log length 1 after pruning) |
| B24 | VERIFIED | Suite "B24" (role null after the request; asserts only the hash of the B2 fields). Probe: role-less sent response identical over HTTP. Live: role-less `+17205550101` received a code |
| B25 | VERIFIED | Suite "B25" (service and HTTP incl. `/users/me`). Probe: a hand-issued JWT for the same role-less user → **401** on `/users/me`, confirming the design's premise; after SMS verify, the DB role = authenticated id and `/users/me` 200. Live: the role-less user logged in through the modal; every later API call returned 200 with no logout loop |
| B26 | VERIFIED | Suite "B26": custom role kept (service and HTTP); authenticated role id unchanged. Probe: a `public`-role user stays `public`. Review: `role` is added to `data` only at `services/sms-login.js:180`, inside the success branch, and only when `!r.user.role` |
| B27 | VERIFIED | Suite "B27" for the request side (blocked role-less; `email_confirmation` on with an unconfirmed role-less user; setting restored in `finally`). Probe for the verify side: a code obtained while the setting was off fails after it is turned on, and role stays null. Probe "no failure path writes role": expired, blocked-after-send, never-requested, and a missing authenticated role (patched to null) → generic 400, role null, `sms_login_*` unchanged |

### Frontend
| AC | Status | Evidence |
|---|---|---|
| F1 | VERIFIED (live) | `/login` has 2 inputs and no dialog; email login landed on `/manage` with `user` and `_stewToken` in localStorage. `login(u,p,{redirect:false})` exercised through the modal fallback (F9) |
| F2 | VERIFIED (review) | `auth.store.js`: `setSession` exists and `login()` delegates to it with no duplicated localStorage writes. `requestSmsCode`, `verifySmsCode`, `openLoginModal`, `closeLoginModal`, `finishModalLogin` and `loginModalOpen` are present |
| F3 | VERIFIED (live) | `$router.push('/manage/projects')` from `/gardens` left the URL at `/gardens` and opened the dialog with `returnUrl` set. Escape, X and backdrop each closed it; URL still `/gardens`, `returnUrl: null`. No `/login` navigation |
| F4 | VERIFIED (live) | A deep link to `/manage/gardens/live-garden` landed on `/` with the dialog open and the phone input focused. After the code it ended at `/manage/gardens/live-garden` |
| F5 | VERIFIED (live) | Display `(720) 555-0100`. Wire: POST `/api/auth/sms-login/request` body `{"phoneNumber":"7205550100"}`, no Authorization. An unregistered number also moved to the code step, with no SMS in the server log. A 400 (`1234567890`) showed the backend message inline and stayed on the phone step |
| F6 | VERIFIED (live) | `autocomplete=one-time-code`, `inputmode=numeric`, `maxlength=6`, `pattern=\d{6}`, autofocused. "Resend in 60s" and disabled, then "Resend in 58s" after about 2 s. After 61 s it read "Resend code" and was enabled. Clicking it sent a 2nd request, produced a new code, and reset to "Resend in 60s" (disabled) |
| F7 | VERIFIED (live) | Wire: `{"phoneNumber":"7205550100","code":"024825"}` (string, leading zero kept), no Authorization. On 200, localStorage had `user` (with `role`) and `_stewToken`, the modal closed, and the app navigated to the intended route. Later `/api/gardens/live-garden/full`, `/api/volunteer-days/...` and others carried `Bearer` |
| F8 | VERIFIED (live) | Wrong code → "That code is invalid or expired." inline, input cleared, still on the code step, URL unchanged, localStorage `user` still null (400, so no logout) |
| F9 | VERIFIED (live) | From `/gardens` → `/manage/projects` via fallback: bad password → inline "Invalid identifier or password", modal stays open. Good password → `/manage/projects`, not `/manage`. See Finding 4 (unlabeled fields) |
| F10 | VERIFIED (live, partial) | With `html.dark`: panel `rgb(45,62,38)` = `#2d3e26`, border `rgb(61,77,54)` = `#3d4d36`, input `rgb(52,74,52)` = `#344a34` with text `#f5f5f5`. Screenshot looked readable. The autofill rule exists in CSS but was not exercised with real autofill. Light mode was not pixel-compared to existing modals |
| F11 | VERIFIED (live) | `/`, `/events`, `/gardens/live-garden` and `/gardens/live-garden/tasks` logged out: no dialog and no redirect |
| F12 | VERIFIED | `vite build` exit 0. `eslint` on touched files: 1 error, `router.js:209 'isPublicRoute' is assigned a value but never used`, which **also exists at base** `af00ff9`, so nothing new. `package.json` unchanged |
| F13 | VERIFIED | `grep -rn "filters\[status\]" src/` is empty. Live: public tasks page sent `…filters[$or][0][task_status][$ne]=FINISHED&filters[$or][1][task_status][$null]=true` → 200. The manage garden page (`filters[garden][id]`) → 200 and the Finished task was not shown. Probe: new filter → 200 returning `PENDING` and `null` rows, not `FINISHED`; old `filters[status][$nei]` → 400 "Invalid key status"; the VolunteerActivity `$in` query → 200 |

## Findings (ordered by severity)

### 1. DRIFT (medium): throttle, send caps and attempt limit are read-check-write without atomicity; parallel calls bypass them at the code level
The Intent says codes "can be re-sent at most once every 60 seconds" and "a user gets at most 5 codes per rolling hour and 10 per rolling day". `requestCode` reads `sms_login_last_sent`/`sms_login_send_log` and later writes a new log built from its stale read (`services/sms-login.js:84-111`). `verifyCode` writes `attempts = stale + 1` (`:159-166`). A successful verify writes `attempts: 0`.

Probe `service-level parallel burst`, with 20 `requestCode` calls for one user in `Promise.all`:
```
PROBE svc burst: 20 parallel requestCode -> 20 sendSms, log length 1;
                 30 wrong+1 right parallel verifyCode -> right ok=true, attempts=0
```
- **Request side:** 20 SMS were sent in one burst, and only one entry was recorded in the send log. Neither the 60 s throttle nor the 5/hour and 10/day caps held. The design's risk section does not cover this; it only discusses concurrent *verifies*.
- **Verify side:** the design accepted "slightly more than 5 guesses … bounded by request concurrency". In practice the bound is whatever concurrency the attacker chooses. In the probe, 30 wrong guesses plus the right one in one burst still logged in.
- **Over HTTP on the sqlite test DB** (pool max 1) it did **not** reproduce. 40 parallel HTTP requests over warmed keep-alive sockets led to 1 SMS, attempts = 5, and the right code rejected, because requests were effectively serialized.
- **Production is Postgres with pool max 10**, where concurrent reads before writes are far more likely. That remains unverified (see below).
- Upgrade path, for the main thread to decide: conditional updates. For example, `UPDATE … WHERE id=? AND (sms_login_last_sent IS NULL OR sms_login_last_sent < now-60s)` and check the affected row count before sending. Use an atomic `attempts = attempts + 1 … RETURNING` for verify.

### 2. DRIFT (medium-low): timing gives a silent registered-number oracle, and the design only accepted a narrower leak
- **Design (Risks):** "Remaining leak: timing. The eligible path does one extra DB write; the SMS send is not awaited. Accepted." That covers only the request side, and that side sends an SMS to the victim, so it is noisy.
- **Code:** for any **registered** number, `isEligible` also reads the plugin store (`services/sms-login.js:59`). Unknown numbers skip that read.
- Probe `timing` (medians in ms over 25–40 samples, stable across 3 runs):
  ```
  verify (silent, no SMS ever sent): unknown=3.12  registered-no-active-code=4.07
  request: unknown=3.26  blocked=4.81  throttled=4.10  sent=7.11
  verify:  unknown=3.32  known-wrong=6.96
  ```
- **Why it matters:** verifying with any 6-digit code against a number that has no active code sends no SMS, writes nothing and has no rate limit, yet it still takes measurably longer for a registered number. So enumeration is possible silently, which contradicts the Intent ("The backend never says whether a phone number is registered").
- The response bodies are correct (B3/B15 are VERIFIED). This finding is about side-channel exposure beyond what the design accepted.
- **Cheap mitigations**, not applied: read the `advanced` store once before `resolveUser` on every path, and/or do a dummy `timingSafeEqual` on the unknown path.
- Whether ~1 ms survives Fly/Postgres network jitter is unverified.

### 3. Low: an array `code` is coerced to a valid code
`String(code ?? '')` turns `["123456"]` into `"123456"`. The contract says `code` "must be a **string**", with only numbers stringified. Probe "FINDING: a JSON array code": a wrong array code consumes an attempt, and the right array code returns 200. There is no security impact beyond an ordinary guess, but the input is not validated as the contract says. Same pattern for `phoneNumber: 5551234567` (a number), which the design allows.

### 4. Low-medium (FE, UX/a11y): the email & password fallback fields have no label, placeholder or aria-label
`LoginModal.vue` email step: `<input type="email" …>` and `<input type="password" …>` have no `<label>`, `placeholder` or `aria-label`. The probe reports `label: 0, placeholder: "", aria: null`, and screenshot `shot-email.png` shows two blank boxes under "Log in to continue". The phone step does have a label.

This is a new surface the Intent relies on ("use email & password option"). Screen readers announce unnamed fields. The design's accessibility section did not explicitly require labels, so this is a vague-AC gap as much as an implementation one.

### 5. Low (FE, cosmetic): the backdrop does not cover the Nav on desktop
`.login-modal-wrapper { z-index: 10001 }` has no effect because the wrapper is `position: static`. The backdrop (`position: fixed`, no z-index) renders under the z-indexed Nav, so on desktop the Nav stays bright above the dimmed page (screenshot `shot-phone-dark.png`). On a 375 px viewport the transparent click layer covers the Nav, so clicks are blocked. This is cosmetic only.

### 6. Low (FE): Resend does not guard against double-click
`resend()` does not set `isSubmitting`, so a fast double-click fires two requests. The backend throttle absorbs the second one, which returns the same 200 with no second SMS, subject to Finding 1.

### Test-quality findings (implementer suite `tests/auth/sms-login.js`)
- **Service-level coverage:** most state-machine ACs (B4, B5, B9, B11–B14, B20–B23) are tested at service level only. The HTTP mapping for throttled and capped outcomes, B12's five 400 bodies, and B14 over HTTP were not exercised. The controller maps them uniformly, so risk is low, and the probe now covers them over HTTP.
- **B3 "unchanged" is trivially true:** the blocked user starts with every `sms_login_*` null, so the "unchanged" loop cannot detect a write. A blocked user with a pre-existing live code would be a real check.
- **B24 is partial:** it asserts only the hash, not the full B2 field set (expiry, attempts, last_sent).
- **Swallowed setup error:** the HTTP `beforeAll` wraps `grantPrivileges(... ['me'])` in a `try/catch` that swallows errors. It works because B8 passes, but a silent catch in setup can hide a broken grant.
- **No concurrency tests:** there are none, so Finding 1 was invisible to the suite.
- **Strengths:** the B27 email_confirmation test is genuinely discriminating (it would fail if `isEligible` ignored the setting). B25 proves the grant through `/users/me`, not just the DB row. B10/B15 HTTP use exact `toEqual` bodies.

### Vague-AC / design notes
- **AC-F10:** "inputs are readable, including autofill" cannot be checked without a real autofill event. The CSS rule is present.
- **AC-F13:** "lists show no FINISHED tasks" passes, but the public `GardenTasksPublic.vue` `activeTasks` filter (existing code, not changed here) also drops `task_status = null` tasks on the client. The `$null` branch therefore only changes what the manage-side lists show.
- **Role-less eligibility depends on production config:** `SmsHelper.joinGarden` creates users without `confirmed` (schema default `false`). If production has `email_confirmation` on, every SMS-bot volunteer is ineligible and the Revision 2 role-less path does nothing. Nothing in the repo sets this, so the production value is unknown.

## What remains unverified and how to close it
- **Concurrency on Postgres (Finding 1):** run the probe's burst cases over HTTP against a Postgres-backed instance (staging), or add a conditional-update fix with a test that fires parallel requests against Postgres.
- **Timing oracle size in production (Finding 2):** time ~200 `verify` calls from outside Fly for a known-registered and a known-unregistered number and compare the distributions.
- **Real Twilio delivery and one-time-code autofill on iOS/Android:** manual test on devices after deploy. Watch Sentry and logs for `sms-login: sendSms failed`.
- **Production `advanced.email_confirmation` value:** check the users-permissions Advanced Settings in the prod admin. If it is on, decide whether SMS-bot volunteers should be eligible.
- **What role-less volunteers can do once they become Authenticated** (design risk "Worth a review of what the Authenticated role can do before deploy"): a human review of the prod Authenticated role grants. `seed-content-permissions.js` gives Authenticated full CRUD on plants, projects and location-trackings, and the grant is not scoped to a garden.
- **Deploy skew:** simulated only, by intercepting the request in the browser. 404 JSON, 405 text and a network abort all showed "Couldn't send a code. Try again or use email & password." It was not run against an actual old backend build.
- **Light-mode visual parity** with existing modals: human eyeball check.

---

# Re-inspection (T10–T13)
Verdict: **PASS WITH FINDINGS**. Findings 1 and 3–6 are closed. Finding 2 is only partly closed: a registered number still costs one more DB round trip than an unknown one. No regressions found.
Date / refs: 2026-09-26. steward-bank `47aa8dd` → `a06a9b9` (T10 `5ca3a0a`, T11 `36f72b7`, T12 `a06a9b9`). garden-vue `24b143d` → `b23aceb` (T13).

## Method / evidence sources
- Read `git diff 47aa8dd..a06a9b9` (service, tests, design.md) and `git diff 24b143d..b23aceb` (`LoginModal.vue`) in full.
- **Full `yarn test`:** 3 failed / 469 passed / 472. The 3 failures are the known ones (`transferTask` ×2, day-sheet G2).
- **Targeted `-t "sms-login"`:** 43/43 passed on 3 consecutive runs. C6/C7 did not flake.
- **Scratch probe** `reinspect-probe.js`, kept in the session scratchpad and not in the repo. It boots Strapi in-process with `sendSms` stubbed. It runs service-level parallel bursts, raw-SQL edge cases, an injected role-write failure, HTTP byte-identity checks and timing.
  - It ran twice: on **sqlite** (test config, pool 1) and on a **local PostgreSQL 16** with the production `config/database.js` (pool max 10, `NODE_ENV=development`).
  - The pg run used a throwaway database and role. Both were dropped afterwards and the cluster was stopped.
- **Live browser run:** Playwright/Chromium from `/opt/pw-browsers`, against `vite` (garden-vue) and a scratch-sqlite steward-bank. SMS codes were read from the server log. Screenshots are in the scratchpad (`re-stack-*.png`, `re-email.png`, `re-dark-phone.png`).
- **Cleanup:** all servers were stopped. `git status` is clean in both repos. `eslint LoginModal.vue --no-fix` exits 0.

## Scorecard: prior findings
| Finding | Status | Evidence |
|---|---|---|
| 1 Races (throttle, caps, attempts) | **CLOSED (VERIFIED on sqlite and Postgres)** | See "Finding 1 detail" below |
| 2 Timing oracle on silent verify | **PARTIAL (GAP)** | The plugin-store read is now uniform, but `resolveUser`'s `populate: ['role']` adds a query only when a user row exists. See R1 |
| 3 Non-string `code` | **CLOSED (VERIFIED)** | Service: `[code]`, `Number(code)`, `123456`, `{code}`, `true`, `null`, `undefined` and `[Number(code)]` all return `malformed`; attempts stay 0; `"<code> "` (trimmed string) still works. HTTP: array, number, 6-digit number, object, boolean and null codes all return the byte-identical generic 400. After 1 mismatch plus 10 malformed or non-string posts, attempts = **1** |
| 4 Unlabeled email/password | **CLOSED (VERIFIED live)** | Visible `<label>`s "Email" → `#login-modal-email` and "Password" → `#login-modal-password` (screenshot `re-email.png`). `getByLabel('Email')` resolves to `type=email` and `getByLabel('Password')` to `type=password`. `autocomplete` is still `username` / `current-password`. The code input's accessible name is "Login code" (`getByRole('textbox',{name:'Login code'})` = 1). Real password-manager autofill was not exercised |
| 5 Backdrop over Nav | **CLOSED (VERIFIED live)** | See "Finding 5 detail" below |
| 6 Resend double-click | **CLOSED (VERIFIED live)** | After 61 s: `dblclick` on "Resend code" → **1** POST `/request`, 1 new code, "New code sent.", label "Resend in 59s" (disabled). Three synchronous `.click()` calls in one tick → **1** POST |
| 7a B3 "unchanged" trivially true | **CLOSED** | Service and HTTP B3 now seed a live-looking hash, attempts 2 and last_sent 2 h ago, and assert the seed landed. My HTTP probe: a blocked user with a seeded hash and attempts gets the identical 200 |
| 7b B24 partial | **CLOSED** | B24 now asserts expiry, attempts, last_sent and the last log entry |
| 7c Swallowed setup error | **CLOSED** | `beforeAll` and the `try/catch` were removed along with the unused `grantPrivileges` import. B7/B8/B25 (HTTP) still pass. Probe: `/users/me` → 200 on a fresh DB, both sqlite and pg |
| 7d No concurrency tests | **CLOSED** | C1–C7 added (service-level `Promise.all`). They mirror my original burst |
| 7e HTTP coverage of state machine | Unchanged (acceptable) | Still covered by the re-inspection probe over HTTP (below), not by the suite |

### Finding 1 detail (burst results, sqlite and pg identical unless noted)
- **20 parallel `requestCode`, ×5:** `sendSms=1`, one `sent`, log length 1, and the texted code verifies. The earlier result was 20 SMS with log 1.
- **Hourly cap** (4 in the last hour, last_sent 2 min ago), 20 parallel, ×3: `sendSms=1`, 5 log entries within the hour. A second burst after moving last_sent back: `sendSms=0`.
- **Daily cap** (9 in the last day), 20 parallel, ×3: `sendSms=1`, log = 10.
- **HTTP burst of 15 requests:** 1 SMS, and all 15 bodies byte-identical.
- **30 wrong guesses plus the right code, in parallel, ×5 each,** with the right code last, in the middle, and last for a role-less user:
  - result: right code rejected (`claim_lost`), `attempts=5`, hash and expiry null;
  - role-less user's role stays **null**.
- **Right code first in the array:**
  - sqlite: logs in 5/5 (it is serialized ahead of the wrong guesses);
  - pg: logs in 3/5 and is rejected 2/5, because on a real pool, 5 wrong guesses sometimes committed first.
  - Both outcomes are correct: a login happens only while fewer than 5 failures are recorded.
- **Sequential 5 wrong then right:** rejected, attempts 5. **6 wrong plus right in parallel:** rejected, attempts 5.
- Attempts never exceeded 5. After the 5th failure clears the hash, the `WHERE hash = stored` guard makes later bumps no-ops.
- **SQL review for Postgres correctness:**
  - **Affected-row counts:** knex resolves `update()` to `resp.rowCount` on pg (`knex/lib/dialects/postgres/index.js:254`) and to `changes` on better-sqlite3. Strapi `updateMany` passes that number through as `{count}` (`@strapi/database/dist/entity-manager/index.js:306`).
  - **CASE/COALESCE:** these read the pre-update row in both engines, as the SQL standard requires. Probe results: NULL attempts → 1 with the hash kept; 4 → 5 clears hash and expiry; a claim with attempts NULL succeeds. (MySQL evaluates SET left-to-right and would differ, but it is not a target.)
  - **Column names:** resolved via `strapi.db.metadata`. The emitted pg SQL uses `"up_users"` and the snake_case columns.
  - **Row locking:** under READ COMMITTED, pg re-checks the WHERE of a blocked UPDATE against the committed row. That is why the conditional updates hold at pool 10.
  - **Datetime compare:** the `$lte` ISO comparison was correct on pg, but only with process and DB in UTC (same as Fly).
- **Role write after a successful claim:** see R2.

### Finding 5 detail
- The wrapper is now `position: fixed`.
- `elementsFromPoint` at the left, centre and right of `nav.gs-navbar` puts `.login-modal-backdrop` (index 1) above the Nav (index 3). This holds at **1280×800 and 375×812, in light and dark**. Screenshots `re-stack-1280-light.png` and `re-stack-375-dark.png` show the Nav dimmed.
- After Escape, `.login-modal-wrapper` count = 0 and the page centre is reachable, so the new `fixed inset-0` wrapper does not block the page when closed.
- **Correction to the original finding:** T13's author measured that the Nav was already dimmed at base (`#modals` is a z-20 root context and `.app-container` is z 1). My original "Nav stays bright" was most likely a misreading of the cream Nav under the dark backdrop. I did not re-check base myself. The change is defensive and harmless.

## Scorecard: regression ACs
| AC | Status | Evidence |
|---|---|---|
| B3 | VERIFIED | HTTP, sqlite and pg. 8 outcomes (sent, throttled, unknown, blocked with seeded state, hourly-capped, daily-capped, role-less, numeric `phoneNumber`) plus a 15-way concurrent burst, where losers take the new `count !== 1` path. Result: **1 distinct** `status\|content-type\|body` = `200\|application/json; charset=utf-8\|{"ok":true,"message":"If that number belongs to a Garden Steward account, a login code has been sent.","resendAfterSeconds":60,"expiresInSeconds":600}` |
| B7/B8 | VERIFIED | Probe: 200 `{jwt,user}`. `user` has the same key set as before plus `role` (`authenticated`), and no `sms_*`. `/users/me` → 200, same id, 0 `sms_*` keys. Live: localStorage `user.role.type = authenticated`, no `sms_*`, `_stewToken` set |
| B12 | VERIFIED | Sequential: 5 wrong then right → rejected, attempts 5. Concurrent: see Finding 1 detail (sqlite and pg). Suite C5–C7 |
| B15 (incl. non-string) | VERIFIED | HTTP, sqlite and pg. 17 failure cases → **1 distinct** `400\|application/json; charset=utf-8\|{"data":null,"error":{"status":400,"name":"BadRequestError","message":"Invalid or expired code","details":{}}}`. The cases were: mismatch, unknown, registered-no-code, blocked, expired, `"12345"`, `"abcdef"`, missing, `[code]`, `Number(code)`, `123456`, `{code}`, `true`, `null`, bad phone, object phone and an empty body. design.md lines 190, 288–290 and the AC-B15 bullet match the implementation |
| B16 | VERIFIED (review) | `randomInt`, `timingSafeEqual` and `jwt.issue({id})` are unchanged. The new dummy compare uses a 32-byte `DUMMY_HASH`. New log lines carry only user id and reason (`counted=`, `claim_lost`); no code or hash is interpolated |
| B24 | VERIFIED | Suite B24 now asserts the full field set. Probe: role-less request → identical 200 and 1 SMS |
| B25 | VERIFIED | Probe HTTP (sqlite and pg): 200, body and DB role = `authenticated`. Live verify for a role-less user was not repeated this round, but was verified in round 1 |
| B26 | VERIFIED | Probe HTTP: a `public`-role user stays `public` after verify. Suite B26 is green |
| B27 | VERIFIED | Probe HTTP: with `email_confirmation` on, an unconfirmed role-less user's request → 200. Verify with a code obtained earlier → 400, role null, and the stored hash untouched. Suite B27 is green |
| F5 | VERIFIED (live) | Display `(720) 555-0100`. Wire `{"phoneNumber":"7205550100"}`, no Authorization, 1 SMS |
| F6 | VERIFIED (live) | `autocomplete=one-time-code`, `inputmode=numeric`, `maxlength=6`, `pattern=\d{6}`, `aria-label="Login code"`, focused. "Resend in 59s" (disabled) → after 61 s "Resend code" (enabled). The resend guard is described under Finding 6 |
| F7 | VERIFIED (live) | Wire `{"phoneNumber":"7205550100","code":"172829"}` (string), no Authorization. It landed on `/manage/gardens/live-garden` (the deep link) with the modal closed and `user` and token stored |
| F8 | VERIFIED (live) | Wrong code → "That code is invalid or expired.", input cleared, URL unchanged, `user` null |
| F9 | VERIFIED (live) | From `/gardens` → `/manage/projects`: bad password → inline "Invalid identifier or password", modal open. Good password → `/manage/projects`. A `pageerror {name:""}` after landing also occurred in round 1. It comes from the pre-existing projects page (`GET /api/projects … populate[2]=created_by` → 400 "Invalid key created_by" on the scratch DB), and T13 did not cause it |
| F10 | VERIFIED (live) | Dark: panel `rgb(45,62,38)`, border `rgb(61,77,54)`, input `rgb(52,74,52)`, text and label `#f5f5f5` (measured after the 0.3 s transition). Light screenshot unchanged |

## New / residual findings
### R1. GAP (medium-low): the silent verify timing oracle persists, now from the role populate
- **Intent of T11:** "Make verify and request do the same DB reads for registered and unknown numbers." The plugin-store read is now uniform: `services/sms-login.js:89,172` read it on every path.
- **What remains:** `resolveUser` still does `findMany({ …, populate: ['role'] })` (`services/sms-login.js:61-65`). Strapi issues the populate as a **second SELECT only when a row exists**. SQL captured on pg:
  ```
  unknown:     select … from "up_users" … where "phone_number" = $1
               select … from "strapi_core_store_settings" …
  registered:  select … from "up_users" … where "phone_number" = $1
               select distinct "t0".*, "t1"."user_id" … from "up_roles" left join "up_users_role_lnk" …   <-- extra
               select … from "strapi_core_store_settings" …
  ```
- **Measured (medians of 60, 3 rounds, verify with no active code):**

  | DB | Level | Unknown (ms) | Registered, no code (ms) |
  |---|---|---|---|
  | sqlite | HTTP | 7.46 / 5.71 / 4.17 | 9.47 / 6.82 / 4.79 |
  | sqlite | service | 0.9–1.2 | 1.3–1.8 |
  | **pg** | **HTTP** | **6.37 / 6.37 / 5.82** | **7.79 / 8.29 / 7.29** |
  | pg | service | 2.1–2.5 | 3.4–3.9 |

  - Round 1 on sqlite was 3.12 vs 4.07 over HTTP. The gap went from about 1 ms to about 0.6 ms on sqlite.
  - On Postgres the gap is still one full DB round trip, about 1.3–1.9 ms. Over a network link to the DB in production it will likely be larger, not smaller.
- **Test blind spot:** U1/U2 assert that `advancedSettings` is called exactly once. That is a proxy for "same DB work", so they pass while the oracle remains.
- **Options, for the main thread:**
  - drop `populate` from `resolveUser` and read the role only on the success path, after the claim (it is needed only for `!r.user.role`);
  - or issue an equivalent dummy role query on the unknown path.
  - A test that counts `knex` `query` events per path would lock it in.

### R2. Low: if the role write after the claim fails, the user gets a 500 and the code is spent (fails closed)
- **Where:** `services/sms-login.js:238-240` runs after the claim at `:229-236`.
- **Probe:** I injected a throw on the `role` update for a role-less user with the correct code. Results:
  - `verifyCode` rejects;
  - the controller has no try/catch, so Strapi's error middleware answers **500** (the HTTP 500 is inferred from the controller code, not probed);
  - DB after: hash null, attempts 0, **role null**, no JWT issued;
  - a retry with the same code → `no_code`.
- **Security:** no bypass and no half-state. No JWT is issued and the role stays null.
- **Impact:** the user must request a new code, which the 60 s throttle allows. The 500 is only reachable with a correct code, so it is not an enumeration channel. The same applies to a failure in `jwt.issue` or the final `findOne`.
- **Optional hardening:** wrap claim + role write in `strapi.db.transaction`. No suite test covers this path.

### R3. Test-quality notes on the new tests
- **C1–C7 are discriminating:** they reproduce my round-1 burst, which sent 20 SMS on the old code. I did not re-run the red phase myself (it would require editing `src/`).
- **C6/C7 are sqlite-specific.** They rely on the single-connection pool running the right code last. On pg the burst outcome depends on commit order (see "right code first" above). The invariant they protect still held in every pg run.
- **B15b (HTTP) `Number(code)`** discriminates against a `String()`-coercing implementation only when the code has no leading zero, which fails about 10% of the time. The array case always discriminates, so the test is sound overall.
- **Untested:** the expired-path `updateMany` scoping (`where hash = read hash`) has no test; it was reviewed only. The role-write-failure path (R2) is also untested.

### R4. Note (no action): Postgres probe ran in UTC only
The throttle's `$lte` ISO comparison on a `timestamp` column was verified with both process and DB in UTC. That matches Fly; a non-UTC server TZ was not tested.

## What remains unverified and how to close it
- **Timing on production infrastructure (R1):** after any R1 fix, time ~200 verify calls from outside Fly, registered vs unregistered, and compare the distributions.
- **Real password-manager autofill** into the newly labelled fields: manual check in Chrome/1Password/iOS Keychain.
- **HTTP 500 body on role-write failure (R2):** inferred from the controller, not probed over HTTP.
- **Round-1 items still open:** production `email_confirmation` value, review of Authenticated role grants, Twilio delivery/iOS OTP autofill, and deploy skew against a real old build.
