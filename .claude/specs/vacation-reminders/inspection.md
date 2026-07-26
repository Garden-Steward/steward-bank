# Inspection: Vacation Reminders (+ Amendment 1: campaign suppression)

Verdict: **PASS WITH FINDINGS**
(First pass on 2026-07-25 was FAIL on F1/F2; both were fixed and re-verified in a
second pass — see "Re-verification" below.)

Date: 2026-07-25
Base ref: `6daeac839401992324144195fcc6bda5b6a29b58` (all feature work uncommitted in the working tree)
Scope: ignored pre-existing unrelated changes in `fly.toml`,
`src/api/garden-task/controllers/garden-task.js`, `src/api/garden-task/routes/01-garden-task.js`.

Evidence was gathered with three throwaway probe suites that booted their own Strapi
(`tests/inspection-vacation-probe.test.js`, `tests/inspection-sms-route-probe.test.js`,
`tests/inspection-refix-probe.test.js`). **All three are deleted** — `ls tests/inspection-*`
returns "No such file or directory". Their output is quoted inline below.

## Intent restated

A volunteer marks themselves on vacation. Two weeks later the bot **texts them**:
"you're still paused for <their gardens>, reply BACK when you're home." That text
repeats at most weekly. From the *second* text onward it adds the "don't feign
vacation, ask a Garden Manager to remove you" line, in the user's exact wording.
Replying BACK deterministically ends vacation (and never accidentally starts one).
Running the cron more often than weekly must never double-text. Amendment 1: while
paused, they should not receive SMS campaign blasts, and must not be counted as a
"non-voter to nudge" for poll reminders.

## AC scorecard

