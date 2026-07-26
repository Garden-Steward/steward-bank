# Vacation Reminders
Status: DESIGNED
Requested by / date: Cameron (cameron@oufp.org) / 2026-07-25

## Intent
When a volunteer marks themselves as on vacation (paused from watering and other
recurring schedules), Garden Steward should not silently leave them paused
forever. After two weeks of vacation, the bot texts the volunteer to remind them
they are still on vacation across all their Garden Steward gardens and asks them
to reply BACK when they have returned. This reminder repeats at most once a week
while they remain paused. From the second reminder onward, the message adds a
gentle nudge that if they no longer want the responsibility they should tell a
Garden Manager to be removed rather than "feigning vacation." Replying BACK ends
the vacation and restores them to their schedules; the whole loop must be
idempotent so a cron that fires more than once a week never double-texts.

## Current state
Vacation is already modeled globally per user (not per garden) on the
users-permissions user content type
(`src/extensions/users-permissions/content-types/user/schema.json`):
- `paused` (boolean, default false) — the vacation flag, line 65.
- `paused_at` (datetime) — when vacation started, line 69.
- `last_vacation_check_sent` (datetime) — last reminder timestamp, line 73.
- `gardens` (manyToMany → `api::garden.garden`, line 109) — the user's gardens,
  the source for "all their gardens."

A weekly reminder already exists but is incomplete for this request:
- `config/cron-tasks.js:124` `weeklyVacationCheckIn` runs Sundays 09:00
  America/Los_Angeles (`0 9 * * 0`). It inlines its logic instead of calling the
  parallel service `sendVacationCheckIns` in
  `src/api/message/services/vacation-checkin.js` (uid `api::message.vacation-checkin`),
  which is dead code today — the cron and the service have diverged.
- The current logic gates on `daysPaused > 14` and
  `daysSinceLastCheck >= 7`, which already gives the "2 weeks then weekly" cadence
  and is idempotent. What is missing: (a) it does not list the user's gardens,
  (b) there is no reminder counter, so it cannot escalate on the second reminder,
  and (c) the copy tells them to "Text BACK or VACATION" and to "just ignore this
  message," which contradicts the requested tone.

Inbound SMS is handled by `message.fetchSms`
(`src/api/message/controllers/message.js:50`), routed at `POST /sms`
(`src/api/message/routes/message.js`). Keyword `back` and `vacation` both map to
`SmsHelper.applyVacation` (`SmsHelper.js:660`), which **toggles** `paused`. This
is a latent bug for this feature: BACK is supposed to *end* vacation
deterministically, but today if a non-paused user texts BACK they get *paused*.
`applyVacation` also does not reset the reminder counter (which does not yet
exist) or `last_vacation_check_sent`.

Outbound SMS goes through `strapi.service('api::sms.sms').sendSms(phone, body)`
(`src/api/sms/services/sms.js:17`). In `ENVIRONMENT=test` it logs and returns
without hitting Twilio, so tests assert by spying on `sendSms`.

Frontend touch: garden-vue only reads `paused` as a display prop
(`VolunteerDetail.vue:25`). No frontend change is needed — this is backend-only.

## Design

### Schema change
Add one attribute to the user content type
(`src/extensions/users-permissions/content-types/user/schema.json`):
- `vacation_reminder_count` (integer, default 0) — number of vacation reminders
  sent during the *current* vacation. Reset to 0 whenever a vacation starts or
  ends. This drives both cadence bookkeeping and the second-reminder escalation.

No data migration is required: existing paused users default to 0, which simply
means their next reminder is treated as their first (no escalation line yet) —
acceptable and safe.

### Vacation lifecycle: split the toggle into explicit start/end
Replace the toggling `applyVacation` with two deterministic, idempotent service
methods on `SmsHelper` (thin keyword routing in the controller stays thin;
mutation logic lives in the helper as it does today for the SMS flow):

- `startVacation(user)` — keyword `vacation`:
  - If already paused: reply "You're already on vacation…"; make **no** DB write.
  - Else set `paused=true`, `paused_at=now`, `vacation_reminder_count=0`,
    `last_vacation_check_sent=null`. Reply with the existing "now paused" copy.
