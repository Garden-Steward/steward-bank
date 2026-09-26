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
