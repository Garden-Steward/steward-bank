# Tasks for Vacation Reminders (from design.md)

All tasks are backend `[BE]` in the steward-bank repo (Strapi v5, CommonJS,
jest). No frontend, no new HTTP endpoint, no users-permissions grant (BACK /
VACATION reuse the already-public `POST /sms` webhook; the reminder is
cron-driven).

Test architecture note (applies to Task 2 and Task 3): the service/integration
tests in this repo do NOT boot Strapi per file. `tests/app.test.js` boots one
shared Strapi instance in `beforeAll` and then `require`s the individual
test modules (e.g. `require('./user')`). The `strapi` global is available
inside those required modules. Standalone `*.test.js` files (e.g.
`tests/sms-campaign.test.js`) are pure unit tests with no Strapi boot — do NOT
use that style for these tasks, because you need a booted DB.

Therefore the runnable command for the behavioral tests is:

    NODE_ENV=test npx jest tests/app.test.js

`ENVIRONMENT=test` comes from the repo `.env` (already set), which makes
`api::sms.sms` `sendSms` a no-op that never calls Twilio. `NODE_ENV=test`
selects `config/env/test/database.js` (sqlite at `.tmp/test.db`, wiped each
run). You can narrow to your cases with `-t "<describe or it name>"`.

Pre-existing quirk you must NOT try to "fix": the user schema attribute is
`phoneNumber` (camelCase), but `SmsHelper.getUser` and the vacation-checkin
service query/select `phone_number` (snake_case). This is the established,
working pattern for the whole inbound-SMS system; the design explicitly forbids
renaming it. Seed test users with `phoneNumber`; do not assert on the phone
argument to `sendSms` (the ACs assert on message body + user rows, not phone).

---

## Task 1: [BE] Add `vacation_reminder_count` to the user content type
Depends on: —
Parallel-safe with: — (Task 2 and Task 3 both read/write this field, so land
this first; it is a ~30-second change)
Covers: Schema change (design "Schema change" section)

### Files
- `src/extensions/users-permissions/content-types/user/schema.json` — add one attribute

### Current state
The vacation fields already live here (lines 65-76):

```json
    "paused": {
      "type": "boolean",
      "default": false
    },
    "paused_at": {
      "type": "datetime",
      "description": "Timestamp when user marked themselves as on vacation"
    },
    "last_vacation_check_sent": {
      "type": "datetime",
      "description": "Timestamp of last weekly vacation check-in message sent"
    },
```

### Instructions
Add a new attribute alongside the ones above (place it right after
`last_vacation_check_sent`, before `status`). Keep valid JSON (comma placement):

```json
    "vacation_reminder_count": {
      "type": "integer",
      "default": 0,
      "description": "Number of vacation reminders sent during the current vacation; reset to 0 when a vacation starts or ends"
    },
```

Do not add a data migration. Existing paused users read as `0` (their next
reminder is treated as the first — safe, per design "No data migration is
required").

### Done when
- The file is valid JSON: `node -e "require('./src/extensions/users-permissions/content-types/user/schema.json')"` exits 0
- The `attributes` object contains `vacation_reminder_count` with
  `type: "integer"` and `default: 0`

---

## Task 2: [BE] Split `applyVacation` into deterministic `startVacation` / `endVacation` and rewire the controller
Depends on: Task 1 (writes `vacation_reminder_count`; without the attribute the
field is silently dropped)
Parallel-safe with: Task 3 (disjoint files)
Covers: AC10, AC11, AC12; design "Vacation lifecycle: split the toggle"

### Files
- `src/api/message/controllers/SmsHelper.js` — replace the toggling
  `applyVacation` with `startVacation` + `endVacation`; keep `applyVacation` as
  an alias of `startVacation`
- `src/api/message/controllers/message.js` — route `vacation`→`startVacation`,
  `back`→`endVacation` (split the currently-shared case)
- `tests/user/index.js` — repoint the existing pause test at `startVacation`;
  add lifecycle tests for AC10-AC12

### Current state
`SmsHelper.applyVacation` today TOGGLES `paused` (this is the latent bug: a
non-paused user texting BACK gets paused). Lines 660-690:

```js
SmsHelper.applyVacation = async(user) => {
  try {
    const currentState = user.paused; // Assuming 'paused' is a boolean attribute of user
    const updateData = {
      paused: !currentState // Toggle the paused state
    };
    if (!currentState) {
      updateData.paused_at = new Date();
    } else {
      updateData.paused_at = null;
    }
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: user.id },
      data: updateData
    });
    if (currentState) {
      return { body: `Welcome back ${user.firstName}! Your account is now active again.`, type: 'reply' };
    } else {
      return { body: `Hi ${user.firstName}, your account is now paused. Enjoy your vacation!\n\nJust let us know when you're BACK from VACATION (either will activate you again to tasks)`, type: 'reply' };
    }
  } catch (err) {
    console.error('Error updating user account: ', err);
    return { body: 'Sorry, there was an issue updating your account.', type: 'reply' };
  }
};
```

Controller (`message.js` lines 163-166) currently shares one case:

```js
      case 'vacation':
      case 'back':
        smsInfo = await SmsHelper.applyVacation(user);
        break;