- `endVacation(user)` — keyword `back`:
  - If not paused: reply "Welcome back! You're already active…"; no DB write.
  - Else set `paused=false`, `paused_at=null`, `vacation_reminder_count=0`,
    `last_vacation_check_sent=null`. Reply with the existing "Welcome back" copy.

Controller routing (`message.js:163-166`) changes so `case 'vacation'` →
`startVacation` and `case 'back'` → `endVacation`. This makes BACK always end
vacation, satisfying the request, and removes the accidental-pause bug.

Ending vacation restores schedules automatically: the scheduler/backup selection
already filters on `!paused` (`SmsHelper.getBackupVolunteers`, `passToNextVolunteer`
`SmsHelper.js:589,705`), so clearing `paused` is the entire restoration — no
schedule rewrite needed.

Note: `applyVacation` may be kept as a thin alias for `startVacation` to preserve
the existing unit test's entry point, or the test updated to call `startVacation`.
Call this out to the implementer; do not leave both a toggle and a split live.

### Reminder send: consolidate into the service, then enhance
Make `config/cron-tasks.js` `weeklyVacationCheckIn` a thin wrapper that calls
`strapi.service('api::message.vacation-checkin').sendVacationCheckIns()`, and move
all logic into that service (controllers/crons thin, services fat). Then enhance
`sendVacationCheckIns` to:

1. Query paused users, additionally populating `gardens` (title only) and
   selecting `vacation_reminder_count`. Continue using
   `strapi.db.query('plugin::users-permissions.user')` with the existing
   snake-case select fields (`phone_number`, `paused_at`,
   `last_vacation_check_sent`) — this is the established pattern in this file and
   in `SmsHelper.getUser`; do not switch to `documentId`-based Document Service
   here, and do not rename the columns.
2. For each user, keep the existing gate:
   `daysPaused > 14 && (!last_vacation_check_sent || daysSinceLastCheck >= 7)`.
3. Compute `newCount = (vacation_reminder_count || 0) + 1`. Build the body:
   - Base: greet by `firstName`, state they are still on vacation and paused from
     watering / recurring schedules for their gardens, list the garden titles
     (comma-joined; omit the list gracefully if they have none), and instruct
     "Reply BACK once you're back and we'll add you to your schedules again."
   - If `newCount >= 2`, append exactly:
     `If you no longer want the responsibility of being in this task please let a
     Garden Manager know so you can be quickly removed, instead of feigning
     vacation :)`
4. Send via `strapi.service('api::sms.sms').sendSms(phone_number, body)`.
5. On success, update the user: `last_vacation_check_sent = now`,
   `vacation_reminder_count = newCount`. Do this update **only after** a
   successful send (existing try/catch already isolates send failures so one bad
   number does not block others, and a failed send does not advance the counter).
6. Optionally log a `message` record of `type: 'notification'` for the reminder
   (reuse `SmsHelper.saveMessage` / the existing `message` content type; the
   `type` enum has no `vacation` value, so use `notification`). This is desirable
   for auditability but OUT of scope as a hard requirement.

### Error behavior
- A send failure for one user is caught and logged; the counter and
  `last_vacation_check_sent` are not advanced, so that user retries next run.
- Users with `paused=true` but `paused_at=null` are skipped (existing `$ne: null`
  guard) — they cannot have a computable `daysPaused`.

### Explicitly out of scope
- Per-garden vacation (vacation stays global per user).
- Any garden-vue change.
- New HTTP endpoints or new users-permissions role grants (the reminder is
  cron-driven; BACK/VACATION reuse the already-public `POST /sms` webhook, so no
  permission seeding is needed).
- Changing the cron schedule or timezone.
- SMS opt-out/STOP handling (unchanged).

## Risks & alternatives considered
- **Toggle → split behavior change.** Splitting `applyVacation` changes what
  BACK does for a non-paused user (was: pause; now: no-op "already active"). This
  is the intended fix but is a semantic change; the existing unit test
  (`tests/user/index.js:86`) asserts `applyVacation` pauses a non-paused user and
  must be repointed at `startVacation` (or `applyVacation` kept as a start alias).