| AC | Status | Evidence |
|----|--------|----------|
| AC1 — paused ≥15d, no prior check → exactly one SMS; timestamp = now; count = 1 | VERIFIED (state **and** delivery) | `tests/user/vacation-reminders.js:60`; delivery closed by the F1 fix — probe F1b drove the real `sendSms` with `ENVIRONMENT` unset and captured the outbound Twilio request `To: +1557…` (see Re-verification). |
| AC2 — paused 10d → no SMS, no state change | VERIFIED | `tests/user/vacation-reminders.js:86`; probe B1 also showed a 14-day user excluded. |
| AC3 — last check 3d ago → no SMS, unchanged | VERIFIED | `tests/user/vacation-reminders.js:100`. |
| AC4 — last check 7d ago, paused >14d → sends, count +1 exactly | VERIFIED | `tests/user/vacation-reminders.js:113`; probe B3 independently showed count 2→3. |
| AC5 — first reminder has no "feigning vacation" | VERIFIED | `tests/user/vacation-reminders.js:126`; probe B2 printed the full body. |
| AC6 — 2nd+ reminder contains the exact escalation sentence | VERIFIED | `tests/user/vacation-reminders.js:135`; probe B2 exact-substring match; probe B3 confirms it persists at reminder 3. Byte-for-byte the user's wording. |
| AC7 — body names `firstName` and lists all garden titles | VERIFIED | `tests/user/vacation-reminders.js:144`; probe B2: `Hi TwoGarden! … recurring schedules for Alpha Garden, Beta Garden.` Zero-garden case degrades cleanly. |
| AC8 — two back-to-back runs send once (idempotent) | VERIFIED | `tests/user/vacation-reminders.js:168`. |
| AC9 — cron is a pure delegate, no inline logic | VERIFIED | `config/cron-tasks.js:124-137`; `grep "differenceInDays\|findMany\|smsBody" config/cron-tasks.js` → no matches; spy test at `tests/user/vacation-reminders.js:205`. `config/server.js:9` still registers the tasks; rule/tz unchanged. |
| AC10 — paused user texts BACK → fully cleared + "Welcome back" | VERIFIED (route level) | Probe D1 over the real `POST /api/sms`: reply `Welcome back BackGuy! Your account is now active again.`, row `{paused:false, paused_at:null, count:0, last:null}`. Also `tests/user/index.js` helper-level test. |
| AC11 — non-paused user texts BACK → NOT paused, "already active" | VERIFIED (route level) | Probe D2 — the old toggle bug is gone. |
| AC12 — VACATION pauses with count 0; re-entry restarts at 0 | VERIFIED (route level) | Probe D3 and probe D5 full round trip (vacation → reminder #2 → BACK → vacation again → count 0). Probe D4: already-paused no-op preserves the original `paused_at`. |
| AC13 — one failing send does not block others nor advance state | VERIFIED for synchronous failures; see **F10** for the async case | `tests/user/vacation-reminders.js:177`. |
| AC14 — paused excluded from send + `sentInfo` | VERIFIED | `tests/sms-campaign-vacation.js:99` (real service, Twilio stubbed at the transport). |
| AC15 — paused excluded from persisted `sent` relation | VERIFIED | same test; `src/api/sms-campaign/services/sms-campaign.js:386` `sent: activeGroup`. |
| AC16 — all-paused group: zero sends, empty `sentInfo`, campaign row still created | VERIFIED | `tests/sms-campaign-vacation.js:124`. |
| AC17 — exclusion holds for both `getUsersOfInterest` branches | VERIFIED (service) / CLAIMED (HTTP) | `tests/sms-campaign-vacation.js:149` and `:176`. HTTP `groupSms` verified by inspection: `controllers/sms-campaign.js:95-101` passes `vGroup` through untouched and both builder branches return full user rows including `paused`. |
| AC18 — paused non-voter gets no poll reminder; active one does; `reminder_sent` set | VERIFIED | `tests/sms-campaign-vacation.js:223`, real `sendPollReminders()` against a seeded campaign. |
| AC19 — active non-voter still reminded (regression guard) | VERIFIED | same test. |

---

## Re-verification (second pass, after the coordinator's fixes)

### F1 — CLOSED. The reminder now reaches a real phone number.

Fix applied: `src/api/message/services/vacation-checkin.js` — `select` entry
`'phone_number'` → `'phoneNumber'` (line 24), and both reads `user.phone_number` →
`user.phoneNumber` (the `sendSms` call line 51 and the success log line 60).

Re-verified two ways, not just at the mock boundary:

```
F1a phone arg = "+15571000001" | seeded = +15571000001
```

and — the assertion that actually settles it — a probe that unset `ENVIRONMENT=test`
so the **real** `api::sms.sms.sendSms` ran, with Twilio stubbed only at
`RequestClient.prototype.request` (no network):

```
F1b sendVacationCheckIns threw = null
F1b twilio HTTP calls = 1
F1b twilio request data = {"To":"+15571000002","From":"+15105193276",
  "Body":"Hi LiveSend! You're still on vacation and paused from watering and other
   recurring schedules for Refix Garden. Reply BACK once you're back and we'll add you
   to your schedules again.\n\nIf you no longer want the responsibility of being in this
   task please let a Garden Manager know so you can be quickly removed, instead of
   feigning vacation :)"}
F1b twilio uri  = https://api.twilio.com/2010-04-01/Accounts/AC…/Messages.json
F1b row after send = {"vacation_reminder_count":2,"last_vacation_check_sent":"2026-07-25T23:55:15.167Z"}
```

A correctly-addressed, correctly-bodied message is handed to the Twilio Messages API,
and the counter advances in step. The old `[VacationCheckIn] Check-in sent to undefined`
log line is gone with it. The blind spot is also now closed inside the suite by the new
regression test `tests/user/vacation-reminders.js:76` ("AC1: addresses the reminder to
the user's real phone number"), which asserts
`sendSms.mock.calls[0][0] === user.phoneNumber` — the exact assertion `tasks.md:29-30`
had told implementers not to write.

### F2 — CLOSED. The preview count now matches the audience.

Fix applied: `src/api/sms-campaign/controllers/sms-campaign.js:62` —
`numVolunteers: vGroup.filter(v => !v.paused).length`.

Re-verified by running the preview and the real send against the same garden
(3 volunteers, 1 paused):

```
F2a preview = {"copy":"preview copy","numVolunteers":2,"interest":"Everyone","type":"alert"}
F2a raw group size = 3 | preview says = 2 | actually texted = 2
F2b preview (type=poll) = {"n":1,"type":"poll"}
```

`numVolunteers` now equals `sentInfo.length` on both the alert and poll preview paths,
so garden-vue's "This will be sent to N people" (`SmsCampaignModal.vue:555`) is truthful
again.

### Suite state after the fixes

`NODE_ENV=test npx jest tests/app.test.js` (worktree copies excluded):
**32 failed / 103 passed / 135 tests** in this suite. Every failure is on the
pre-existing list (`transferTask`, `recordPollVote`, `sendPollReminders` unit mocks,
`cronHelper`, `getTask`, `skipTask`, `Garden Task Publishing`, `event/rsvp`) — all from
Strapi v5 removing `entityService` or from partial `strapi.db.query` mocks that lack
`.update`. No feature test fails. The coordinator's full-suite figure (6 suites,
32 failed / 227 passed / 259 total, zero new failures vs. the 34/207 HEAD baseline)
is consistent with this and is not re-derived here.

---

## Findings still open

Ordered by severity. F1 and F2 are resolved above and are not repeated.

### F10 — NEW (medium, pre-existing root cause): AC13's guarantee only holds for *synchronous* send failures

Surfaced by the re-verification probe. `src/api/sms/services/sms.js:17-34` is
fire-and-forget: `client.messages.create(sendBody).then(…)` — the promise is neither
returned nor `.catch`ed. So `await sendSms(...)` in `vacation-checkin.js:51` resolves
immediately and a **real** Twilio failure (invalid number, unsubscribed recipient, 4xx)
never reaches the per-user `catch` on line 61. Probe F1c seeded a paused user with a
NULL phone and ran the real send path:

```
F1c no-phone row after run = {"vacation_reminder_count":1,"last_vacation_check_sent":"2026-07-25T23:55:15.790Z"} | twilio calls = 1
```

The row advanced as though the reminder was delivered, and the rejection becomes an
unhandled promise rejection. The AC13 unit test passes because its mock throws
*synchronously*, which is the one failure mode the code does handle. Not a regression
(this is how `sendSms` has always behaved) and outside the feature's file scope, but it
means "a failed send does not advance the counter" is weaker in production than the ACs
claim. Closing it means having `sendSms` return/await the Twilio promise — a one-line
change with blast radius across every SMS caller, so it belongs in its own task.

### F3 — Deliberately open (surfaced to the user as a follow-up)

`volunteer-day.sendGroupMsg` (`src/api/volunteer-day/services/volunteer-day.js:39`) and
the weekly-schedule blast (`services/weekly-schedule.js:87`) still use `sent: volGroup`,
so a volunteer on vacation still receives those group texts. Per Amendment 1 this is out
of scope by design; verified unchanged. Left open at the coordinator's direction.

### F4 — Test hygiene: `sendSms` replaced on the singleton, never restored

`tests/user/vacation-reminders.js:45-47` assigns the mock in `beforeEach`; the `afterEach`
only deletes rows. The mock stays on the shared service for every suite required after it
in `tests/app.test.js`. Harmless today (nothing else touches `sendSms`), but it is the same
class of leak just fixed in `tests/tasks/crontest.js`. Capture and restore the original.

### F5 — Test hygiene: several assertions are DB-global rather than per-user

`expect(sendSms).not.toHaveBeenCalled()` (AC2, AC3) and `toHaveBeenCalledTimes(1)`
(AC1, AC4, AC8) assert over *all* paused users in the shared test DB. They pass today
only because of the suite's own cleanup and because other suites' paused users have
`paused_at = null`. Prefer matching the call whose body contains the seeded `firstName`
(the file already does this in AC13). Same note for `tests/sms-campaign-vacation.js:246`.

### F6 — Coverage the design asked for and the suite still omits

design.md:234 / tasks.md:443 require covering the `> 14` boundary ("14 EXCLUDED,
15 INCLUDED"). No test seeds a 14-day user. Probe B1 confirmed the behavior is correct;
the assertion just does not live in the suite. Port it in.

### F7 — Minor: new `tests/user/index.js` users reuse `mockUserData.phoneNumber`

The three lifecycle tests spread `mockUserData` (`phoneNumber: '+13038833330'`), the same
number `tests/user/user.http.js` uses. Nothing collides today (rows are deleted per test),
but `SmsHelper.getUser` is a `findOne` by phone, so duplicate live numbers would make any
future SMS-routing test non-deterministic. Use unique numbers, as
`tests/user/vacation-reminders.js` does.

### F8 — Test infrastructure: sound

`tests/tasks/crontest.js:8-19` (capture/restore `global.strapi` + `cronHelper.sendingWindow`)
masks nothing — the test that installs the stub still fails; it just no longer poisons every
module required after it. That is what recovered the 2 previously-failing tests. In
`package.json`, `bail: 0` is the default and `testTimeout: 60000` is superseded by
`jest.setTimeout(30000)` in `app.test.js`; `forceExit: true` hides an open-handle leak but
no test result, and the switch to `--runInBand` plus ignoring `<rootDir>/.claude/worktrees/`
is correct — I hit that exact worktree double-collection myself (two suites racing on the
same SQLite file produced 252 spurious failures until the worktree was excluded).

### F9 — Vague / unmechanizable

- "At most once a week": the `differenceInDays >= 7` gate counts whole 24h spans, so on the
  spring-forward Sunday the interval is 6d23h and that week is skipped (volunteer waits 14
  days). Once a year, no AC pins it, no test covers it.
- "Gentle nudge" tone is a human sign-off; the wording matches the requested sentence
  exactly (AC6 verified).

## What remains unverified and how to close it

1. **A real message on a real handset.** Probe F1b proves the correct payload reaches the
   Twilio SDK's HTTP layer, but the transport was stubbed. Close with one staging run of
   `sendVacationCheckIns()` against a seeded paused user with live credentials, checking the
   Twilio message log and the `SMS sid:` line.
2. **The cron firing on Fly at 09:00 America/Los_Angeles.** Only the task body is tested.
   Grep production logs next Sunday for `triggering weeklyVacationCheckIn cron` followed by
   `[VacationCheckIn] Check-in sent to +1…`.
3. **`groupSms` over HTTP.** AC17 was verified at the service seam per the design's own
   instruction; the controller is a pass-through by inspection. One staging send from the
   garden-vue SMS Campaign modal with a paused volunteer in the garden would close it.
4. **The `POST /api/sms` public grant.** The route 403s on an unseeded DB; probe D had to
   insert `api::message.message.fetchSms` for the Public role. `scripts/seed-data.js:515`
   grants it in real environments, but nothing in the suite asserts the grant exists — if it
   were ever dropped, BACK/VACATION would silently 403 with no test catching it.
5. **Human judgment.** Reminder tone, and whether F3 (vacationing users still receiving
   volunteer-day / weekly-schedule blasts) is acceptable, are product calls for Cameron.

## Bottom line

The two blocking defects are genuinely fixed, and fixed at the root rather than papered
over: the reminder is now addressed to the volunteer's actual number — proven by capturing
the outbound Twilio request, not just a mock call — and the manager-facing preview count
again matches who gets texted. Combined with what the first pass established (cron/service
divergence avoided, the BACK toggle bug fixed and verified end-to-end over the real webhook,
correct and idempotent cadence and escalation, campaign exclusion applied once at the right
choke point with `sent` kept consistent), the feature does what the Intent asked. What is
left is one pre-existing robustness gap in `sendSms` (F10), a deliberately-deferred scope
question (F3), and test-hygiene debt (F4-F7) — none of which blocks this landing.