```

Existing unit test (`tests/user/index.js` lines 85-92):

```js
describe('User SMS tests', () => {
  it('should pause user account', async () => {
    strapi.db.query("plugin::users-permissions.user").update = jest.fn().mockResolvedValue({firstName: "Henry", paused: true});
    SmsHelper.applyVacation({...mockUserData}).then(data => {
      expect(data.body).toContain("Hi Henry, your account is now paused. Enjoy your vacation!");
    });
  });
});
```

`mockUserData` (top of file) has `paused: false`, `firstName: "Henry"`,
`phoneNumber: '+13038833330'`.

Restoration is automatic: `SmsHelper.getBackupVolunteers` (line 705) and
`passToNextVolunteer` (line 589) already filter on `!paused`, so clearing
`paused` fully restores the user. Do NOT touch scheduling code.

### Instructions
In `SmsHelper.js`, **delete** the toggling body of `applyVacation` and define
two new deterministic methods. Both are idempotent and reset the reminder
counter (`vacation_reminder_count`) and `last_vacation_check_sent`. Keep
`console.error` out of new code — use `strapi.log.error`.

```js
SmsHelper.startVacation = async (user) => {
  try {
    if (user.paused) {
      // already on vacation — no DB write
      return { body: `You're already on vacation, ${user.firstName}! Reply BACK once you're back and we'll add you to your schedules again.`, type: 'reply' };
    }
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: user.id },
      data: {
        paused: true,
        paused_at: new Date(),
        vacation_reminder_count: 0,
        last_vacation_check_sent: null
      }
    });
    return { body: `Hi ${user.firstName}, your account is now paused. Enjoy your vacation!\n\nJust let us know when you're BACK from VACATION (either will activate you again to tasks)`, type: 'reply' };
  } catch (err) {
    strapi.log.error('Error starting vacation: ', err);
    return { body: 'Sorry, there was an issue updating your account.', type: 'reply' };
  }
};

SmsHelper.endVacation = async (user) => {
  try {
    if (!user.paused) {
      // not paused — no DB write; regression guard against the old toggle
      return { body: `Welcome back ${user.firstName}! You're already active on your schedules.`, type: 'reply' };
    }
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: user.id },
      data: {
        paused: false,
        paused_at: null,
        vacation_reminder_count: 0,
        last_vacation_check_sent: null
      }
    });
    return { body: `Welcome back ${user.firstName}! Your account is now active again.`, type: 'reply' };
  } catch (err) {
    strapi.log.error('Error ending vacation: ', err);
    return { body: 'Sorry, there was an issue updating your account.', type: 'reply' };
  }
};

// Preserve the old entry point without leaving a live toggle: alias to start.
SmsHelper.applyVacation = SmsHelper.startVacation;
```

Place the alias line AFTER both definitions. Do NOT leave the old toggle body
anywhere in the file.

In `message.js`, split the shared case so BACK deterministically ends vacation:

```js
      case 'vacation':
        smsInfo = await SmsHelper.startVacation(user);
        break;

      case 'back':
        smsInfo = await SmsHelper.endVacation(user);
        break;