- **Counter reset placement.** The counter must reset on *both* start and end,
  otherwise a user who vacations, returns, and re-vacations would inherit a stale
  count and get the escalation line on their first new reminder. Reset lives in
  both `startVacation` and `endVacation`.
- **Cadence double-send / idempotency.** The `daysSinceLastCheck >= 7` guard plus
  advancing `last_vacation_check_sent` only after a successful send makes the run
  safe to fire more than weekly. The counter advances in lockstep with
  `last_vacation_check_sent`, so escalation timing cannot drift.
- **Cron vs. service divergence (the real trap here).** Today the live behavior
  is in the cron, and the service is dead. If the implementer enhances only the
  service and forgets to rewire the cron to call it, nothing changes in
  production. The design mandates the cron become a one-line delegate.
- **`documentId` vs `id`.** All writes target internal `id` via `strapi.db.query`,
  consistent with the file; no public `documentId` is exposed by this feature.
- **Lifecycles.** No lifecycle is added; vacation state changes stay in explicit
  service methods, matching this repo's post-v5-migration preference.

## Acceptance criteria
AC1. A paused user whose `paused_at` is ≥ 15 days ago and whose
`last_vacation_check_sent` is null receives exactly one reminder SMS when
`sendVacationCheckIns` runs; afterward their `last_vacation_check_sent` equals the
run time and `vacation_reminder_count` = 1.

AC2. A paused user whose `paused_at` is 10 days ago receives no SMS, and their
`vacation_reminder_count` and `last_vacation_check_sent` are unchanged.

AC3. A paused user with `last_vacation_check_sent` 3 days ago (still paused >14
days) receives no SMS on this run; count and timestamp unchanged.

AC4. A paused user with `last_vacation_check_sent` 7+ days ago and `paused_at`
>14 days ago receives a reminder; `vacation_reminder_count` increments by exactly
1.

AC5. The **first** reminder body (sent when prior `vacation_reminder_count` = 0)
does NOT contain the string "feigning vacation".

AC6. The **second and every subsequent** reminder (sent when prior
`vacation_reminder_count` ≥ 1) contains the exact escalation sentence:
"If you no longer want the responsibility of being in this task please let a
Garden Manager know so you can be quickly removed, instead of feigning vacation :)".

AC7. Every reminder body names the user by `firstName` and lists the titles of
all gardens on the user's `gardens` relation; a user with two gardens sees both
titles in the message.

AC8. Running `sendVacationCheckIns` twice back-to-back sends the SMS only once
(second run is a no-op for that user because `last_vacation_check_sent` is now
"now"), proving idempotency under more-frequent-than-weekly firing.

AC9. `config/cron-tasks.js` `weeklyVacationCheckIn` invokes
`strapi.service('api::message.vacation-checkin').sendVacationCheckIns()` and
contains no inline reminder logic.

AC10. A paused user who texts `BACK` (via `POST /sms`) is left with
`paused=false`, `paused_at=null`, `vacation_reminder_count=0`,
`last_vacation_check_sent=null`, and receives the "Welcome back" reply.

AC11. A non-paused user who texts `BACK` is NOT paused (regression guard for the
old toggle); `paused` stays false and they get an "already active" reply.

AC12. A non-paused user who texts `VACATION` is paused with `paused_at=now`,
`vacation_reminder_count=0`, and gets the "now paused" reply. A user re-entering
vacation after a prior completed vacation starts again at count 0 (so their next
reminder has no escalation line).

AC13. If `sendSms` throws for one user, other users in the same run still get
their reminders, and the failing user's `last_vacation_check_sent` and
`vacation_reminder_count` are NOT advanced (they retry next run).

## Verification plan
All ACs are backend-verifiable; no UI and no contract-level checks (no new
endpoint). SMS is asserted by spying, since `sendSms` is a no-op under
`ENVIRONMENT=test`.

- AC1–AC8, AC13: service-level tests against a booted Strapi (pattern:
  `tests/user/index.js`, `tests/helpers/strapi.js`). Seed users with controlled
  `paused_at` / `last_vacation_check_sent` / `vacation_reminder_count` via
  `strapi.db.query(...).create/update`, `jest.spyOn` the
  `api::sms.sms` service `sendSms`, call
  `strapi.service('api::message.vacation-checkin').sendVacationCheckIns()`, then
  assert (a) spy call count and per-call body substrings, and (b) resulting user
  rows. Clock control: rather than mocking `Date`, set `paused_at` /
  `last_vacation_check_sent` to explicit past dates relative to `new Date()` so
  `differenceInDays` yields the boundary you want (e.g. 15, 10, 3, 7 days ago).
  Cover the boundary at exactly 14 days (excluded, `> 14`) and 15 days (included).
- AC5/AC6/AC7 assert on the exact body string passed to the `sendSms` spy.
- AC9: static/assertion check that the cron delegates — a unit test can require
  `config/cron-tasks.js`, or verify by inspection plus one integration run.
- AC10–AC12: supertest `POST /sms` with a Twilio-style form body
  (`From`, `Body`) as in the existing SMS tests, or call
  `SmsHelper.startVacation` / `endVacation` directly (pattern:
  `tests/user/index.js:88`) and assert the reply body and the resulting user row.
  Update the existing pause test to target `startVacation` (or the retained
  `applyVacation` start-alias).
- AC13: spy on `sendSms` with `mockImplementationOnce(() => { throw ... })` for
  the first user and resolve for the rest; assert the survivors were sent and the
  thrower's row is unchanged.

Files an implementer will touch:
- `src/extensions/users-permissions/content-types/user/schema.json` (add
  `vacation_reminder_count`)
- `src/api/message/services/vacation-checkin.js` (fat logic: gardens list,
  counter, escalation, post-success updates)
- `config/cron-tasks.js` (make `weeklyVacationCheckIn` a one-line delegate)
- `src/api/message/controllers/SmsHelper.js` (split `applyVacation` into
  `startVacation` / `endVacation`, reset counter on both)
- `src/api/message/controllers/message.js` (route `vacation`→start, `back`→end)
- `tests/user/index.js` (+ a new vacation-reminder test file)

---

## Amendment 1: Suppress SMS campaigns to vacationing users
Added 2026-07-25 (approved scope extension). Same conventions as above:
idempotent, snake_case `strapi.db.query` fields, no new endpoints/permissions.

### Current state
SMS campaigns are blasted by `sendGroupMsg(volGroup, copy, gardenObj, params)`
(`src/api/sms-campaign/services/sms-campaign.js:347`). It loops `volGroup`, sends
each recipient via the module-level Twilio client (`client.messages.create`,
line 356 — NOT through `api::sms.sms`), collects successfully-sent numbers into
`sentInfo`, and then persists a campaign row with `sent: volGroup` (line 374) —
i.e. it records the *intended* audience, which is what poll tallying and reminders
key off later. The recipient list is built by the sole live caller,
`sms-campaign` controller `groupSms` (`controllers/sms-campaign.js:101`), from
`user-garden-interest.getUsersOfInterest` (`services/user-garden-interest.js:11`).
Both branches of that builder return full user objects (either `garden.volunteers`
or the `user` relation of user-garden-interest), so `paused` is present on every
member of `volGroup` today. There is no vacation filtering anywhere in this path.

Poll reminders re-text non-voters a day before close via `sendPollReminders`
(`sms-campaign.js:191`). It reads `campaign.sent` (populated as full user objects,
line 203), filters to non-voters with a phone number (line 215), and sends each
through `strapi.service('api::sms.sms').handleSms`. It does not consider `paused`,
so a user who was active at send time but has since gone on vacation still gets a
reminder.

### Design decision: filter centrally in `sendGroupMsg`, and again in `sendPollReminders`
Put the exclusion at the single choke point, not at call sites. At the top of
`sendGroupMsg`, before the send loop and before persisting the campaign, derive
`const activeGroup = (volGroup || []).filter(v => !v.paused)` and use `activeGroup`
for BOTH the Twilio send loop AND the `sent:` relation on the created campaign.
This is deliberate: excluding paused users from `sent` (not just from the send
loop) keeps the recorded audience equal to who was actually messaged, so
downstream vote tallies and the day-before reminder stay consistent and no paused
user is ever treated as a non-voter who "should" be nudged.