```

In `tests/user/index.js`, update the `User SMS tests` describe block. Replace
the single toggle test with proper `await`ed assertions and add AC10-AC12
coverage. Because these run inside the shared-boot suite, seed real users with
`strapi.db.query('plugin::users-permissions.user').create(...)` and assert the
resulting rows — do NOT stub `.update` with `jest.fn()` (the old test's stubbed,
non-awaited `.then` was a weak test; do not copy that pattern). Use unique
emails/usernames and delete them in `afterAll`/`afterEach` to avoid leaking into
other suites. Concretely add tests that:

- AC12: create a user with `paused:false`, call `SmsHelper.startVacation(user)`;
  assert reply contains `"your account is now paused"`; re-fetch the row and
  assert `paused===true`, `paused_at` is set, `vacation_reminder_count===0`.
- AC10: create a user with `paused:true`, `paused_at` non-null,
  `vacation_reminder_count: 3`, `last_vacation_check_sent` non-null; call
  `SmsHelper.endVacation(user)`; assert reply contains `"Welcome back"`;
  re-fetch and assert `paused===false`, `paused_at===null`,
  `vacation_reminder_count===0`, `last_vacation_check_sent===null`.
- AC11 (regression guard): create a user with `paused:false`; call
  `SmsHelper.endVacation(user)`; assert reply contains `"already active"`;
  re-fetch and assert `paused===false` (was NOT paused by the call).

Note that `SmsHelper.startVacation`/`endVacation` read `user.paused` off the
object you pass in, so pass the freshly-created row (which includes `paused`).

### Done when
- `node --check src/api/message/controllers/SmsHelper.js` passes
- `node --check src/api/message/controllers/message.js` passes
- `node --check tests/user/index.js` passes
- `NODE_ENV=test npx jest tests/app.test.js -t "User SMS"` passes (AC10-AC12)
- No occurrence of `!currentState` / the toggle remains in `SmsHelper.js`
  (`grep -n "Toggle the paused state" src/api/message/controllers/SmsHelper.js`
  returns nothing)

---

## Task 3: [BE] Move all reminder logic into `sendVacationCheckIns` (gardens list + counter + escalation) and make the cron a one-line delegate
Depends on: Task 1 (reads/writes `vacation_reminder_count`)
Parallel-safe with: Task 2 (disjoint files)
Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC13; design "Reminder
send: consolidate into the service, then enhance", "Error behavior", and the
"Cron vs. service divergence (the real trap here)" risk

### Files
- `src/api/message/services/vacation-checkin.js` — rewrite the fat logic
- `config/cron-tasks.js` — replace the inlined `weeklyVacationCheckIn` body with
  a single delegating call (THE TRAP: if you skip this, production behavior does
  not change)
- `tests/user/vacation-reminders.js` — NEW test module (service tests + cron
  delegation check)
- `tests/app.test.js` — add `require('./user/vacation-reminders');`

### Current state
`src/api/message/services/vacation-checkin.js` today is the "dead" parallel copy
of the cron. Its gate is correct but it does not list gardens, has no counter,
and its copy is off-tone:

```js
const { differenceInDays } = require('date-fns');

module.exports = {
  sendVacationCheckIns: async () => {
    try {
      const pausedUsers = await strapi.db.query("plugin::users-permissions.user").findMany({
        where: { paused: true, paused_at: { $ne: null } },
        select: ['id', 'firstName', 'phone_number', 'paused_at', 'last_vacation_check_sent']
      });
      const now = new Date();
      let messagesCount = 0;
      for (const user of pausedUsers) {
        const daysPaused = differenceInDays(now, new Date(user.paused_at));
        const lastCheckSent = user.last_vacation_check_sent ? new Date(user.last_vacation_check_sent) : null;
        const daysSinceLastCheck = lastCheckSent ? differenceInDays(now, lastCheckSent) : null;
        if (daysPaused > 14 && (!lastCheckSent || daysSinceLastCheck >= 7)) {
          const smsBody = `Hi ${user.firstName}! Just checking in...`; // off-tone, no gardens, no escalation
          try {
            await strapi.service('api::sms.sms').sendSms(user.phone_number, smsBody);
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: user.id },
              data: { last_vacation_check_sent: now }
            });
            messagesCount++;
          } catch (err) { /* logged */ }
        }
      }
      return { success: true, pausedUsersTotal: pausedUsers.length, messagesCheckedIn: messagesCount };
    } catch (err) { throw err; }
  }
};
```

`config/cron-tasks.js` `weeklyVacationCheckIn` (lines 124-178) currently INLINES
a full duplicate of the above logic. The service is dead; the cron is live. This
is the divergence the design calls out.

`SmsHelper.getUser` (line 162) shows the working relation-populate style used
elsewhere: `populate: { gardens: true, activeGarden: true }`. Garden titles come
from the `title` attribute (garden schema, required). `api::sms.sms` `sendSms`
is a no-op under `ENVIRONMENT=test`.

### Instructions

**1. Rewrite `src/api/message/services/vacation-checkin.js`.** Keep the plain
`module.exports = { sendVacationCheckIns: async () => { ... } }` shape (it is
registered as `api::message.vacation-checkin`; do NOT convert to a
`createCoreService` factory — that would change the uid resolution and this file
has no core model). Keep `'use strict';` and the `differenceInDays` import.
Use `strapi.log.*` for logging (this is a rewrite; do not add new `console.log`).

Changes vs. current:

- Add `vacation_reminder_count` to `select`, and populate garden titles. Keep
  the existing snake-case select fields verbatim — do NOT rename or switch to
  the Document Service:

  ```js
  const pausedUsers = await strapi.db.query("plugin::users-permissions.user").findMany({
    where: { paused: true, paused_at: { $ne: null } },
    select: ['id', 'firstName', 'phone_number', 'paused_at', 'last_vacation_check_sent', 'vacation_reminder_count'],
    populate: { gardens: { select: ['title'] } }
  });
  ```

- Keep the gate exactly: `daysPaused > 14 && (!lastCheckSent || daysSinceLastCheck >= 7)`.

- Inside the gate, compute the new count and build the body:

  ```js
  const newCount = (user.vacation_reminder_count || 0) + 1;
  const gardenTitles = (user.gardens || []).map(g => g.title).filter(Boolean);
  const gardenList = gardenTitles.length ? ` for ${gardenTitles.join(', ')}` : '';
  let smsBody = `Hi ${user.firstName}! You're still on vacation and paused from watering and other recurring schedules${gardenList}. Reply BACK once you're back and we'll add you to your schedules again.`;
  if (newCount >= 2) {
    smsBody += `\n\nIf you no longer want the responsibility of being in this task please let a Garden Manager know so you can be quickly removed, instead of feigning vacation :)`;
  }
  ```

  The escalation sentence must be byte-for-byte the string above (AC6 asserts the
  exact substring `"instead of feigning vacation :)"` and the full sentence).

- Send, THEN update both fields on success only (so a failed send does not
  advance the counter or timestamp — AC13). Keep the per-user try/catch so one
  bad number does not block others:

  ```js
  try {
    await strapi.service('api::sms.sms').sendSms(user.phone_number, smsBody);
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: user.id },
      data: { last_vacation_check_sent: now, vacation_reminder_count: newCount }
    });
    messagesCount++;
  } catch (err) {
    strapi.log.error(`[VacationCheckIn] Error sending SMS for user ${user.id}: `, err);
  }
  ```

- Keep returning `{ success: true, pausedUsersTotal, messagesCheckedIn }`.
- The `message`-record audit log (design step 6) is OUT of scope — do not add it.

**2. Rewrite the cron in `config/cron-tasks.js`.** Replace the entire inlined
body of `weeklyVacationCheckIn.task` with a one-line delegate. Do NOT change
`options` (`rule: '0 9 * * 0'`, `tz: 'America/Los_Angeles'`). Remove the inline
`require('date-fns')`, the `findMany`, the loop, and the inline `smsBody`:

```js
  weeklyVacationCheckIn: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering weeklyVacationCheckIn cron');
      try {
        await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();
      } catch (err) {
        strapi.log.error('ERR weeklyVacationCheckIn: ', err);
      }
    },
    options: {
      rule: '0 9 * * 0',
      tz: 'America/Los_Angeles',
    },
  },