Rationale for central over per-call-site: there is one live caller today, but the
`sent` relation and the send loop both live inside `sendGroupMsg` and must agree.
Filtering at the call site would fix the send but still record paused users in
`sent`, reintroducing the reminder problem. One filter, one place.

Because a user can start vacation *after* a campaign is sent but *before* the
24h-out reminder fires, `sendPollReminders` must independently skip currently
paused users: extend the non-voter filter (`sms-campaign.js:215`) to
`(campaign.sent || []).filter(u => u.phoneNumber && !votedIds.has(u.id) && !u.paused)`.
`campaign.sent` is already populated as full user objects, so `paused` is
available with no extra populate. This is a live re-read of vacation state at
reminder time, which is the correct semantics.

Dependency to guard: the filter relies on `paused` being populated on the
recipient objects. Both current builders return full user records, so this holds.
If a future call path selects/populates a narrowed user shape into `volGroup`, it
MUST include `paused`, or the filter silently passes everyone through — note this
in the `sendGroupMsg` doc comment.

### Explicitly out of scope (flagged for the user)
Two sibling group-blast paths share the same `sent: volGroup` pattern but are NOT
"SMS campaigns" and are left unchanged by this amendment:
`volunteer-day.sendGroupMsg` (`src/api/volunteer-day/services/volunteer-day.js:39`,
volunteer-day event notifications) and the recurring-task schedule blast in
`weekly-schedule` (`services/weekly-schedule.js:87`). If the intent is "a paused
user should receive no group blasts at all," these want the same treatment in a
follow-up. Surfacing rather than silently expanding scope.

### Testing note (Twilio client, not sendSms)
Unlike the reminder path, `sendGroupMsg` calls the module-level Twilio `client`
directly (`const client = require('twilio')(...)`, `sms-campaign.js:21`) and has
no `ENVIRONMENT=test` no-op guard, so the spy-on-`sendSms` convention does not
apply there. Verify exclusion primarily through observable state that needs no
network: (a) the returned `sentInfo` array, and (b) the `sent` relation on the
persisted campaign row. To keep the send loop from making a real Twilio call in
tests, `jest.spyOn` the twilio client's `messages.create` (mock-resolve it) — this
both prevents network I/O and lets you assert the paused user's `phoneNumber` was
never passed as a `to`. Note that on a real send failure `sendGroupMsg` calls
`unsubscribeUser`, so an unmocked client in tests would cause side effects; the
mock is required. (Optional larger refactor the implementer may propose, not
required here: route `sendGroupMsg`'s send through `api::sms.sms.sendSms` so it
inherits the test no-op and matches the rest of the codebase.) `sendPollReminders`
goes through `handleSms`→`sendSms`, so it uses the normal spy-on-`sendSms`
convention.

### Acceptance criteria (continuing)
AC14. `sendGroupMsg` called with a `volGroup` containing one paused and one
non-paused user (both with valid phone numbers) sends only to the non-paused user:
the Twilio `messages.create` spy is never called with the paused user's phone
number, and the returned `sentInfo` contains only the non-paused number.

AC15. After that same call, the persisted campaign's `sent` relation contains only
the non-paused user — the paused user is excluded from the recorded audience, not
merely skipped in the send loop.

AC16. `sendGroupMsg` with a `volGroup` where every member is paused sends zero
messages (spy never called), returns an empty `sentInfo`, and still creates the
campaign row with an empty `sent` relation (no crash on empty/all-filtered group).

AC17. The exclusion holds regardless of interest targeting: driving the
`groupSms` controller path with `interest: 'Everyone'` (the `garden.volunteers`
branch) and with a tagged interest (the `getUsersOfInterest` filtered branch) both
exclude a paused volunteer from the send and from `sent`.