```

After this, `grep -n "findMany" config/cron-tasks.js` must not match inside
`weeklyVacationCheckIn` (there is no other findMany in that file).

**3. Create `tests/user/vacation-reminders.js`** (a required module, NOT a
`.test.js` — it runs inside the shared boot). Model structure on
`tests/user/index.js` and use the `strapi` global. Spy pattern for `sendSms`
follows the established in-repo style (direct assignment on the singleton, as in
`tests/tasks/poll.js`):

```js
const cronTasks = require('../../config/cron-tasks');
const { subDays } = require('date-fns');

const userQuery = () => strapi.db.query('plugin::users-permissions.user');
```

Helpers to write:
- A `seedPausedUser({ pausedDaysAgo, lastCheckDaysAgo, count, gardenIds })` that
  creates a user with unique `username`/`email` (e.g. suffix with `Date.now()`
  + a counter), `provider: 'local'`, `phoneNumber: '+1303880' + nnnn`,
  `paused: true`, `paused_at: subDays(new Date(), pausedDaysAgo)`,
  `last_vacation_check_sent: lastCheckDaysAgo == null ? null : subDays(new Date(), lastCheckDaysAgo)`,
  `vacation_reminder_count: count`, and `gardens: gardenIds`.
- Seed one or two gardens via
  `strapi.db.query('api::garden.garden').create({ data: { title, sms_slug, publishedAt: new Date() } })`
  with unique `title` and unique `sms_slug` (`sms_slug` is required & unique).
- `beforeEach`: `strapi.service('api::sms.sms').sendSms = jest.fn().mockResolvedValue(undefined);`
- `afterEach`/`afterAll`: delete the users and gardens you created (filter by the
  unique prefix you used) so they do not leak into other suites.

Clock control: do NOT mock `Date`. Set `paused_at` / `last_vacation_check_sent`
to explicit past dates with `subDays` so `differenceInDays(now, date)` yields the
boundary (15, 10, 3, 7). Cover the `> 14` boundary explicitly: 14 days is
EXCLUDED, 15 days INCLUDED.

Assertions read back rows with
`userQuery().findOne({ where: { id }, select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused'] })`.
Read the body sent with
`strapi.service('api::sms.sms').sendSms.mock.calls[i][1]`.

Tests to write (call
`await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();`):

- AC1: user paused 15 days ago, `last_vacation_check_sent: null`, count 0 →
  exactly one send; body sent to this user; row now has
  `vacation_reminder_count === 1` and `last_vacation_check_sent` ~ now (assert
  it is non-null / within a few seconds of `new Date()`).
- AC2: user paused 10 days ago → its phone/body NOT among the spy calls; row
  `vacation_reminder_count` and `last_vacation_check_sent` unchanged. (Isolate
  by seeding only this user in the test, or by checking the spy did not receive
  this user's body substring `Hi <firstName>!`.)
- AC3: paused 20 days ago but `last_vacation_check_sent` 3 days ago → no send for
  this user; count + timestamp unchanged.
- AC4: paused 20 days ago, `last_vacation_check_sent` 7 days ago, count 1 → one
  send; row count becomes 2 (increment by exactly 1).
- AC5: prior count 0 → the body for that user does NOT contain
  `"feigning vacation"`.
- AC6: prior count 1 → the body contains the exact sentence
  `"If you no longer want the responsibility of being in this task please let a Garden Manager know so you can be quickly removed, instead of feigning vacation :)"`.
- AC7: user with two gardens (e.g. titles `"Alpha Garden"` and `"Beta Garden"`),
  paused 15 days ago → body contains both `"Alpha Garden"` and `"Beta Garden"`
  and the user's `firstName`.
- AC8 (idempotency): seed one eligible user; call `sendVacationCheckIns()` twice;
  assert `sendSms` was called exactly once total for that user (second run is a
  no-op because `last_vacation_check_sent` is now "now").
- AC13 (send failure isolation): seed two eligible users; set
  `strapi.service('api::sms.sms').sendSms = jest.fn().mockImplementationOnce(() => { throw new Error('twilio down'); }).mockResolvedValue(undefined);`
  call once; assert the second user WAS sent and its row advanced, while the
  first user's row is UNCHANGED (`vacation_reminder_count` and
  `last_vacation_check_sent` equal their seeded values). Note ordering is by the
  DB's default; to make "first" deterministic, capture which user id each
  `sendSms` call targeted, or seed the thrower and assert specifically that a
  user whose send threw is unchanged and at least one other advanced.
- AC9 (cron delegation): stub the service and invoke the cron task —
  ```js
  const svc = strapi.service('api::message.vacation-checkin');
  const spy = jest.spyOn(svc, 'sendVacationCheckIns').mockResolvedValue({});
  await cronTasks.weeklyVacationCheckIn.task({ strapi });
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
  ```
  This proves the cron delegates rather than running inline logic.

Finally, add the require to `tests/app.test.js` after the other user requires:

```js
require('./user/vacation-reminders');
```

### Done when
- `node --check src/api/message/services/vacation-checkin.js` passes
- `node --check config/cron-tasks.js` passes
- `node --check tests/user/vacation-reminders.js` passes
- `NODE_ENV=test npx jest tests/app.test.js -t "vacation"` passes (AC1-AC9, AC13)
- `config/cron-tasks.js` `weeklyVacationCheckIn.task` contains no inline reminder
  logic — only the `strapi.service('api::message.vacation-checkin').sendVacationCheckIns()`
  call (AC9); `grep -n "differenceInDays\|findMany\|smsBody" config/cron-tasks.js`
  returns nothing

---

## Task 4: [BE] Exclude paused (on-vacation) users from SMS campaigns and poll reminders
Depends on: — (reads the pre-existing `paused` field only; does NOT need Task 1's
`vacation_reminder_count`)
Parallel-safe with: Task 1, Task 2, Task 3 (disjoint source files). One caveat:
this task and Task 3 both append a `require(...)` line to `tests/app.test.js`.
That is a one-line, same-region append — resolve any trivial merge by keeping
BOTH require lines. No other overlap.
Covers: AC14, AC15, AC16, AC17, AC18, AC19 (from design.md Amendment 1)

### Files
- `src/api/sms-campaign/services/sms-campaign.js` — `sendGroupMsg` central
  `activeGroup` filter (used for BOTH the send loop and the persisted `sent`
  relation) + a doc comment; `sendPollReminders` non-voter filter gains
  `&& !u.paused`
- `tests/sms-campaign-vacation.js` — NEW required test module (booted-DB service
  tests for AC14-AC19)
- `tests/app.test.js` — add `require('./sms-campaign-vacation');`

### Current state
`sendGroupMsg` (sms-campaign.js:347) loops `volGroup`, sends each via the
module-level Twilio `client` (line 356 — NOT through `api::sms.sms`), collects
successful numbers into `sentInfo`, then persists a campaign row with
`sent: volGroup` (line 374). No vacation filtering exists. Current body:

```js
  sendGroupMsg: async (volGroup, copy, gardenObj, params) => {
    console.log("sendGroupMsg on SMS Campaign: \n", copy);
    let sentInfo = [];
    for (const volunteer of volGroup) {
      if (!volunteer.phoneNumber) { continue; }
      try {
        await client.messages
          .create({ body: copy, from: twilioNum, to: volunteer.phoneNumber });
        sentInfo.push(volunteer.phoneNumber);
      } catch (err) {
        await strapi.service('api::garden.garden').unsubscribeUser(volunteer);
        console.log("send error:", err);
        continue;
      }
    }
    console.log('done sending');
    try {
      await strapi.db.query('api::sms-campaign.sms-campaign').create({
        data: {
          publishedAt: null,
          sent: volGroup,
          body: copy,
          garden: gardenObj.id,
          type: params.type,
          sender: params.sender,
          alert: params.alert,
          ...(params.poll_options                  && { poll_options:   params.poll_options }),
          ...(params.closes_at                    && { closes_at:      params.closes_at }),
          ...(params.send_reminder !== undefined  && { send_reminder:  params.send_reminder }),
        }
      });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }
    return sentInfo
  },
```

`sendPollReminders` (sms-campaign.js:191) computes voters, then non-voters at
line 215 and texts each via `handleSms`:

```js
      const nonVoters = (campaign.sent || []).filter(u => u.phoneNumber && !votedIds.has(u.id));
      ...
      for (const user of nonVoters) {
        await strapi.service('api::sms.sms').handleSms({ task: null, body: smsBody, type: 'followup', previous: null, user });
      }
      await strapi.db.query('api::sms-campaign.sms-campaign').update({
        where: { id: campaign.id },
        data: { reminder_sent: true },
      });
```

`campaign.sent` is populated as full user objects (line 203
`populate: { sent: true, ... }`), so `paused` is available with no extra
populate. The recipient builder `getUsersOfInterest`
(`src/api/user-garden-interest/services/user-garden-interest.js:11`) returns full
user objects in both branches: `garden.volunteers` when `interest` is falsy or
`'Everyone'`, otherwise the `user` relation of matching user-garden-interest
rows. So `paused` is present on every `volGroup` member today.

The module-level Twilio client is `const client = require('twilio')(accountSid, authToken)`
(line 21). It has NO `ENVIRONMENT=test` no-op, so `sendGroupMsg` will attempt a
real HTTP call and, on failure, calls `unsubscribeUser`. Tests MUST stub the
network (see test instructions).

### Instructions

**1. `sendGroupMsg` central filter.** At the very top of the function body
(before the `for` loop and before the `create`), derive the active group and use
it for BOTH the send loop and the persisted `sent` relation. Add a doc comment
noting the populate dependency. Do NOT filter at call sites. Concretely:

- Add a JSDoc block immediately above `sendGroupMsg`:

  ```js
  /**
   * Blast an SMS to a group and record the campaign.
   * Paused (on-vacation) users are excluded from BOTH the send and the persisted
   * `sent` relation, so downstream vote tallies / poll reminders never treat a
   * paused user as a non-voter to nudge.
   * NOTE: relies on `paused` being present on each volGroup member. Every current
   * builder (getUsersOfInterest) returns full user records. Any future caller that
   * passes a narrowed user shape MUST include `paused`, or the filter passes
   * everyone through.
   */
  ```

- As the first statement inside the function, add:

  ```js
  const activeGroup = (volGroup || []).filter(v => !v.paused);
  ```

- Change the send loop to iterate `activeGroup` instead of `volGroup`:
  `for (const volunteer of activeGroup) { ... }`.

- Change the persisted relation from `sent: volGroup` to `sent: activeGroup`.

Leave everything else (the `!volunteer.phoneNumber` skip, the try/catch +
`unsubscribeUser`, the `sentInfo` return, the spread params) unchanged.

**2. `sendPollReminders` live re-check.** On the non-voter filter (line 215) add
`&& !u.paused` — a live re-read of vacation state at reminder time:

```js
      const nonVoters = (campaign.sent || []).filter(u => u.phoneNumber && !votedIds.has(u.id) && !u.paused);
```

No other change to `sendPollReminders`.

**3. Create `tests/sms-campaign-vacation.js`** — a required module (NOT a
`.test.js`; it runs inside the shared `tests/app.test.js` boot and uses the
`strapi` global, same as `tests/user/vacation-reminders.js` in Task 3). Model
structure on `tests/user/index.js` for seeding and cleanup.

Network stub (REQUIRED — the module-level Twilio client would otherwise make a
real call and trigger `unsubscribeUser`). The client is private to the service,
so intercept at Twilio's shared HTTP layer. In `beforeEach`:

```js
const RequestClient = require('twilio/lib/base/RequestClient');
// installed twilio is v3.84.1; this path + prototype.request are stable there
let twilioSpy;
beforeEach(() => {
  twilioSpy = jest.spyOn(RequestClient.prototype, 'request')
    .mockResolvedValue({ statusCode: 201, body: { sid: 'SMtest123', status: 'queued' } });
});
afterEach(() => { twilioSpy.mockRestore(); });
```

`RequestClient.prototype.request` is called once per `client.messages.create`, so
`twilioSpy.mock.calls.length` equals the number of Twilio sends attempted. (Do
not try to assert on the exact request payload shape — it is version-internal;
assert send COUNT plus the reliable, documented `sentInfo` return and the
persisted `sent` relation.)

Seeding helpers:
- Create users via `strapi.db.query('plugin::users-permissions.user').create({ data: {...} })`
  with unique `username`/`email`, `provider: 'local'`, a valid `phoneNumber`
  (e.g. `'+1303555' + nnnn`), and `paused: true|false`.
- Create a garden via
  `strapi.db.query('api::garden.garden').create({ data: { title, sms_slug, publishedAt: new Date(), volunteers: [userId, ...] } })`
  (`title` and `sms_slug` are required; `sms_slug` is unique — use a unique value).
- Use unique prefixes and delete users/gardens/campaigns you create in
  `afterEach`/`afterAll` so rows do not leak into other suites.

Call target for the blast tests:
`await strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg(volGroup, 'Test copy', gardenObj, { type: 'alert', sender: senderId, alert: false })`.
To re-query the created campaign, find the most recent row by `body: 'Test copy'`
(or a unique per-test copy string) and `garden: gardenObj.id`:
`strapi.db.query('api::sms-campaign.sms-campaign').findOne({ where: { body: <copy>, garden: gardenObj.id }, orderBy: { id: 'desc' }, populate: { sent: true } })`.

Tests to write:

- AC14: `volGroup` = one paused + one non-paused user, both with phone numbers.
  Call `sendGroupMsg`. Assert returned `sentInfo` equals `[nonPaused.phoneNumber]`
  (contains ONLY the non-paused number, NOT the paused one), and
  `twilioSpy` was called exactly once (only the non-paused send happened).
- AC15: after that same call, re-query the campaign and assert its populated
  `sent` contains only the non-paused user id (paused user excluded from the
  recorded audience, not merely skipped in the loop).
- AC16: `volGroup` = all members paused. Call `sendGroupMsg`. Assert `twilioSpy`
  never called, returned `sentInfo` is empty `[]`, and the campaign row was still
  created with an empty `sent` relation (re-query → `sent` length 0). No crash.
- AC17: exercise BOTH `getUsersOfInterest` branches feeding the real
  `sendGroupMsg`, each excluding a paused volunteer. Rather than driving the HTTP
  route (which would need a permission grant — out of scope), call the builder
  service directly then `sendGroupMsg`:
    - "Everyone" branch: seed a garden with two `volunteers` (one paused); `const vg = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(garden, 'Everyone')` (pass the garden object WITH `volunteers` populated — re-query it with `populate: ['volunteers']`); call `sendGroupMsg(vg, ...)`; assert paused excluded from `sentInfo` and from persisted `sent`.
    - Tagged-interest branch: seed an `interest` (tag, e.g. `'Weeding'`) and two
      `user-garden-interest` rows (one for the paused user, one for a non-paused
      user) linking `garden`, `user`, and `interest`; call
      `getUsersOfInterest(garden, 'Weeding')`; call `sendGroupMsg(vg, ...)`;
      assert the paused user is excluded from `sentInfo` and `sent`.
    (Check the `interest` and `user-garden-interest` content-type field names
    before seeding: interest has a `tag` string; user-garden-interest relates
    `user`, `garden`, and `interest`.)

Poll-reminder tests (AC18/AC19) — spy on `handleSms`, NOT `sendSms`. IMPORTANT:
`api::sms.sms` `handleSms` early-returns under `ENVIRONMENT=test` BEFORE it ever
calls `sendSms`, so a `sendSms` spy would observe zero calls for everyone. The
recipient is observable at `handleSms` (this is also the established pattern in
`tests/tasks/poll.js`). In `beforeEach` for these tests:
`strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);`
(restore the original in `afterEach`).

Seed a poll campaign directly (no `sendGroupMsg` needed):
`strapi.db.query('api::sms-campaign.sms-campaign').create({ data: { publishedAt: null, type: 'poll', send_reminder: true, reminder_sent: null, closes_at: new Date(Date.now() + 24*60*60*1000), garden: gardenId, body: 'poll body', sent: [pausedNonVoterId, activeNonVoterId, voterId], option_a: [voterId] } })`.
`option_a: [voterId]` marks the voter as having voted (so they are excluded as a
voter, independent of vacation). `closes_at` ~24h out lands inside the 23-25h
reminder window.

- AC18: call `await strapi.service('api::sms-campaign.sms-campaign').sendPollReminders()`.
  Assert `handleSms` was called exactly once, and its call's `user` is the active
  non-voter (NOT the paused non-voter, NOT the voter). Re-query the campaign and
  assert `reminder_sent === true`.
- AC19 (regression guard): confirm the SAME run texted the active, non-paused
  non-voter — i.e. the filter narrows ONLY paused users and reminders still fire
  for eligible recipients. (This is the positive half of AC18; assert the active
  non-voter's id appears in `handleSms.mock.calls[0][0].user.id`.)

Finally, add to `tests/app.test.js` (append near the other requires; keep any
require line Task 3 also added):

```js
require('./sms-campaign-vacation');
```

### Done when
- `node --check src/api/sms-campaign/services/sms-campaign.js` passes
- `node --check tests/sms-campaign-vacation.js` passes
- `NODE_ENV=test npx jest tests/app.test.js -t "campaign"` (or the describe name
  you choose) passes for AC14-AC19
- `sendGroupMsg` uses `activeGroup` for BOTH the send loop and the `sent:`
  relation: `grep -n "sent: activeGroup" src/api/sms-campaign/services/sms-campaign.js`
  matches, and `grep -n "sent: volGroup" src/api/sms-campaign/services/sms-campaign.js`
  returns nothing
- `sendPollReminders` non-voter filter includes `&& !u.paused`

### Out of scope (per Amendment 1 — do NOT touch)
`volunteer-day.sendGroupMsg` (`src/api/volunteer-day/services/volunteer-day.js:39`)
and the `weekly-schedule` blast (`services/weekly-schedule.js:87`) share the same
`sent: volGroup` pattern but are explicitly left unchanged by this amendment.
Do not modify them. (Flagged for a possible follow-up if "no group blasts to
paused users at all" is later desired.)

---

## Dependency / parallelism summary
- **Task 1** first (schema). Tiny; unblocks the `vacation_reminder_count` writes
  in Tasks 2 and 3.
- **Task 2** and **Task 3** are parallel-safe with each other (disjoint files:
  SmsHelper.js/message.js/tests/user/index.js vs.
  vacation-checkin.js/cron-tasks.js/tests/user/vacation-reminders.js/app.test.js).
  Both depend only on Task 1 having landed.
- **Task 4** depends on nothing (reads the pre-existing `paused` field only) and
  is parallel-safe with Tasks 1-3. Its only shared surface is a one-line append
  to `tests/app.test.js`, which Task 3 also appends to — keep BOTH require lines
  when resolving.
- Full-suite green (`NODE_ENV=test npx jest tests/app.test.js`) is the combined
  end-state check once all four land.

## Decisions made for the implementer (do not re-litigate)
- `applyVacation` is kept as an alias of `startVacation` (not a toggle, not
  removed) so any other caller keeps working; the existing pause test is
  repointed at `startVacation`. This satisfies the design's "do not leave both a
  toggle and a split live."
- The `message` audit-record (design step 6) is dropped as out-of-scope.
- Exact copy for the two new "no-op" replies is fixed in Task 2 (already-on-
  vacation and already-active). Only the "already active" substring is
  AC-asserted (AC11).
- Tests run under the shared `tests/app.test.js` boot; the per-file jest command
  targets `tests/app.test.js` with `-t` filters, not a standalone file.
- Task 4 stubs Twilio at `RequestClient.prototype.request` (the module-level
  campaign client is private and has no test no-op); AC17 exercises both
  `getUsersOfInterest` branches by calling the builder + `sendGroupMsg` directly
  rather than the HTTP route, to avoid a permission grant the design forbids.

## Notes / minor design reconciliations (flagged, not blockers)
- **`phoneNumber` vs `phone_number`.** The user schema attribute is `phoneNumber`
  yet `SmsHelper.getUser` and the vacation-checkin service query/select
  `phone_number`. This is pre-existing, load-bearing (all inbound SMS depends on
  it), and the design forbids changing it. Seed with `phoneNumber`; assert on
  message body + user rows, never on the phone argument.
- **Task 4 poll-reminder spy target.** Amendment 1's testing note says
  "spy-on-`sendSms`" for `sendPollReminders`, but `api::sms.sms` `handleSms`
  early-returns under `ENVIRONMENT=test` BEFORE calling `sendSms`, so a `sendSms`
  spy sees zero calls. The observable recipient seam is `handleSms` (also the
  established `tests/tasks/poll.js` convention). Task 4 spies `handleSms`
  accordingly. No code change implied — just the correct test seam.

## No blocking conflicts found
The design (including Amendment 1) matches the code as written: the vacation
fields, the dead reminder service, the inlined cron, the toggling `applyVacation`,
the `!paused` scheduler filters, `sendGroupMsg`'s `sent: volGroup` persistence,
`sendPollReminders`' non-voter filter, and the full-user-object shape from
`getUsersOfInterest` are all as described. Two non-blocking reconciliations are
noted directly above.