AC18. `sendPollReminders`: for a campaign whose `sent` includes a non-voter who is
currently `paused`, that user receives no reminder (their `sendSms` is not
invoked), while a non-voting non-paused recipient does receive one; the campaign's
`reminder_sent` is still set true afterward.

AC19. A non-paused, non-voting recipient still receives the poll reminder — the
filter narrows only paused users (regression guard that reminders still fire).

### Verification plan (continuing)
- AC14–AC17: service test booting Strapi. Create a garden with two volunteers
  (one `paused=true`), `jest.spyOn` the twilio client `messages.create` to
  resolve, call `strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg(...)`,
  then assert (a) the spy's `to` args exclude the paused number, (b) the returned
  `sentInfo`, and (c) re-query the created campaign with `populate: ['sent']` and
  assert its membership. AC16 uses an all-paused group. AC17 exercises both
  `getUsersOfInterest` branches via the `groupSms` controller
  (`controllers/sms-campaign.js:87`).
- AC18/AC19: seed a poll campaign with `closes_at` inside the 23–25h window,
  `send_reminder=true`, `reminder_sent` null, and a `sent` list mixing a paused
  non-voter, an active non-voter, and a voter; `jest.spyOn` `api::sms.sms`
  `sendSms`, call `sendPollReminders()`, and assert exactly the active non-voter
  was texted and `reminder_sent` flipped to true.
- All AC14–AC19 are backend-verifiable; none are UI- or contract-level.

Additional files an implementer will touch:
- `src/api/sms-campaign/services/sms-campaign.js` (`sendGroupMsg` central
  `activeGroup` filter + doc comment; `sendPollReminders` non-voter filter adds
  `&& !u.paused`)
- new/extended test file under `tests/` for campaign vacation-exclusion

---

## Amendment 2 — vacation must exclude people from the recurring schedule itself
Requested by Cameron, 2026-07-26: "weekly schedule should definitely account for
the paused users, that's our regular scheduling of recurring tasks that vacation
was built for."

### What was already correct
`weeklyScheduleHelper.getAssignees` (`src/api/weekly-schedule/services/helper.js:12`)
already filters `!v.paused` when drawing the Weekly Shuffle roster, and
`recurring-task.getRecurringTaskGarden` fully populates
`schedulers.backup_volunteers`, so `paused` is present for that filter to read.

### Gaps found and closed
1. **Daily Primary had no vacation check at all.** `Helper.getScheduledVolunteer`
   (`config/helpers/cron-helper.js`) took `scheduledDay.volunteer` verbatim, so a
   paused primary was still assigned the task and texted. Now: if the primary is
   paused, the day is handed to the first unpaused member of that scheduler's
   `backup_volunteers`; if every backup is also paused the day is left unassigned
   (`undefined`), which is the pre-existing "nobody scheduled today" path.
   Required adding `backup_volunteers: true` to that query's populate.
2. **Weekly Shuffle roster went stale mid-week.** The roster is drawn once a week,
   so a volunteer starting vacation on e.g. Wednesday still held their day. A
   final `paused` re-check on the resolved user now covers both scheduler types.
3. **All-paused day crashed the weekly blast.** `chooseVolunteer` returns
   `undefined` for an exhausted pool, and `sendWeeklyMsg`
   (`src/api/weekly-schedule/services/weekly-schedule.js`) dereferenced
   `a.assignee.firstName` unguarded. Unassigned days now render as
   `"<day>: Unassigned"` and are skipped when sending / recording `sent`.

### Acceptance criteria
AC20. Daily Primary with an unpaused primary assigns that primary.
AC21. Daily Primary with a paused primary assigns the first unpaused backup.
AC22. Daily Primary with primary and all backups paused assigns nobody.
AC23. Weekly Shuffle whose rostered assignee has since paused assigns nobody.
AC24. Weekly Shuffle with an active rostered assignee still assigns them.

Verified by `tests/tasks/schedule.js` → `describe('getScheduledVolunteer respects vacation')`.

### Deliberately still out of scope
`volunteer-day` group messaging. Volunteer days are one-off events rather than
recurring schedule assignments, so being on vacation arguably should not suppress
an invitation. Flagged for the user rather than assumed.
