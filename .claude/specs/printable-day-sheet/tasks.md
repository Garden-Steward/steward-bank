# Tasks for Printable Volunteer Day Sheet + Print Wizard (from design.md)

Two repos, both already on branch `claude/printable-garden-checklist-izguqn`:

- **Backend (`[BE]`)** — `/home/user/steward-bank` (Strapi 5.36.0, CommonJS, plain JS, base `49f8ceb`)
- **Frontend (`[FE]`)** — `/home/user/garden-vue` (Vue 3 + Pinia + Tailwind + Vite, base `9c51041`)

**Neither repo has `node_modules` installed.** The first task to run in each repo must run
`yarn install` (backend) / `yarn install` (frontend) before its verification commands.
Backend jest suite is 241/241 green at base — a task that leaves it red is not done.

**The API contract in `design.md` (lines 480–657) is the boundary between the lanes.**
`[FE]` tasks must never read backend source. `[FE]` tasks are parallel-safe with every
`[BE]` task by construction (disjoint repos).

Dispatch order (dependencies are real, not stylistic):

```
[BE]  T1 ──┬─ T4 ── T5 ── T6 ── T7
      T2 ──┘
      T3 (independent)
[FE]  T8 ── T9
```

T1, T2, T3 and the whole FE lane can start simultaneously.

---

## Task 1: [BE] Add the standing-task component, the standing-task single type, and `priority` on garden-task

Depends on: —
Parallel-safe with: Task 2, Task 3, Task 8, Task 9
Covers: AC1, AC2

### Files
- `/home/user/steward-bank/src/components/checklist/standing-task.json` — new
- `/home/user/steward-bank/src/api/day-sheet-standing-task/content-types/day-sheet-standing-task/schema.json` — new (creates the `src/api/day-sheet-standing-task/` folder)
- `/home/user/steward-bank/src/api/garden-task/content-types/garden-task/schema.json` — modify (add one attribute)

### Current state

`src/components/` today holds `education/`, `plants/`, `projects/`, `scheduling/`, `seo/`.
The nearest shaped neighbour is `src/components/projects/impact-metric.json`:

```json
{
  "collectionName": "components_projects_impact_metrics",
  "info": { "displayName": "Impact Metric", "description": "Measurable impact from a project" },
  "options": {},
  "attributes": {
    "label": { "type": "string", "required": true },
    "value": { "type": "string", "required": true },
    "icon":  { "type": "string", "description": "Emoji or icon identifier" }
  }
}
```

`src/api/garden-task/content-types/garden-task/schema.json` currently ends its `attributes`
block with:

```json
    "instruction": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::instruction.instruction"
    }
  }
}
```

There are **no single types anywhere in `src/api/` today**. Every existing api folder that has a
content type also has a core routes file; this one deliberately will not.

### Instructions

1. Create `src/components/checklist/standing-task.json` with **exactly** this content:

```json
{
  "collectionName": "components_checklist_standing_tasks",
  "info": {
    "displayName": "Standing Task",
    "description": "One line on the every-workday checklist"
  },
  "options": {},
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "note": {
      "type": "text"
    }
  }
}
```

Do not add `active`, `sort_order`, or a `garden` relation. Order is array order.

2. Create `src/api/day-sheet-standing-task/content-types/day-sheet-standing-task/schema.json`
   with **exactly** this content:

```json
{
  "kind": "singleType",
  "collectionName": "day_sheet_standing_tasks",
  "info": {
    "singularName": "day-sheet-standing-task",
    "pluralName": "day-sheet-standing-tasks",
    "displayName": "Day Sheet Standing Tasks"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "standing_tasks": {
      "type": "component",
      "repeatable": true,
      "component": "checklist.standing-task"
    }
  }
}
```

`draftAndPublish` is **off on purpose** — a single type with D&P produces a draft row *and* a
published row and the read path would have to pick one. Off means exactly one row, ever.
Do not turn it on.

3. **Create no other files in `src/api/day-sheet-standing-task/`.** In particular do **not**
   create `routes/day-sheet-standing-task.js` (a core routes file). Omitting it means the stock
   `GET/PUT/DELETE /api/day-sheet-standing-tasks` endpoints never exist, so no role grant can
   ever accidentally hand every logged-in volunteer write access to the global list. Task 4 and
   Task 7 will add `services/`, `controllers/`, and one custom `routes/01-day-sheet-standing-task.js`.
   The single type still shows up in the Strapi admin Content Manager (admin reads the
   content-type registry, not the content API), so admin-side editing keeps working.

4. In `src/api/garden-task/content-types/garden-task/schema.json`, add one attribute inside
   `attributes` (put it after `"instruction"`, remembering the comma):

```json
    "priority": {
      "type": "enumeration",
      "enum": ["High", "Normal", "Low"],
      "default": "Normal"
    }
```

This is additive and nullable in the DB. **Do not write a backfill migration and do not add a
`scripts/backfill-task-priority.js`** — existing rows will read back `null` and every consumer
normalizes `null`/unknown to `"Normal"` at read time (Task 5 does this).

5. Do not add any other field to `garden-task`. In particular there is **no**
   `print_on_sheet` / `not_for_print` boolean anywhere in this feature — hiding a task from a
   sheet is per-printout only and lives in a query param.

6. Do not add lifecycles anywhere. This repo has been burned by lifecycles firing during schema
   sync (`src/api/volunteer-day/content-types/volunteer-day/lifecycles.js:8` guards on
   `strapi.isLoaded`); all behaviour in this feature lives in explicit services.

### Done when
- `yarn install` has been run in `/home/user/steward-bank`.
- All three files parse:
  `node -e "['src/components/checklist/standing-task.json','src/api/day-sheet-standing-task/content-types/day-sheet-standing-task/schema.json','src/api/garden-task/content-types/garden-task/schema.json'].forEach(p=>JSON.parse(require('fs').readFileSync(p,'utf8')));console.log('ok')"`
- `ls src/api/day-sheet-standing-task/routes` errors (the directory does not exist) — proving no
  core route file was added.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` is still green with the same test count
  as before your change. Strapi booting cleanly with the new component + single type is the real
  proof the schemas are valid.

---

## Task 2: [BE] Write the pure print-sheet renderer and its unit tests

Depends on: —
Parallel-safe with: Task 1, Task 3, Task 8, Task 9
Covers: AC18, AC19, AC20, AC22, AC23, AC24, AC25, AC26, AC53, AC54

### Files
- `/home/user/steward-bank/src/api/volunteer-day/services/day-sheet-render.js` — new
- `/home/user/steward-bank/tests/event/day-sheet-render.test.js` — new

### Current state

`src/api/volunteer-day/services/` currently holds `helper.js` (a plain-object CommonJS module)
and `volunteer-day.js`. Strapi auto-registers one service per file in `services/`, so your new
file will also be registered as `api::volunteer-day.day-sheet-render`. That is harmless — export
a plain object and never touch `strapi` from inside it.

Date formatting in this repo goes through `date-fns-tz@^2.0.0` with the zone
`America/Los_Angeles`. Established usage, `src/api/volunteer-day/controllers/VdayHelper.js:6-12`:

```js
const {format, utcToZonedTime} = require("date-fns-tz");
const timeZone = 'America/Los_Angeles';
const pacificTime = utcToZonedTime(new Date(`${vDay.startDatetime}`), timeZone);
let date = format(pacificTime, 'MMM d');
```

Use exactly that API (`utcToZonedTime` + `format`). Do **not** reach for `formatInTimeZone` or
`toZonedTime` — those are other versions' spellings.

There is no test harness for pure modules in `tests/` yet. Jest's config in `package.json` has no
`testMatch`, so the default applies: a file named `*.test.js` is picked up as its own suite.
`tests/recurring-events/date-calculations.test.js` is the precedent. **Your test file must not be
`require`d from `tests/app.test.js`** — it needs no Strapi, and keeping it out of `app.test.js`
is what keeps this task from colliding with Tasks 4–7.

### The input contract (this is the whole interface — do not invent anything else)

```js
module.exports = { renderDaySheetHtml };
```

`renderDaySheetHtml(sheet)` takes **exactly the `data` object that the day-sheet JSON endpoint
returns** and returns a complete HTML document as a string. Shape:

```js
{
  event: {
    id: 42,
    documentId: 'k3n1p9c4x0',
    title: 'Saturday Workday',
    startDatetime: '2026-08-22T16:00:00.000Z',   // ISO UTC string, may be null
    canceled: false,
    garden: { id: 3, documentId: 'b7q2z8', title: 'Triangle Garden', slug: 'triangle-garden' } // may be null
  },
  standing: [ { key: '1a2b3c4d', title: 'Weed pathways', note: 'Start at the north gate' } ], // note may be null
  tasks: [ {
    id: 91, documentId: 't7w2m1', title: 'Turn the compost',
    priority: 'High',            // always one of 'High' | 'Normal' | 'Low'
    type: 'Weeding',             // may be null
    status: 'INITIALIZED',       // may be null
    overview: 'Both bins.',      // may be null
    volunteer_count: 2,          // integer
    max_volunteers: 4            // integer or null
  } ],
  excludedKeys: ['ff00ab99'],    // standing keys to DROP from the print
  hiddenTaskIds: [104],          // numeric task ids to DROP from the print
  extras: ['bring the wheelbarrow back'],
  meta: { standingSource: 'single-type', standingCount: 2, taskCount: 1,
          generatedAt: '2026-08-21T14:03:00.000Z',
          printPath: '/api/volunteer-days/by-id/42/day-sheet.html' }
}
```

**The renderer, not the caller, applies the filters.** `standing` and `tasks` arrive unfiltered;
`renderDaySheetHtml` drops standing rows whose `key` is in `excludedKeys` and tasks whose `id` is
in `hiddenTaskIds`. The function must be pure and total: missing/`null` fields must not throw.
Treat a missing `sheet.standing`/`tasks`/`extras`/`excludedKeys`/`hiddenTaskIds` as `[]`.

### Instructions

1. `'use strict';` at the top. CommonJS. No `strapi` access, no `require` of anything from
   `src/api/**`. `date-fns-tz` is the only non-core dependency you may require.

2. **`escapeHtml(value)`** — one function, used for *every* interpolated value: event title,
   garden title, standing titles and notes, extra lines, task titles, task overviews, task meta
   words, formatted dates. Replace, **ampersand first**:
   `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`.
   Coerce `null`/`undefined` to `''` before replacing.
   **Use `&#39;` exactly — not `&#039;` and not `&#x27;`.** `&#039;` contains three hex digits
   after a `#` and will false-positive the AC19 "no colour" regex.
   Nothing is interpolated into an attribute value, a `<style>` block, a URL, or an event
   handler. All user-influenced text lands in element text content only.

3. **Filtering, then counting — in this order:**

```
printedStanding = standing.filter(s => !excludedKeys.includes(s.key))
printedExtras   = extras
printedTasks    = tasks.filter(t => !hiddenTaskIds.includes(t.id))
totalItems      = printedStanding.length + printedExtras.length + printedTasks.length
```

   Filter first, count second. Hiding six tasks must relax the sheet into a roomier tier, not
   leave it cramped for items that are not on the page.

4. **Density class on `<body>`** — exactly one of:

| totalItems | body class | effect |
|---|---|---|
| ≤ 10 | `density-normal` | task `overview` blocks rendered; item gap `0.30in` |
| 11–18 | `density-compact` | task `overview` blocks **omitted from the HTML entirely**; item gap `0.18in` |
| > 18 | `density-dense` | overviews omitted; item gap `0.12in`; **Notes section omitted entirely** |

   "Omitted" means not emitted into the markup — not hidden with CSS. AC25 greps for the absence
   of the overview text. **Type sizes are identical in all three tiers** — the `18pt` / `16pt` /
   `13pt` declarations must appear in the stylesheet unconditionally, never inside a
   density-scoped rule.

5. **Document shape.** `<!DOCTYPE html>`, `<html lang="en">`, one `<head>` containing
   `<meta charset="utf-8">`,
   `<meta name="viewport" content="width=device-width, initial-scale=1">`,
   `<meta name="robots" content="noindex">`,
   `<title>Day Sheet — {escaped event title}</title>`, and **one inline `<style>` block**.
   **Zero `<script>` tags. Zero `<link>` tags. No `src="http`, no `href="http`, no webfonts, no
   images, no external requests of any kind.** (The repo CSP at `config/middlewares.js` permits
   inline styles and forbids inline scripts, which matches exactly.)

6. **CSS, all of it inline in that one `<style>`:**
   - `@page { size: letter; margin: 0.5in; }` — those literal strings are grepped.
   - Fonts: headings `Charter, Georgia, serif`; body `system-ui, -apple-system, Helvetica, sans-serif`.
   - Section heads `font-size: 18pt; font-weight: bold;` with `break-after: avoid;`
   - Task/standing titles `font-size: 16pt; font-weight: bold;`
   - Body/notes `font-size: 13pt;` (a `14pt` sub-line in the header is fine)
   - `.item { display: flex; gap: 12px; align-items: flex-start; break-inside: avoid; }`
   - `.checkbox { display: inline-block; width: 16px; height: 16px; border: 2px solid #000; flex-shrink: 0; margin-top: 3px; }`
   - Section separators `border-top: 2px solid #000;`
   - `.hint { }` — a screen-only line at the very top reading
     `Press Ctrl-P / Cmd-P to print.` — hidden inside `@media print { .hint { display: none; } }`.
     There is no JS to auto-open the print dialog and none is wanted.

7. **AC19 is the trap in this task.** The whole rendered body must contain **no colour
   declaration other than black/white**. Concretely, your output must:
   - match no `#[0-9a-fA-F]{3,6}` other than `#000`, `#000000`, `#fff`, `#ffffff`;
   - contain no `rgb(`, no `rgba(`, no `hsl(`, no `hsla(`;
   - contain no named colour keyword — no `black`, `white`, `grey`, `gray`, `red`, `silver`,
     `transparent`, `currentColor`.

   Use `#000` and `#fff` and nothing else. `body { background: #fff; color: #000; }`. No tints,
   no greys, no fills, no logo, no branding. The Garden Steward brandbook governs the wizard
   modal inside the app, **not** this document. If the event is canceled, emit a plain bold-caps
   text line `THIS EVENT IS CANCELED` — **not** a red one.

8. **Document body, in this order:**

   1. **Header** — `<h1>` with the escaped event title (18pt bold serif). Second line at 14pt:
      the escaped garden title (omit this line entirely when `event.garden` is null), then the
      event date/time in `America/Los_Angeles`:
      `format(utcToZonedTime(new Date(event.startDatetime), 'America/Los_Angeles'), 'EEEE, MMMM d, yyyy')`
      + `' at '` +
      `format(utcToZonedTime(new Date(event.startDatetime), 'America/Los_Angeles'), 'h:mm a')`
      → e.g. `Saturday, August 22, 2026 at 9:00 AM`. When `startDatetime` is falsy, omit the
      date line rather than printing `Invalid Date`. Then a small `Printed <date>` line (format
      the current date the same way, date only). Then the canceled line if `event.canceled`.
   2. **`Every Workday`** section — `printedStanding` in list order, then `printedExtras` in
      submitted order, rendered **identically** (checkbox + 16pt title). Extras get no visual
      distinction; they are just additional lines for today. A standing item's `note`, when
      present and non-empty, prints under the title at 13pt.
   3. **`Today's Tasks`** section — `printedTasks` in the order they arrive (the caller has
      already sorted by priority; **do not re-sort**). Each item: checkbox, 16pt bold escaped
      title, then a 13pt meta line built as **plain text** by joining the present pieces with
      ` · `:
      `${priority} priority` (always), `type` (when non-null), `needs ${max_volunteers}` (when
      `max_volunteers` is a number). Example: `High priority · Weeding · needs 4`. Priority is a
      **word**, never a colour. In `density-normal` only, print the escaped `overview` beneath at
      13pt, truncated at 240 characters on a word boundary with a trailing `…` (U+2026) when it
      was longer.
      If `printedTasks` is empty — because the event has none, or because every one of them was
      hidden — **the section still prints**, containing the single line
      `No tasks on this sheet.` One string covers both cases; the sheet never silently omits
      the section.
   4. **Notes** — heading plus 5 blank ruled lines (`border-bottom: 1px solid #000;` 0.4in
      apart), `break-inside: avoid`. **Omitted entirely in `density-dense`.**

   Nothing is ever truncated out of the *list* itself and type never shrinks below the scale
   above. Past ~18 items the sheet simply flows onto page two, with `break-inside: avoid` keeping
   any single block whole.

9. **Tests** — `tests/event/day-sheet-render.test.js`. `require('../../src/api/volunteer-day/services/day-sheet-render')`
   directly. No Strapi, no supertest, no `setupStrapi`. Build a `makeSheet(overrides)` factory in
   the file so each test can vary counts. Write, at minimum:

   - **AC18** — body contains `@page`, `size: letter`, `margin: 0.5in`, `<style`; and
     `expect(html).not.toContain('<script')`, `not.toContain('<link')`,
     `not.toContain('src="http')`, `not.toContain('href="http')`.
   - **AC19** — `const hexes = html.match(/#[0-9a-fA-F]{3,6}/g) || []; expect(hexes.every(h => ['#000','#000000','#fff','#ffffff'].includes(h))).toBe(true);`
     plus `expect(html).not.toMatch(/rgba?\(|hsla?\(/)` and
     `expect(html).not.toMatch(/\b(black|white|gray|grey|red|silver|transparent|currentColor)\b/)`.
     Run this against a fixture with a canceled event and populated notes/overviews.
   - **AC20** — an extra line of `<script>alert(1)</script>`, a standing title of
     `<img src=x onerror=1>`, and an event title of `<img src=x onerror=1>`: body contains
     `&lt;script&gt;` and `&lt;img src=x onerror=1&gt;`, and
     `expect(html).not.toContain('<script')` / `not.toContain('<img')`.
   - **AC22** — event title, garden title, and, for `startDatetime: '2026-08-22T16:00:00.000Z'`,
     the literal substring `9:00 AM` (**not** `4:00 PM`) and `Saturday, August 22, 2026`.
   - **AC23** — 3 standing items; with `excludedKeys: [item2.key]` the body contains items 1 and
     3's titles and **not** item 2's; with `excludedKeys: ['ffffffff']` all three appear.
   - **AC24** — two `extras` appear in the `Every Workday` section, after the last standing
     title, in submitted order (assert via `indexOf` ordering).
   - **AC25** — three fixtures at 8 / 14 / 22 printed items:
     8 → body has `density-normal` and at least one task `overview` string appears;
     14 → `density-compact`, and the overview string appears nowhere;
     22 → `density-dense`, and the string `Notes` (as a heading) is absent.
     In all three, assert `18pt`, `16pt`, and `13pt` each appear and that the count of each
     declaration is the same across the three outputs.
   - **AC26** — the stylesheet declares `break-inside: avoid` on the class used by task blocks
     and by checklist items, and declares `width: 16px`, `height: 16px`, `border: 2px solid #000`
     on the checkbox class; and the rendered markup uses those classes once per item.
   - **AC53** — one fixture whose unfiltered totals are 20 printed items renders `density-dense`;
     the *same* fixture with `hiddenTaskIds` removing six tasks (→ 14 printed items) renders
     `density-compact`. This proves the tier is derived from printed items, not unfiltered totals.
   - **AC54** — `hiddenTaskIds` containing every task id: the `Today's Tasks` heading is still
     present and the body contains exactly the line `No tasks on this sheet.`; and a fixture with
     `tasks: []` produces the same line.

### Done when
- `node --check src/api/volunteer-day/services/day-sheet-render.js` passes.
- `NODE_ENV=test npx jest tests/event/day-sheet-render.test.js --runInBand` passes.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` is still green (you did not edit it).
- `grep -c '<script' src/api/volunteer-day/services/day-sheet-render.js` shows the string only
  where it is being escaped in a test, never emitted.

---

## Task 3: [BE] Seed the `replaceList` grant for the Authenticated role

Depends on: —
Parallel-safe with: every other task
Covers: AC39

### Files
- `/home/user/steward-bank/scripts/seed-content-permissions.js` — modify (one line)

### Current state

```js
const DESIRED = {
  public: {
    'api::plant.plant': ['find', 'findOne'],
    'api::project.project': ['find', 'findOne', 'findByGarden'],
    'api::location-tracking.location-tracking': ['find', 'findOne'],
  },
  authenticated: {
    'api::plant.plant': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::project.project': ['find', 'findOne', 'create', 'update', 'delete', 'findByGarden'],
    'api::location-tracking.location-tracking': ['find', 'findOne', 'create', 'update', 'delete'],
  },
};
```

The script derives the Strapi roles-API controller name with
`namespace.split('::')[1]?.split('.')[1]`, which for
`api::day-sheet-standing-task.day-sheet-standing-task` yields `day-sheet-standing-task` — correct,
no change needed there.

### Instructions

1. Add exactly one entry to `DESIRED.authenticated`:

```js
    'api::day-sheet-standing-task.day-sheet-standing-task': ['replaceList'],
```

2. **Add nothing to `DESIRED.public`.** The two read endpoints in this feature are `auth: false`
   at the route level and need no grant at all; the write endpoint must stay fail-closed for
   anonymous callers.

3. Change nothing else in the file. Do not touch `scripts/seed-auth-permissions.js`.

4. Add a short comment above the new line noting that this grant is what lets the request *reach*
   the controller — the real authorization (administrator or manager of ≥ 1 garden) lives in the
   controller Task 7 writes, because this grant is role-wide and would otherwise let any
   logged-in volunteer write the global list.

### Done when
- `node --check scripts/seed-content-permissions.js` passes.
- `grep -n "day-sheet-standing-task" scripts/seed-content-permissions.js` shows exactly one
  match, and it is inside the `authenticated` block.
- `node -e "const s=require('fs').readFileSync('scripts/seed-content-permissions.js','utf8'); const pub=s.slice(s.indexOf('public:'), s.indexOf('authenticated:')); if(pub.includes('day-sheet-standing-task')) throw new Error('leaked into public'); console.log('ok')"`
- Note in your completion message: **deploy is not complete until `yarn seed:content-permissions`
  runs against production.** Until then `PUT /api/day-sheet-standing-tasks/list` returns 403 to
  everyone (fail-closed); the two read endpoints work immediately.

---

## Task 4: [BE] Build the standing-list service (defaults, key hashing, validation, persistence)

Depends on: Task 1
Parallel-safe with: Task 2, Task 3, Task 8, Task 9
Covers: AC33, AC37

### Files
- `/home/user/steward-bank/src/api/day-sheet-standing-task/services/day-sheet-standing-task.js` — new
- `/home/user/steward-bank/tests/tasks/standing-tasks.js` — new
- `/home/user/steward-bank/tests/app.test.js` — modify (append one `require` line)

### Current state

Task 1 created `src/api/day-sheet-standing-task/content-types/day-sheet-standing-task/schema.json`
(a single type, `draftAndPublish: false`, one repeatable component attribute `standing_tasks` of
type `checklist.standing-task`, whose attributes are `title` (string, required) and `note` (text)).
UID: `api::day-sheet-standing-task.day-sheet-standing-task`.

There is no `services/` folder in that api yet. There is no controller and no route yet — Task 7
adds those. **You are building the service only.**

`tests/app.test.js` ends with:

```js
require('./event/rsvp');
require('./event/messages');
require('./sms-campaign-vacation');

// Recurring event tests (unit tests for date calculations)
require('./recurring-events/date-calculations.test');
require('./recurring-events/instance-generation.test');
```

Every module required there shares **one** Strapi instance booted by `tests/helpers/strapi.js`,
and there is a global `afterEach(restoreAll)` at `tests/app.test.js:13-15`. Any service stub must
go through `tests/helpers/patch.js` (`patch`, `patchService`, `patchQuery`) so it is undone.
`strapi` is a global inside these modules — see `tests/tasks/publish.js` for the house style
(`strapi.db.query('api::garden.garden').create({ data: {...} })` in a `beforeEach`).

**The test database is shared and is not reset between modules.** Your tests must set the
single-type row to whatever state they need, in their own `beforeEach`/`beforeAll` — never assume
it is empty or that another module left it alone.

### Instructions

1. Create `src/api/day-sheet-standing-task/services/day-sheet-standing-task.js`. `'use strict';`,
   CommonJS, factory form:

```js
'use strict';
const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::day-sheet-standing-task.day-sheet-standing-task';

const DEFAULT_STANDING_TASKS = [ /* see step 2 */ ];

module.exports = createCoreService(UID, ({ strapi }) => ({
  DEFAULT_STANDING_TASKS,
  computeKey(title) { /* step 3 */ },
  async getList() { /* step 4 */ },
  async replaceList(items) { /* steps 5-7 */ },
}));
```

   Also export the constant off the module for tests:
   `module.exports.DEFAULT_STANDING_TASKS = DEFAULT_STANDING_TASKS;` is **not** possible on the
   factory return, so instead expose it as a property of the service object (as shown above) and
   read it in tests via `strapi.service(UID).DEFAULT_STANDING_TASKS`.

2. **`DEFAULT_STANDING_TASKS`** — these five, in this order, each with `note: null`:

```js
const DEFAULT_STANDING_TASKS = [
  { title: 'Start a fire in the cob oven', note: null },
  { title: 'Weed pathways', note: null },
  { title: 'Find what needs harvesting and make harvest bundles', note: null },
  { title: 'Clear trash from the triangle garden area', note: null },
  { title: 'Prune back or pull out dead growth', note: null },
];
```

3. **`computeKey(title)`**:

```js
computeKey(title) {
  const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
}
```

   8 lowercase hex characters. This is deliberately **content**-derived, not index- or row-id-
   derived: reordering the list does not shift which row an exclusion refers to; deleting a row
   makes its key stop matching; editing a row's title makes the old key stop matching so the row
   **prints** rather than silently disappearing (fail-safe direction). Two rows with identical
   titles collapse to one key and are excluded together — accepted, list is capped at 30 lines.

4. **`getList()`** → `{ items: [{ key, title, note }], source: 'single-type' | 'default' }`.

```js
async getList() {
  const row = await strapi.documents(UID).findFirst({ populate: { standing_tasks: true } });
  const raw = Array.isArray(row?.standing_tasks) ? row.standing_tasks : [];
  const items = raw
    .filter((i) => typeof i?.title === 'string' && i.title.trim() !== '')
    .map((i) => ({
      key: this.computeKey(i.title),
      title: i.title,
      note: (typeof i.note === 'string' && i.note !== '') ? i.note : null,
    }));
  if (items.length === 0) {
    return {
      items: DEFAULT_STANDING_TASKS.map((i) => ({ key: this.computeKey(i.title), title: i.title, note: null })),
      source: 'default',
    };
  }
  return { items, source: 'single-type' };
}
```

   D&P is off, so there is exactly one row and no status juggling. Items whose `title` is missing
   or whitespace-only are skipped defensively. When the row does not exist, or `standing_tasks` is
   absent, or the surviving list is empty → the five defaults with `source: 'default'`.

   **Fallback, with a defined trigger:** if `strapi.documents(UID).findFirst(...)` throws or
   returns `undefined` on this Strapi 5.36 build for a single type, switch **both** `getList` and
   `replaceList` to `strapi.db.query(UID).findOne({ populate: { standing_tasks: true } })` /
   `.create` / `.update` — read and write must use the same API family. Try the documents API
   first; only fall back if it demonstrably fails, and say so in your completion message.

5. **Validation, inside `replaceList(items)`.** Throw on the first violation:

```js
const err = (message) => Object.assign(new Error(message), { standingValidationError: true });
```

   Rules, in this order:
   - `items` is not an array → `throw err('standing_tasks must be an array')`
   - `items.length > 30` → `throw err('standing_tasks may contain at most 30 items')`
   - Per item, at zero-based index `n`, **title first, then note**:
     - Take `item?.title`. If it is not a string → `throw err('Item ' + n + ': title is required')`.
     - Normalize: strip control characters (`replace(/[\x00-\x1F\x7F]/g, '')`), collapse
       internal whitespace (`replace(/\s+/g, ' ')`), then `trim()`.
     - Length `0` → `throw err('Item ' + n + ': title is required')`.
     - Length `> 120` → `throw err('Item ' + n + ': title must be 120 characters or fewer')`.
       **120 is inclusive — a 120-character title is accepted.**
     - Take `item?.note`. `null` / `undefined` / `''` → store `null`.
     - Otherwise not a string → `throw err('Item ' + n + ': note must be a string')`.
     - Otherwise strip control characters **other than `\n`**
       (`replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '')`). Do not trim, do not collapse.
     - Length `> 500` → `throw err('Item ' + n + ': note must be 500 characters or fewer')`.
       **500 is inclusive.**
   - Unknown keys on an item are ignored (build a fresh `{ title, note }` object).

   **No submitted title or note text may appear in any message — only the index.** This is a
   hard requirement (AC32 greps for it). Do not add "got: ..." or "received ..." to any message.
   Do not log the submitted content with `strapi.log.*` either.

6. **Persistence** — an **empty array is allowed and means "clear the curated list"**, which per
   the fallback rule in `getList` makes the next sheet print the five hardcoded defaults again.
   It does *not* produce an empty section, and it is not an error.

```js
const row = await strapi.documents(UID).findFirst();
if (!row) {
  await strapi.documents(UID).create({ data: { standing_tasks: cleaned } });
} else {
  await strapi.documents(UID).update({ documentId: row.documentId, data: { standing_tasks: cleaned } });
}
return this.getList();
```

   Component array order is preserved by Strapi as insertion order, which is what makes reorder
   work with no `sort_order` field. Return the freshly-read `getList()` result so callers get the
   same `{ items, source }` shape and correct `source` after a clear.

   **Concurrency is last-write-wins.** No version token, no ETag, no optimistic locking. Do not
   build any. Two managers saving within the same minute means the later save silently discards
   the earlier one — accepted and documented.

7. Use `strapi.log.*` if you log anything at all. Do not add `console.log` (legacy ones exist
   elsewhere; do not add more).

8. **Tests** — create `tests/tasks/standing-tasks.js`. It runs inside the shared `app.test.js`
   suite, so it uses the global `strapi` and must **not** call `setupStrapi` itself. Follow
   `tests/tasks/publish.js` for style. Add a helper at the top of the file:

```js
const UID = 'api::day-sheet-standing-task.day-sheet-standing-task';
const resetStandingList = async () => {
  const row = await strapi.documents(UID).findFirst();
  if (row) await strapi.documents(UID).delete({ documentId: row.documentId });
};
```

   Write `describe('Standing task service', ...)` covering:
   - `getList()` after `resetStandingList()` → 5 items, titles equal to the five defaults in
     order, every `note` is `null`, `source === 'default'`.
   - `computeKey` returns `/^[0-9a-f]{8}$/` and is stable: `computeKey('Weed  Pathways ')` ===
     `computeKey('weed pathways')`.
   - **AC33 (owned here)** — `replaceList([{ title: 'x'.repeat(120), note: 'y'.repeat(500) }])`
     resolves; the returned item's `title.length === 120` and `note.length === 500`. Then assert
     the off-by-one direction still rejects: `'x'.repeat(121)` rejects with
     `Item 0: title must be 120 characters or fewer`, `'y'.repeat(501)` rejects with
     `Item 0: note must be 500 characters or fewer`.
   - **AC37 (owned here)** — `await resetStandingList()`, then call `replaceList` with the *same*
     two-item list twice. Assert `await strapi.db.query(UID).count({}) === 1` and that the
     component table holds exactly two rows:
     `const [{ c }] = await strapi.db.connection('components_checklist_standing_tasks').count('* as c'); expect(Number(c)).toBe(2);`
     If that knex table name does not exist on this build, list tables with
     `await strapi.db.connection.raw("SELECT name FROM sqlite_master WHERE type='table'")` and use
     the actual component table name — but the expected count stays 2 (no orphan accumulation).
   - Supporting (not AC-owning — Task 7 owns the HTTP-level AC32): each validation message fires
     for its input, and **no message contains any submitted text** — e.g.
     `await expect(svc.replaceList([{ title: 'SECRET-TITLE-XYZ'.repeat(20) }])).rejects.toThrow(/^Item 0: title must be 120 characters or fewer$/)`.

   Leave the single type in a **known, deleted** state at the end of the describe
   (`afterAll(resetStandingList)`) so later modules are not surprised.

9. Append **one** line to `tests/app.test.js`, at the very end of the require block:

```js
require('./tasks/standing-tasks');
```

   Do not reorder or remove any existing require. Task 5 will append
   `require('./event/day-sheet')` after yours — leave room, do not add it yourself.

### Done when
- `node --check src/api/day-sheet-standing-task/services/day-sheet-standing-task.js` passes.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` passes, with your new describes green and
  the pre-existing 241 still green.
- `grep -rn "SECRET\|got:\|received" src/api/day-sheet-standing-task/services/day-sheet-standing-task.js`
  returns nothing (no input echoing).

---

## Task 5: [BE] Build the day-sheet assembly service (event resolution, draft/publish dedupe, sort, param parsing)

Depends on: Task 1, Task 2, Task 4
Parallel-safe with: Task 3, Task 8, Task 9
Covers: AC3, AC6, AC7, AC8, AC9, AC15, AC16, AC34, AC35

### Files
- `/home/user/steward-bank/src/api/volunteer-day/services/day-sheet.js` — new
- `/home/user/steward-bank/tests/event/day-sheet.js` — new
- `/home/user/steward-bank/tests/app.test.js` — modify (append one `require` line)

**Do not touch `src/api/volunteer-day/controllers/volunteer-day.js` or
`src/api/volunteer-day/routes/01-volunteer-day.js` — those belong to Task 6.**

### Current state

Strapi registers one service per file in an api's `services/` folder, so this file becomes
**`api::volunteer-day.day-sheet`**. `src/api/volunteer-day/services/` already holds `helper.js`
and `volunteer-day.js`; Task 2 added `day-sheet-render.js` exporting
`{ renderDaySheetHtml(sheet) }` (a pure module — see its header comment for the exact input shape;
it is the same object `assemble()` returns).

Task 4 registered `api::day-sheet-standing-task.day-sheet-standing-task` with
`getList()` → `{ items: [{key,title,note}], source: 'single-type'|'default' }`,
`replaceList(items)` → same shape, and `computeKey(title)`.

The numeric-id precedent in this api, `src/api/volunteer-day/controllers/volunteer-day.js:17-33`:

```js
const entry = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
  where: { id },
  populate: { /* ... */ garden: { populate: { managers: true } } },
});
```

v5's core `findOne` keys on `documentId`, and this whole feature is anchored on numeric ids
(they are baked into SMS links), so **every lookup here goes through `strapi.db.query`, never the
core/documents `findOne`.**

`garden-task` has `draftAndPublish: true` and this repo deliberately leaves tasks unpublished
until they leave `INITIALIZED` — `src/api/garden-task/services/garden-task.js:26-29`:

```js
if (currentTask.status === 'INITIALIZED' && status !== 'INITIALIZED' && status !== 'PENDING') {
  updateData.publishedAt = new Date();
}
```

`volunteer-day` also has `draftAndPublish: true`.

`tests/app.test.js` now ends with `require('./tasks/standing-tasks');` (added by Task 4).
The shared test DB is not reset between modules and `tests/tasks/standing-tasks.js` runs **before**
your module — so your tests must explicitly put the standing single type into the state each
assertion needs.

### Instructions

Create `src/api/volunteer-day/services/day-sheet.js`: `'use strict';`, CommonJS, factory form
`module.exports = ({ strapi }) => ({ ... });` (a plain factory is enough here — this is not a
content-type service; do **not** use `createCoreService`).

Public surface — exactly these methods:

```
assemble(eventId, { excludeKeys = [], extras = [], hiddenTaskIds = [] } = {})
resolveEvent(eventId)
loadTasks(event)
sortTasks(tasks)
renderHtml(sheet)
parseSheetParams(query)
```

Both endpoints (Task 6) call `assemble()` and nothing else; neither controller queries the DB
directly. That is the "JSON and HTML can never drift" guarantee — keep all DB access in here.

1. **`resolveEvent(eventId)`**

```js
async resolveEvent(eventId) {
  return strapi.db.query('api::volunteer-day.volunteer-day').findOne({
    where: { id: eventId },
    populate: { garden: true },
  });
}
```

   Returns `null` when there is no such row; the controller turns that into a 404.

2. **`loadTasks(event)` — the sharp edge, D2a. Implement exactly this, in this order:**

   1. Take `event.documentId`.
   2. `const rows = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({ where: { documentId: event.documentId }, select: ['id'] });`
      → all row ids for that logical event (draft **and** published). A single logical event can
      exist as two rows with the same `documentId` and different numeric `id`s.
   3. `const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({ where: { volunteer_day: { id: { $in: rows.map(r => r.id) } } }, populate: { volunteers: { select: ['id'] } } });`
   4. **Dedupe by `documentId`, preferring the row with `publishedAt != null`**; fall back to the
      draft row when only a draft exists. Concretely: iterate, keep a `Map` keyed by
      `task.documentId`, and replace the stored entry whenever the incoming row has a non-null
      `publishedAt` and the stored one does not. When neither or both are published, keep the one
      with the lower numeric `id`.
   5. Return the deduped array (unsorted — `assemble` sorts).

   Walking `event.garden_tasks` off whichever event row the numeric id happened to hit
   under-reports (misses unpublished tasks) or over-reports (double-counts a task that has both a
   draft and a published row). **Do not use `event.garden_tasks`.** AC15 and AC16 test both
   directions and this is the single most likely bug in the feature.

   Apply **no status filtering** — a `FINISHED` task still appears, with its status in the
   payload.

3. **`sortTasks(tasks)`** — rank `High = 0`, `Normal = 1`, `Low = 2`; `null`/unknown → `1`.
   Tie-break on **ascending numeric `id`**. Deterministic; do not rely on relation populate order.
   Return a new array; do not mutate the input.

4. **`assemble(eventId, opts)`** — returns the `data` object of the API contract, or `null` when
   `resolveEvent` returns falsy (the controller 404s):

```js
{
  event: { id, documentId, title, startDatetime, canceled, garden },   // garden: {id, documentId, title, slug} or null
  standing: [ { key, title, note } ],       // ALWAYS the full list, never pre-filtered
  tasks:    [ { id, documentId, title, priority, type, status, overview, volunteer_count, max_volunteers } ],
                                            // ALWAYS the full list, never filtered by hideTasks
  excludedKeys: [...],                      // echo of the validated, deduped submitted keys
  hiddenTaskIds: [...],                     // echo of the validated, deduped submitted ids
  extras: [...],                            // echo of the normalized lines
  meta: {
    standingSource: 'single-type' | 'default',
    standingCount: standing.length,
    taskCount: tasks.length,
    generatedAt: new Date().toISOString(),
    printPath: `/api/volunteer-days/by-id/${event.id}/day-sheet.html`
  }
}
```

   Rules that are easy to get wrong:
   - `standing` and `tasks` are **never filtered here**. The JSON endpoint echoes the params; the
     renderer obeys them. This asymmetry is what lets the wizard render a hidden task
     struck-through and restorable instead of making the row vanish.
   - Get the standing list via
     `strapi.service('api::day-sheet-standing-task.day-sheet-standing-task').getList()`.
     **Never `require` another module's files directly.**
   - `event.canceled` — coerce to a boolean (`=== true`).
   - `garden` — build a fresh `{ id, documentId, title, slug }`; it may be `null`.
   - `priority` — `['High','Normal','Low'].includes(t.priority) ? t.priority : 'Normal'`. A `null`
     column value reads back as `"Normal"`. (**AC3.**)
   - `volunteer_count` — `Array.isArray(t.volunteers) ? t.volunteers.length : 0`, an integer.
   - **PII (D2b, non-negotiable):** the HTML endpoint is unauthenticated and its URL contains an
     enumerable numeric id, so **no volunteer PII may appear in either payload** — no names, no
     phone numbers, no emails, no usernames, no user ids. `volunteers` is populated solely to
     count it and **must be dropped before the payload is built**. Do not spread the raw task or
     the raw event into the payload; build each object field by field. Do not add a `confirmed`
     list, a `managers` list, or `garden.volunteers`.

5. **`renderHtml(sheet)`** — a thin wrapper, nothing else:

```js
const { renderDaySheetHtml } = require('./day-sheet-render');
// ...
renderHtml(sheet) { return renderDaySheetHtml(sheet); },
```

6. **`parseSheetParams(query)`** — the one shared validator; there is no second one. Returns
   `{ excludeKeys, extras, hiddenTaskIds }`, all normalized (deduped, trimmed, order-preserving),
   or throws:

```js
const paramError = (message) => Object.assign(new Error(message), { sheetParamError: true });
```

   with `message` being **exactly one of** `Invalid exclude parameter`,
   `Invalid extra parameter`, `Invalid hideTasks parameter`. **The message never contains any part
   of the input.** Validate in that order (exclude, then extra, then hideTasks) so behaviour is
   deterministic when more than one param is bad.

   - **`exclude`** — comma-separated `computeKey` values, e.g. `?exclude=1a2b3c4d,ff00ab99`.
     Repeated `?exclude=` params are **concatenated before splitting**
     (`Array.isArray(q) ? q.join(',') : q`). A non-string, non-string-array value (nested/object
     form) → throw. If the joined string trims to empty → `[]`. Otherwise split on `,`; **every**
     token must match `/^[0-9a-f]{8}$/` or throw. Dedupe preserving first-seen order. More than
     **30** tokens after dedupe → throw. Tokens matching no current standing row are **ignored
     silently** — never an error. That is the whole point of content-derived keys: the list can
     change between page load and print, and a stale key just means that row prints.
   - **`extra`** — repeated query key,
     `?extra=bring%20the%20wheelbarrow%20back&extra=lock%20the%20gate`. A single `?extra=...`
     string is equally valid. If `query.extra` is `undefined` → `[]`. If it is a string → wrap in
     an array. If it is an array whose every element is a string → use it. **Anything else
     (a nested/object form such as `extra[a]=b`) → throw.** More than **5** entries *as
     submitted* → throw. Then per entry: strip control characters
     (`replace(/[\x00-\x1F\x7F]/g, '')`), `trim()`. Drop entries that are now empty
     (**dropped, not an error**). Any surviving entry longer than **120** → throw. Combined
     length of the survivors > **400** → throw. Order preserved.
   - **`hideTasks`** — comma-separated numeric garden-task ids, e.g. `?hideTasks=91,104`.
     Repeated params concatenated before splitting, same as `exclude`. Empty/absent → `[]`.
     **Every** token must match `/^[0-9]{1,9}$/` or throw — letters, negatives, decimals, and the
     empty segments produced by `91,,104` all throw. Map to `Number`. Dedupe preserving order.
     More than **30** after dedupe → throw. **Ids matching no task on this event are ignored
     silently — never a 400, never a 404.** Same fail-safe direction as a stale `exclude` key.
     The ids are the numeric `id` values from `data.tasks[].id`, i.e. the deduped,
     published-preferred row ids from step 2 — never `documentId`.

   Named `hideTasks`, not `excludeTasks`, so no reader confuses it with `exclude`: the two params
   share no prefix, no value grammar, and no target list.

7. **Tests** — create `tests/event/day-sheet.js`, required into the shared suite (global `strapi`,
   no `setupStrapi` call). Style: `tests/tasks/publish.js` and `tests/event/rsvp.js`. Build your
   own fixtures in `beforeAll` with `strapi.db.query(...).create({ data })` — do not reuse another
   module's rows. `tests/event/eventMock.js` and `tests/tasks/taskMock.js` are plain fixture
   objects (not DB rows); you may spread fields off them, but strip `id`, `confirmed`, and
   `garden` before creating, as `tests/event/rsvp.js:14-22` does.

   Test **through the service**, not over HTTP (Task 6 owns the HTTP tests):
   `const sheetSvc = () => strapi.service('api::volunteer-day.day-sheet');`

   Also add at the top:

```js
const STANDING_UID = 'api::day-sheet-standing-task.day-sheet-standing-task';
const resetStandingList = async () => {
  const row = await strapi.documents(STANDING_UID).findFirst();
  if (row) await strapi.documents(STANDING_UID).delete({ documentId: row.documentId });
};
```

   `tests/tasks/standing-tasks.js` runs before you in the shared suite — **always call
   `resetStandingList()` (or `replaceList(...)`) in the `beforeEach` of any describe whose
   assertions depend on the standing list.**

   Cover:
   - **AC6** — after `resetStandingList()`, `assemble(eventId)` → `standing` is exactly the five
     documented defaults in the documented order, every `note` is `null`,
     `meta.standingSource === 'default'`, `meta.standingCount === 5`.
   - **AC7** — after `strapi.service(STANDING_UID).replaceList([A,B,C])`, `assemble(eventId)` →
     those three titles in component-array order, `meta.standingSource === 'single-type'`.
   - **AC8** — every `standing[i].key` matches `/^[0-9a-f]{8}$/`, and calling `assemble` twice
     yields identical keys for the same titles.
   - **AC9** — create four tasks on the event with priorities `Low, High, Normal, High` **in that
     creation order** (so their numeric ids ascend in that order). `assemble().tasks` returns them
     ordered `High, High, Normal, Low`, and the two `High`s are in ascending numeric-`id` order.
   - **AC3** — `strapi.contentType('api::garden-task.garden-task').attributes.priority.enum`
     equals `['High','Normal','Low']` and `.default === 'Normal'`; **and** a task created with
     `priority: null` is reported as `'Normal'` in `assemble().tasks`.
   - **AC15** — a task attached to the event created with `publishedAt: null` appears **exactly
     once** in `assemble().tasks`.
   - **AC16** — a task that exists as **both** a draft row and a published row with the same
     `documentId` appears exactly once, and the reported `id` is the **published** row's. Build
     this by creating one row with `strapi.db.query('api::garden-task.garden-task').create` with
     `publishedAt: null`, then a second row with the **same `documentId`**, a different numeric
     id, and a non-null `publishedAt`, both pointing at the event. Assert
     `tasks.filter(t => t.documentId === docId).length === 1` and that the surviving `id` is the
     published row's id. Write AC15/AC16 **first** — they are the most likely to fail.
   - **AC34** — `replaceList([A,B,C])`, then `replaceList([C,A,B])`, then `assemble()` →
     `standing.map(s => s.title)` is exactly `[C.title, A.title, B.title]`, and each item's `key`
     is unchanged from before the reorder (capture the key map first and compare).
   - **AC35** — `replaceList([A,B])`, then `replaceList([{...A, title: 'A renamed'}])`, then
     `assemble()` → exactly one item with title `A renamed`,
     `meta.standingSource === 'single-type'`, and `B.title` appears nowhere in
     `JSON.stringify(sheet)`.
   - Supporting: `assemble()` on a nonexistent id returns `null`; `meta.printPath` is
     `/api/volunteer-days/by-id/<id>/day-sheet.html`; the payload JSON contains no `volunteers`
     key. (Task 6 owns the AC-level versions of the last two.)

   `afterAll(resetStandingList)` so you leave the single type in a known state.

8. Append **one** line to `tests/app.test.js`, after the `require('./tasks/standing-tasks');`
   line Task 4 added:

```js
require('./event/day-sheet');
```

### Done when
- `node --check src/api/volunteer-day/services/day-sheet.js` passes.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` passes; the pre-existing 241 are still
  green and every describe above is green.
- `grep -n "garden_tasks" src/api/volunteer-day/services/day-sheet.js` returns nothing — proving
  the dedupe path is used rather than the relation walk.
- `grep -nE "firstName|lastName|phoneNumber|email|username" src/api/volunteer-day/services/day-sheet.js`
  returns nothing.

---

## Task 6: [BE] Add the two public day-sheet endpoints (JSON + printable HTML)

Depends on: Task 5
Parallel-safe with: Task 3, Task 8, Task 9
Covers: AC5, AC10, AC11, AC12, AC13, AC14, AC17, AC21, AC27, AC28, AC49, AC50, AC51, AC52

### Files
- `/home/user/steward-bank/src/api/volunteer-day/controllers/volunteer-day.js` — modify (add two actions)
- `/home/user/steward-bank/src/api/volunteer-day/routes/01-volunteer-day.js` — modify (add two routes)
- `/home/user/steward-bank/tests/event/day-sheet.js` — modify (append HTTP describes)

### Current state

`src/api/volunteer-day/routes/01-volunteer-day.js` is the repo's custom-route file for this api
(core routes live in `volunteer-day.js`; the `01-` prefix is the convention). Its existing
public entry:

```js
    { // Fetch a single event by NUMERIC id (v5 core findOne is documentId-only;
      // numeric /d/:id URLs are baked into SMS links, so we keep them working here).
      method: 'GET',
      path: '/volunteer-days/by-id/:id',
      handler: 'volunteer-day.getById',
      config: { auth: false },
    },
```

`src/api/volunteer-day/controllers/volunteer-day.js` is
`createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({ ... }))` and its first
action is `getById`, which ends with `return ctx.notFound('Volunteer day not found');` / `return { data: entry };`.
Custom actions here return a value and Strapi uses it as the body verbatim — `getById` returns
`{ data: entry }` and the client sees exactly that. Do not double-wrap.

Task 5 registered `api::volunteer-day.day-sheet` with `assemble`, `renderHtml`, and
`parseSheetParams` (see that file's JSDoc for exact semantics). `tests/event/day-sheet.js` exists
and is already `require`d from `tests/app.test.js` — **append to it, do not recreate it, and do
not touch `tests/app.test.js`.**

### Instructions

1. **Routes** — add two entries to the `routes` array in `01-volunteer-day.js`, immediately after
   the existing `by-id/:id` entry:

```js
    {
      method: 'GET',
      path: '/volunteer-days/by-id/:id/day-sheet',
      handler: 'volunteer-day.getDaySheet',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/volunteer-days/by-id/:id/day-sheet.html',
      handler: 'volunteer-day.getDaySheetHtml',
      config: { auth: false },
    },
```

   Both are `auth: false`, matching the existing `by-id` family. The HTML one **must** be public —
   it is opened in a fresh browser tab, which carries no Authorization header. The JSON one is
   public because its payload is a strict subset of what the HTML endpoint already serves (no PII),
   and because `garden-vue`'s `src/helpers/fetch-wrapper.js:62-65` **logs the user out on any
   401/403** — an unseeded permission would eject managers from the app. Do not add a role grant
   for either; do not add anything to `scripts/seed-content-permissions.js` (Task 3 owns that
   file and adds only the write grant).

   Change nothing else in the route file.

2. **Controller** — add two actions to the object returned by the factory in
   `controllers/volunteer-day.js`. Put them directly after `getById`. Keep them **thin**: parse,
   delegate, translate errors. Neither may query the DB.

```js
    getDaySheet: async (ctx) => {
      const svc = strapi.service('api::volunteer-day.day-sheet');
      const { id } = ctx.params;
      if (!/^[0-9]{1,9}$/.test(String(id))) {
        return ctx.badRequest('Invalid volunteer day id');
      }
      let params;
      try {
        params = svc.parseSheetParams(ctx.query);
      } catch (err) {
        if (err.sheetParamError) return ctx.badRequest(err.message);
        throw err;
      }
      const sheet = await svc.assemble(Number(id), params);
      if (!sheet) return ctx.notFound('Volunteer day not found');
      ctx.set('Cache-Control', 'no-store');
      return { data: sheet };
    },
```

   `getDaySheetHtml` is the same up to the parse, but every failure surface is **plain text with
   no reflection**, and it must set `ctx.status` / `ctx.type` / `ctx.body` directly rather than
   using the Koa helpers (those produce a JSON error envelope):

```js
    getDaySheetHtml: async (ctx) => {
      const fail = (status, text) => {
        ctx.status = status;
        ctx.type = 'text/plain; charset=utf-8';
        ctx.body = text;
      };
      // non-numeric id      -> fail(400, 'Invalid volunteer day id')
      // err.sheetParamError -> fail(400, err.message)
      // sheet === null      -> fail(404, 'Volunteer day not found')
      // success:
      //   ctx.set('Cache-Control', 'no-store');
      //   ctx.type = 'text/html; charset=utf-8';
      //   ctx.body = svc.renderHtml(sheet);
    },
```

   The 400 bodies are **exactly** `Invalid exclude parameter`, `Invalid extra parameter`, or
   `Invalid hideTasks parameter` — nothing else, no HTML, no reflection of the submitted value.
   Plain text means even a hypothetical escaping bug in the renderer cannot be reached through an
   error path.

   Both endpoints set `Cache-Control: no-store` on success (live data; params are per-print).
   `X-Content-Type-Options: nosniff` already comes from the security middleware — do not add it.

   Use `ctx.badRequest()` / `ctx.notFound()` Koa helpers on the JSON endpoint, never thrown
   strings. Use `strapi.log.*` if you log; do not add `console.log`.

   Do not change `getById`, `getByGarden`, or any SMS copy builder.

3. **Tests** — append to `tests/event/day-sheet.js`. Use
   `const request = require('supertest');` and `request(strapi.server.httpServer).get('/api/...')`,
   following `tests/user/user.http.js:38`. Send **no Authorization header** anywhere in this task.
   Reuse (or rebuild in your own `beforeAll`) an event with a garden and a known set of tasks;
   for the hideTasks group you need an event with **exactly three** tasks whose numeric ids you
   captured at creation.

   - **AC5** — `GET /api/volunteer-days/by-id/<id>/day-sheet` with no Authorization header → 200,
     and `res.body.data` has `event`, `standing`, `tasks`, `meta`.
   - **AC10** — a nonexistent id → 404 with `res.body.error.message === 'Volunteer day not found'`.
   - **AC11** — `?exclude=notahex` → 400,
     `res.body.error.message === 'Invalid exclude parameter'`, and
     `expect(res.text).not.toContain('notahex')`.
   - **AC12** — `?exclude=<a valid key from data.standing>` → 200, `data.standing` is the **full**
     list (nothing filtered out — length unchanged) and the submitted key is in
     `data.excludedKeys`.
   - **AC13** — six `extra` params → 400 with `Invalid extra parameter`; five valid ones → 200
     with `data.extras` equal to the five trimmed strings in submitted order.
   - **AC14** — `data.meta.printPath === '/api/volunteer-days/by-id/' + id + '/day-sheet.html'`.
   - **AC17** — `GET .../day-sheet.html` with no Authorization header → 200 and
     `res.headers['content-type']` starts with `text/html`.
   - **AC21** — for an event whose tasks have volunteers assigned and whose `confirmed` list is
     non-empty (create a real user with a distinctive `firstName`, `email`, `phoneNumber`, and
     `username`, link it into `task.volunteers` and `event.confirmed`), assert on **both**
     responses' `res.text`: it contains none of those four values, contains no `"volunteers"`,
     and `data.tasks[0].volunteer_count` is a number.
   - **AC27** — `.../day-sheet.html?exclude=zzz` → 400,
     `res.headers['content-type']` starts with `text/plain`, `res.text === 'Invalid exclude parameter'`.
     A nonexistent id on `.html` → 404, `text/plain`, `res.text === 'Volunteer day not found'`.
   - **AC28** — both responses carry `res.headers['cache-control'] === 'no-store'`.
   - **AC49** — three tasks: `.../day-sheet.html?hideTasks=<id2>` → 200, body contains task 1 and
     task 3 titles and **not** task 2's; `?hideTasks=<id1>,<id3>` leaves only task 2's title;
     omitting the param prints all three.
   - **AC50 — write this one first; it is the AC most likely to be implemented wrong.**
     `?hideTasks=999999` (an id belonging to no task on this event, or to no task at all) →
     **200**, not 400 and not 404, and every task on the event still prints. And
     `?hideTasks=999999,<id1>` → 200 hiding **only** task 1.
   - **AC51** — on **both** endpoints, `?hideTasks=abc` → 400 with message / body exactly
     `Invalid hideTasks parameter` and `expect(res.text).not.toContain('abc')`. Same for
     `?hideTasks=-1`, `?hideTasks=1.5`, `?hideTasks=1,,2`. Thirty-one distinct ids → 400; thirty
     distinct ids → 200.
   - **AC52** — `GET .../day-sheet?hideTasks=<id2>` → 200 with `data.tasks` containing **all
     three** tasks (unfiltered, still in priority order) and `data.hiddenTaskIds` equal to
     `[<id2>]`. Duplicate submitted ids are deduped in the echo; an unknown id is echoed back as
     submitted.

### Done when
- `node --check src/api/volunteer-day/controllers/volunteer-day.js` and
  `node --check src/api/volunteer-day/routes/01-volunteer-day.js` pass.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` passes end to end, pre-existing 241
  included.
- `grep -n "strapi.db.query" src/api/volunteer-day/controllers/volunteer-day.js` shows no new
  occurrences inside `getDaySheet` / `getDaySheetHtml`.

---

## Task 7: [BE] Add the manager-guarded standing-list write endpoint

Depends on: Task 4, Task 6
Parallel-safe with: Task 3, Task 8, Task 9
Covers: AC4, AC29, AC30, AC31, AC32, AC36, AC38

### Files
- `/home/user/steward-bank/src/api/day-sheet-standing-task/controllers/day-sheet-standing-task.js` — new
- `/home/user/steward-bank/src/api/day-sheet-standing-task/routes/01-day-sheet-standing-task.js` — new
- `/home/user/steward-bank/tests/tasks/standing-tasks.js` — modify (append HTTP describes)

**Do not add `src/api/day-sheet-standing-task/routes/day-sheet-standing-task.js`** (a core routes
file). Its absence is what makes AC4 true and what stops a role grant from handing every logged-in
volunteer stock write access to the global list.

### Current state

Task 4 created `src/api/day-sheet-standing-task/services/day-sheet-standing-task.js`
(UID `api::day-sheet-standing-task.day-sheet-standing-task`) exposing `DEFAULT_STANDING_TASKS`,
`computeKey(title)`, `getList()` → `{ items, source }`, and `replaceList(items)` → `{ items, source }`.
`replaceList` throws `Error`s carrying `standingValidationError: true` and one of these **exact**
messages, none of which contains submitted content:

```
standing_tasks must be an array
standing_tasks may contain at most 30 items
Item <n>: title is required
Item <n>: title must be 120 characters or fewer
Item <n>: note must be 500 characters or fewer
Item <n>: note must be a string
```

Task 6 added `GET /api/volunteer-days/by-id/:id/day-sheet.html`.

The repo's manager-authorization pattern is the `garden.managers` relation, not a
users-permissions role — `src/api/location-tracking/controllers/location-tracking.js:18-37`:

```js
if (user.role?.type === 'administrator') { return true; }
const garden = await strapi.db.query('api::garden.garden').findOne({
  where: { id: gardenId }, populate: ['managers'],
});
return (garden?.managers || []).some((manager) => manager.id === user.id);
```

plus the administrator escape hatch at `src/api/garden/controllers/garden.js:46`.
Body-shape precedent, `location-tracking.js:41`: `ctx.request.body?.data || ctx.request.body || {}`.

Custom route file shape, `src/api/location-tracking/routes/01-custom-location-tracking.js`:

```js
module.exports = {
  routes: [
    { method: 'PUT', path: '/location-trackings/:id/confirm-garden', handler: 'location-tracking.confirmGarden' },
  ],
};
```

Plain-object controller precedent (an api with no core controller riding along):
`src/api/email/controllers/email.js` — `module.exports = { async sendWelcome(ctx) { ... } }` with
`if (!sender) { return ctx.unauthorized('...'); }` at the top.

`tests/tasks/standing-tasks.js` exists (Task 4) and is already required from `tests/app.test.js`
— **append to it; do not recreate it and do not touch `tests/app.test.js`.**

### Instructions

1. **Route** — `src/api/day-sheet-standing-task/routes/01-day-sheet-standing-task.js`:

```js
'use strict';

module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/day-sheet-standing-tasks/list',
      handler: 'day-sheet-standing-task.replaceList',
      config: { policies: [], middlewares: [] },
    },
  ],
};
```

   **No `auth: false`** — authentication is required. The `/list` suffix also means the path can
   never collide with the stock single-type path if core routes are ever added.

2. **Controller** — `src/api/day-sheet-standing-task/controllers/day-sheet-standing-task.js`, a
   **plain object controller**, not `createCoreController`, so no core actions come along for the
   ride:

```js
'use strict';

module.exports = {
  async replaceList(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to edit the standing task list');
    }
    if (user.role?.type !== 'administrator') {
      const managedCount = await strapi.db.query('api::garden.garden').count({
        where: { managers: { id: user.id } },
      });
      if (managedCount === 0) {
        return ctx.forbidden('Only garden managers can edit the standing task list');
      }
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const { items, source } = await strapi
        .service('api::day-sheet-standing-task.day-sheet-standing-task')
        .replaceList(body.standing_tasks);
      ctx.set('Cache-Control', 'no-store');
      return {
        data: {
          standing: items,
          meta: { standingSource: source, standingCount: items.length },
        },
      };
    } catch (err) {
      if (err.standingValidationError) return ctx.badRequest(err.message);
      throw err;
    }
  },
};
```

   In words the guard is: **authenticated AND (administrator OR a manager of at least one
   garden).** Because the list is global there is no single garden to check against, so
   "manages ≥ 1 garden" is the closest honest analogue of the per-garden pattern. The `count`
   query on the `managers` relation is the authoritative statement of that rule — implement it
   exactly as written, do not substitute a `findMany` + `.length` or a role check.

   **The users-permissions grant is not the gate.** `replaceList` must be enabled for the
   Authenticated role (Task 3 seeds it) or every manager gets 403 — but that grant is role-wide
   and would otherwise let any logged-in volunteer write. The in-controller check above is the
   real authorization; the grant is only what lets the request reach it.

   Never echo submitted title or note text in any response. `strapi.log.*` only; no `console.log`.

3. **Response shape** is the same `{ standing, meta }` the day sheet returns, so the wizard can
   swap it into place without a refetch. Saving `[]` returns the five defaults with
   `standingSource: 'default'` and `standingCount: 5` — the honest reflection of what will print
   next (Task 4's `replaceList` already returns `getList()`, so this falls out for free; assert it).

4. **Tests** — append to `tests/tasks/standing-tasks.js`. `const request = require('supertest');`,
   `request(strapi.server.httpServer)`.

   **Permission setup is the fiddly part — the helper you would expect to use is broken.**
   `grantPrivileges` in `tests/helpers/strapi.js` references an undefined `_` (lodash is never
   imported) and its call in `app.test.js` passes an array where a UID is expected, so it is a
   silent no-op today. **Do not use it.** Grant directly against the DB in a `beforeAll`:

```js
const ACTION = 'api::day-sheet-standing-task.day-sheet-standing-task.replaceList';

const grantReplaceList = async (roleId) => {
  const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
    where: { action: ACTION, role: { id: roleId } },
  });
  if (!existing) {
    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action: ACTION, role: roleId },
    });
  }
};
```

   If a 200 case unexpectedly 403s, dump the registered actions to find the exact string:
   `console.error((await strapi.db.query('plugin::users-permissions.permission').findMany({ where: { role: authRoleId } })).map(p => p.action).filter(a => a.includes('day-sheet')));`
   and use whatever is actually registered. (Remove the dump before you finish.)

   Fixture set-up:
   - `const authRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });` → `grantReplaceList(authRole.id)`.
   - **There is no `administrator` users-permissions role in this repo's seeds — create one**, and
     **grant it `replaceList` too** (the permission layer runs before your controller, so an
     un-granted admin role 403s before reaching the guard):
     `strapi.db.query('plugin::users-permissions.role').create({ data: { name: 'Administrator', description: 'test', type: 'administrator' } })`.
   - Three users via `require('../user/factory').createUser({...})` (it assigns the default role;
     override `role` afterwards with `strapi.db.query('plugin::users-permissions.user').update(...)`
     for the admin one): (a) a manager of one garden, (b) a user managing no garden, (c) an
     administrator managing no garden.
   - A garden with `managers: [managerUser.id]`.
   - JWTs: `strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id })`, sent as
     `.set('Authorization', 'Bearer ' + jwt)`.
   - Keep using Task 4's `resetStandingList()` helper between assertions that care about state,
     and `afterAll(resetStandingList)`.

   Cover:
   - **AC4** — `GET /api/day-sheet-standing-tasks` (no auth header) → **404** (route not found),
     **not 403**. Also assert
     `expect(strapi.contentType('api::day-sheet-standing-task.day-sheet-standing-task')).toBeDefined()`
     and that its `kind === 'singleType'` — proving the single type exists even though no core
     route does.
   - **AC29** — `PUT /api/day-sheet-standing-tasks/list` with **no Authorization header** → **403**
     (the users-permissions layer rejects the Public role; do **not** assert 401 here) and the
     stored list is unchanged. With `Authorization: Bearer notatoken` → **401**.
   - **AC30** — the no-garden non-admin user → 403 with
     `res.body.error.message === 'Only garden managers can edit the standing task list'`, and the
     stored list is unchanged.
   - **AC31** — the manager of any one garden → 200 and the list is persisted (verify with
     `strapi.service(UID).getList()`); the administrator who manages no garden → 200 as well.
   - **AC32** — table-driven with the manager JWT: `standing_tasks` not an array → 400;
     31 items → 400; `title: ''` → 400 naming the index; `title: '   '` → 400; missing `title` →
     400; a 121-character title → 400; a 501-character note → 400; a non-string note → 400. For
     every case assert the exact `error.message` from the list above **and** that
     `res.text` contains none of the submitted title/note text (use distinctive sentinel strings
     such as `'ZZSENTINELZZ'.repeat(20)` and `expect(res.text).not.toContain('ZZSENTINELZZ')`).
   - **AC36** — `PUT { "data": { "standing_tasks": [] } }` with the manager JWT → 200,
     `data.standing` equal to the five defaults, `data.meta.standingSource === 'default'`,
     `data.meta.standingCount === 5`; then `GET /api/volunteer-days/by-id/<id>/day-sheet.html`
     (build a small event fixture in this file's `beforeAll`) prints those five titles.
   - **AC38** — PUT a new two-item list, then **immediately** `GET .../day-sheet.html` in the same
     test and assert the new titles appear. No restart, no cache flush.
   - Also assert the bare-body form is accepted: `PUT { "standing_tasks": [...] }` (no `data`
     wrapper) → 200.

### Done when
- `node --check` passes on both new files.
- `NODE_ENV=test npx jest tests/app.test.js --runInBand` is green end to end, pre-existing 241
  included.
- `ls src/api/day-sheet-standing-task/routes` lists **only** `01-day-sheet-standing-task.js`.
- `grep -n "createCoreController" src/api/day-sheet-standing-task/controllers/day-sheet-standing-task.js`
  returns nothing.

---

## Task 8: [FE] Add the day-sheet store actions, the print wizard modal, and the EventView entry point

Depends on: —
Parallel-safe with: every `[BE]` task
Covers: AC40, AC41, AC42, AC43, AC44, AC48, AC55, AC56

Repo: **`/home/user/garden-vue`** (branch `claude/printable-garden-checklist-izguqn`). Run
`yarn install` first. **Do not read or edit anything in `/home/user/steward-bank`.** Everything you
need about the API is in this brief and in the "API contract" section of
`/home/user/steward-bank/.claude/specs/printable-day-sheet/design.md` (lines 480–657) — read that
section, not backend source.

### Files
- `/home/user/garden-vue/src/stores/event.store.js` — modify (add one state key + three actions)
- `/home/user/garden-vue/src/components/modals/PrintDaySheetModal.vue` — new
- `/home/user/garden-vue/src/components/modals/index.js` — modify (one export line)
- `/home/user/garden-vue/src/views/EventView.vue` — modify (button + ref + modal instance)

### Current state

`src/stores/event.store.js` — option syntax `defineStore({ id, state, actions })`, with

```js
const baseUrl = `${import.meta.env.VITE_API_URL}/api/volunteer-days`;
```

and, at the top of `actions`:

```js
        handleError(err) {
            const alertStore = useAlertStore();
            alertStore.error(err);
            console.log("Volunteer Error: ", err)
            throw err;
        },
```

Note it **rethrows** — any caller that needs to keep rendering must `try/catch`.

All HTTP goes through `fetchWrapper` from `@/helpers` (`import { fetchWrapper, stripReadOnly } from '@/helpers';`),
which attaches the JWT automatically. **Never use raw `fetch` or axios.**
`src/helpers/fetch-wrapper.js:62-65` **logs the user out on any 401/403** — so the UI must never
offer an action that will 403. That is why the Edit-list controls in Task 9 are gated on the
manager prop.

Strapi v5 returns flat responses. `src/stores/garden-task.store.js:13-17` shows the house
normalization style:

```js
function normalizeGardenTask(task) {
    if (!task) return task;
    if (!Array.isArray(task.volunteers)) task.volunteers = [];
    return task;
}
```

`src/components/modals/index.js`:

```js
export { default as VolunteerDayModal } from './VolunteerDayModal.vue';
export { default as RecurringTemplateModal } from './RecurringTemplateModal.vue';
export { default as SmsCampaignModal } from './SmsCampaignModal.vue';
export { default as VolunteerDayTasks } from './VolunteerDayTasks.vue';
export { default as GardenTask } from './GardenTask.vue';
export { default as PitchProject } from './PitchProject.vue';
```

`src/views/EventView.vue` — `<script setup>`, and at lines 43-46:

```js
const isManager = computed(() => {
  if (!event.value?.garden?.managers || !user.value) return false;
  return event.value.garden.managers.some(manager => manager.id === user.value.id);
});
```

and at lines 146-152 the manager-only block:

```html
          <router-link
            v-if="user && isManager && event?.id"
            :to="`/manage/events/${event.id}/edit`"
            class="bg-custom-green hover:bg-custom-green-dark text-white font-bold py-2 px-4 rounded no-underline"
          >
            Edit Event
          </router-link>
```

with a `showModal` ref + phone-number modal at the end of the template as the modal precedent.

`src/components/modals/PitchProject.vue` is the smallest, cleanest modal in the repo and is your
**template**: `defineProps({ modelValue: { type: Boolean, default: false } })`,
`defineEmits(['update:modelValue'])`, `<Teleport to="#modals">` (that target exists at
`index.html:25`), a backdrop `div` with `@click="close"`, a panel with `@click.stop`, and a
`watch(() => props.modelValue, open => { if (open) { /* reset */ } })`.

Tailwind: `tailwind.config.js` defines `custom-light`, `primary`, `darkest-green`,
`forest.page/panel/border` (→ classes `bg-forest-panel`, `border-forest-border`), `dark-orange`.
Dark mode is class-based (`darkMode: 'class'`). Write these classes **literally** — never build a
class name by string concatenation, or Tailwind will not generate it.

### API contract you are coding against (verbatim; do not go looking for the backend)

**1. `GET ${VITE_API_URL}/api/volunteer-days/by-id/:id/day-sheet`** — public, no auth needed, no
`populate` params honored. 200 body:

```json
{ "data": {
  "event": { "id": 42, "documentId": "k3n1p9c4x0", "title": "Saturday Workday",
             "startDatetime": "2026-08-22T16:00:00.000Z", "canceled": false,
             "garden": { "id": 3, "documentId": "b7q2z8", "title": "Triangle Garden", "slug": "triangle-garden" } },
  "standing": [ { "key": "1a2b3c4d", "title": "Start a fire in the cob oven", "note": null } ],
  "tasks": [ { "id": 91, "documentId": "t7w2m1", "title": "Turn the compost", "priority": "High",
               "type": "Weeding", "status": "INITIALIZED", "overview": "Both bins, front to back.",
               "volunteer_count": 2, "max_volunteers": 4 } ],
  "excludedKeys": [], "hiddenTaskIds": [], "extras": [],
  "meta": { "standingSource": "single-type", "standingCount": 1, "taskCount": 1,
            "generatedAt": "2026-08-21T14:03:00.000Z",
            "printPath": "/api/volunteer-days/by-id/42/day-sheet.html" }
} }
```

- `standing` is **always the full list** — never pre-filtered. `tasks` likewise.
- `key` is a content hash, 8 lowercase hex chars. It is **not** a database id and is not stable
  across a title edit.
- `priority` is always one of `"High" | "Normal" | "Low"`.
- `garden` may be `null`.
- No `volunteers` array, no names/phones/emails.
- 404 body: `{ "data": null, "error": { "status": 404, "message": "Volunteer day not found" } }`.

**2. `GET ${VITE_API_URL}/api/volunteer-days/by-id/:id/day-sheet.html`** — public, returns a
standalone printable HTML document. You never fetch this; you only build its URL and
`window.open` it. Query params:
- `exclude=<key>,<key>` — comma separated 8-hex keys; **omit the param entirely when empty**.
- `hideTasks=<id>,<id>` — comma separated numeric task ids; **omit when empty**.
- `extra=<line>` — one repeated param per line, `encodeURIComponent`'d; **omit when empty**.

**3. `PUT ${VITE_API_URL}/api/day-sheet-standing-tasks/list`** — auth required, used only by
Task 9. Request `{ "data": { "standing_tasks": [ { "title": "...", "note": null } ] } }`.
200 body `{ "data": { "standing": [ {key,title,note} ], "meta": { "standingSource": "...", "standingCount": n } } }`.

**Calls key on numeric `id`** (`event.id`, `task.id`) throughout — never `documentId`. The route
`/d/:id` in this app already carries the numeric id.

### Instructions

1. **`src/stores/event.store.js`** — add to `state`:

```js
        daySheet: {},
```

   and three actions (place them after `findById`):

```js
        async fetchDaySheet(id) {
            return fetchWrapper.get(`${baseUrl}/by-id/${id}/day-sheet`)
                .then(res => {
                    const data = res?.data ?? {};
                    // Defensive normalization — the view indexes these unconditionally.
                    if (!Array.isArray(data.standing)) data.standing = [];
                    if (!Array.isArray(data.tasks)) data.tasks = [];
                    this.daySheet = data;
                    return data;
                })
                .catch(this.handleError);
        },
        daySheetPrintUrl(id, { excludeKeys = [], hiddenTaskIds = [], extras = [] } = {}) {
            // Returns a string. Performs NO fetch.
            const parts = [];
            if (excludeKeys.length) parts.push(`exclude=${excludeKeys.join(',')}`);
            if (hiddenTaskIds.length) parts.push(`hideTasks=${hiddenTaskIds.join(',')}`);
            extras.forEach(line => parts.push(`extra=${encodeURIComponent(line)}`));
            const qs = parts.length ? `?${parts.join('&')}` : '';
            return `${baseUrl}/by-id/${id}/day-sheet.html${qs}`;
        },
        async saveStandingTasks(items) {
            return fetchWrapper.put(`${import.meta.env.VITE_API_URL}/api/day-sheet-standing-tasks/list`,
                                    { data: { standing_tasks: items } })
                .then(res => {
                    const standing = Array.isArray(res?.data?.standing) ? res.data.standing : [];
                    this.daySheet = { ...this.daySheet, standing };
                    return res.data;
                })
                .catch(this.handleError);
        },
```

   Do **not** encode the `exclude` / `hideTasks` values — they are hex and digits, and encoding
   the comma separator would obscure the wire format. Do encode each `extra` line.
   `daySheetPrintUrl` must be synchronous and side-effect-free; it is called on every render of
   step 2.

2. **`src/components/modals/PrintDaySheetModal.vue`** — new. `<script setup>`.

   Props:

```js
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  eventId: { type: [Number, String], required: true },
  isManager: { type: Boolean, default: false },  // used by Task 9; accept it now
});
const emit = defineEmits(['update:modelValue']);
```

   Local ephemeral state — **all of it plain refs, none of it persisted anywhere ever**:

```js
const step = ref(1);                 // 1 = Review, 2 = Print
const skippedKeys = ref([]);         // standing keys skipped on THIS sheet
const hiddenTaskIds = ref([]);       // numeric task ids hidden from THIS sheet
const extras = ref([]);              // one-off lines for today
const extraDraft = ref('');
const loading = ref(false);
```

   `const eventStore = useEventStore(); const { daySheet } = storeToRefs(eventStore);`

   **Load exactly once per open (AC41).** One `watch` on `modelValue`, no `onMounted` fetch:

```js
watch(() => props.modelValue, async (open) => {
  if (!open) { resetEphemeral(); return; }
  resetEphemeral();
  loading.value = true;
  try { await eventStore.fetchDaySheet(props.eventId); }
  catch (e) { /* store already alerted via handleError, which rethrows */ }
  finally { loading.value = false; }
});
```

   `resetEphemeral()` sets `step = 1`, `skippedKeys = []`, `hiddenTaskIds = []`, `extras = []`,
   `extraDraft = ''`. **Closing the modal discards all ephemeral state so reopening starts clean
   (AC44, AC56).** Nothing in this list has ever been written anywhere.

   Render `daySheet.tasks` **in the order the API returned them**. The frontend must **not**
   re-sort — priority ordering is the server's contract. No `.sort(` anywhere in this file.

3. **Step 1 — Review.** Two clearly separated sections with distinct headings.

   **Section heading `Every workday`** — one row per `daySheet.standing` item showing `title` and,
   when present, `note`. Each row has one button:
   - not skipped → label **`Skip on this sheet`**, outline-X icon (an inline SVG `<path d="M6 18L18 6M6 6l12 12" />` like `PitchProject.vue`'s close button).
   - skipped → the row **stays visible**, struck through (`line-through`), and shows
     **`Undo skip`**. Nothing feels deleted.
   Toggling pushes/removes the item's `key` in `skippedKeys`. **This issues no network request.**

   Below the list: one text input bound to `extraDraft` plus an **`Add line`** button that pushes
   `extraDraft.trim()` onto `extras` and clears the draft. Client-side limits, matching the server
   exactly: **max 5 lines**, **max 120 characters each**; a whitespace-only draft is ignored.
   When `extras.length >= 5` disable the button and show a short note that five is the limit
   (AC43's "a sixth line is refused client-side"). Each added line renders with its own remove
   control. **No network request.**

   **Section heading `Today's tasks`** — one row per `daySheet.tasks` item showing `title`, the
   priority **word** (e.g. `High priority`), `type`, and `overview` as read-only content. One
   button per row:
   - not hidden → **`Hide from sheet`**, crossed-out-eye icon.
   - hidden → the row **stays in the list**, struck through and dimmed (`line-through opacity-60`),
     tagged `Hidden from this sheet`, and the button flips to **`Show on sheet`**.
   Toggling pushes/removes the task's numeric `id` in `hiddenTaskIds`. The task itself is untouched
   in the database. **No network request** (AC55).

   A **`Next`** / **`Continue to print`** button moves to `step = 2`.

4. **Step 2 — Print.** A summary counting only what will actually print, e.g.
   `5 standing lines, 1 extra, 3 of 4 tasks` — computed as
   `standing.length - skippedKeys.length`, `extras.length`, and
   `tasks.length - hiddenTaskIds.length` of `tasks.length`. Then an **`Open print sheet`** button:

```js
const printUrl = computed(() => eventStore.daySheetPrintUrl(props.eventId, {
  excludeKeys: skippedKeys.value,
  hiddenTaskIds: hiddenTaskIds.value,
  extras: extras.value,
}));
const openPrintSheet = () => { window.open(printUrl.value, '_blank', 'noopener'); };
```

   Render the URL as the `href` of the button/anchor as well, so it is inspectable in DevTools.
   The new tab shows the plain sheet and the user presses Cmd/Ctrl-P — **there is no JS on the
   print page and none is wanted.** Offer a **`Back`** button returning to step 1 with all
   ephemeral state intact.

5. **Styling (AC48).** Modal chrome uses **only** these existing Tailwind tokens:
   `bg-custom-light`, `dark:bg-forest-panel`, `border-forest-border`, `text-darkest-green`,
   `bg-primary` for secondary actions, `bg-dark-orange` for primary/destructive-adjacent actions,
   plus neutral utilities (`text-white`, `rounded`, `px-4`, `line-through`, `opacity-60`, …).
   **Introduce no arbitrary values — no `bg-[#...]`, no `text-[#...]`, no `border-[#...]`.**
   Follow `VolunteerDayModal.vue` and the modal block at `EventView.vue:219-239` for dark-mode
   pairing; every surface and text colour needs a `dark:` counterpart so the modal is legible with
   `darkMode: 'class'` on. None of this touches the printed sheet, which has no branding at all.

6. **`src/components/modals/index.js`** — append one line:

```js
export { default as PrintDaySheetModal } from './PrintDaySheetModal.vue';
```

7. **`src/views/EventView.vue`**:
   - Import: `import { PrintDaySheetModal } from '@/components/modals';`
   - Add `const showPrintDaySheet = ref(false);` next to the existing `showModal` ref.
   - Wrap the existing `Edit Event` `router-link` and a new **`Print day sheet`** `<button>` in a
     `<div class="flex gap-2">`, keeping the **same** guard on both:
     `v-if="user && isManager && event?.id"` (AC40). The button sets
     `showPrintDaySheet = true`.
   - Add the modal instance next to the existing phone-number modal at the end of the template:

```html
      <PrintDaySheetModal
        v-model="showPrintDaySheet"
        :event-id="event?.id"
        :is-manager="isManager"
      />
```

   Change nothing else in this view. Add no route to `src/helpers/router.js`.

8. Errors go through the store's `handleError` → `useAlertStore().error(err)`. Do not add a second
   alert path in the modal; just `try/catch` around store calls so a rethrow does not break render.

### Done when
- `yarn install` has been run in `/home/user/garden-vue`.
- `npx eslint src/stores/event.store.js src/components/modals/PrintDaySheetModal.vue src/components/modals/index.js src/views/EventView.vue --no-fix` is clean.
- `yarn build` succeeds.
- `grep -nE '(bg|text|border)-\[#' src/components/modals/PrintDaySheetModal.vue` returns nothing.
- `grep -n '\.sort(' src/components/modals/PrintDaySheetModal.vue` returns nothing.
- `grep -nE 'fetchWrapper\.(post|put|delete)' src/components/modals/PrintDaySheetModal.vue`
  returns nothing (Task 9 adds the single write call, and it goes through the store).
- Browser check against `yarn dev` here + `yarn develop` in the backend, logged in as a manager of
  the event's garden, DevTools open:
  - **AC40** the button appears only for a manager; **AC41** opening the modal issues exactly one
    `GET .../by-id/<id>/day-sheet` and tasks render in the received order.
  - **AC42** skipping a row strikes it through and the step-2 URL gains that `key` in `exclude`;
    undo removes it. **AC55** hide/show does the same for `hideTasks=<id>`. **AC43** adding
    `bring the wheelbarrow back` yields `extra=bring%20the%20wheelbarrow%20back` (or the
    `+`-encoded equivalent) and a sixth line is refused.
  - **AC44 / AC56** the Network tab shows **zero** non-GET requests across a full
    skip / hide / extra / print cycle, and closing + reopening the modal clears skips, hidden ids,
    extras, and the step — the regenerated URL carries no `hideTasks` param.
  - **AC48** toggle dark mode and confirm legibility.

---

## Task 9: [FE] Add manager-only Edit-list mode to the print wizard

Depends on: Task 8
Parallel-safe with: every `[BE]` task
Covers: AC45, AC46, AC47, AC57

Repo: **`/home/user/garden-vue`**. **Do not read or edit anything in `/home/user/steward-bank`.**

### Files
- `/home/user/garden-vue/src/components/modals/PrintDaySheetModal.vue` — modify

### Current state

Task 8 built this modal with: props `modelValue`, `eventId`, `isManager`; refs `step`,
`skippedKeys`, `hiddenTaskIds`, `extras`, `extraDraft`, `loading`; a single `watch` on
`modelValue` that calls `eventStore.fetchDaySheet(props.eventId)` exactly once per open and
resets all ephemeral state; an `Every workday` section with per-row **`Skip on this sheet`** /
**`Undo skip`** controls; a `Today's tasks` section with per-row **`Hide from sheet`** /
**`Show on sheet`** controls; and a step-2 print summary + `Open print sheet`.

Task 8 also added `eventStore.saveStandingTasks(items)`, which
`PUT`s `${VITE_API_URL}/api/day-sheet-standing-tasks/list` with body
`{ data: { standing_tasks: items } }`, merges `res.data.standing` into `this.daySheet.standing`,
and returns `res.data` (shape
`{ standing: [{key,title,note}], meta: { standingSource, standingCount } }`). It routes failures
through the store's `handleError`, which alerts **and rethrows**.

### Instructions

1. **Add an `Edit list` toggle** rendered directly above the `Every workday` block, and rendered
   **only when `props.isManager` is true** (AC45). `const editMode = ref(false);` plus
   `const draftList = ref([]);`

   `props.isManager` is the existing `isManager` computed from `EventView.vue:43-46` — managers of
   *this* event's garden. It is **sufficient but not necessary** for the backend guard (managing
   this garden ⇒ managing ≥ 1 garden), so the UI never offers an action that will 403. This
   matters: `src/helpers/fetch-wrapper.js:62-65` **logs the user out on any 401/403**. It is
   under-inclusive — a manager of a *different* garden sees the list but no Edit toggle. That is
   accepted. **Do not build a new "manages any garden" signal for this feature.**

2. **Entering edit mode** copies the loaded list into a draft:
   `draftList.value = (daySheet.value.standing || []).map(i => ({ title: i.title, note: i.note ?? '' }));`
   Never mutate `daySheet.standing` in place.

   Turning edit mode on must **visibly change the block**:
   - A **persistent banner** with class `bg-dark-orange` (plus `text-white`) reading exactly:
     `You're editing the shared standing list — changes apply to every garden and every future sheet`.
     It appears **only** in edit mode.
   - Inline text inputs bound to each draft row's `title` and `note`.
   - A **trash** button per row labelled **`Delete from the list`** (icon: trash; the label must
     appear as visible text or an `aria-label`/`title` containing that exact string). Deleting
     **removes the row from the list outright** — a visible structural difference from the
     ephemeral controls, which strike through and stay in place.
   - Up / down reorder buttons per row (array splice on `draftList`).
   - An **`Add task`** row that appends `{ title: '', note: '' }`.
   - Explicit **`Save changes`** and **`Cancel`** buttons.

   **While edit mode is on, render the `Skip on this sheet` / `Undo skip` controls `disabled`**
   (keep them visible, add `:disabled="editMode"` plus `disabled:opacity-50 disabled:cursor-not-allowed`)
   so the ephemeral and persistent ideas are never operable at once (AC45, AC57).

3. **Cancel** restores the last-loaded list (`draftList` is simply discarded) and leaves edit mode
   with **nothing saved**. It issues no request.

4. **Save.** Client-side limits mirroring the server: at most **30** rows; each `title` trimmed,
   **1..120** characters; each `note` at most **500** characters, and an empty/whitespace note is
   sent as `null`. Build the payload as
   `draftList.value.map(r => ({ title: r.title.trim(), note: r.note?.trim() ? r.note : null }))`.
   Block the save with an inline message if any title is empty or over-long — do not send a
   request you know will 400.

   **AC47 — saving an empty list requires an explicit confirmation first.** When the payload is
   `[]`, show a confirmation warning stating exactly:
   `This clears the list — sheets will fall back to the five built-in defaults.`
   **before any request is sent.** Use an in-modal confirm step (a small inline panel with
   `Confirm` / `Cancel`), not `window.confirm`. Only after `Confirm` does the PUT go out.
   (This surprising behaviour is real: an empty array clears the curated list, and the next sheet
   prints the five hardcoded defaults again — it does *not* produce an empty section.)

5. **On successful save (AC46):**

```js
try {
  const res = await eventStore.saveStandingTasks(payload);
  // store already merged res.standing into daySheet.standing — do NOT refetch.
  skippedKeys.value = [];
  skipsClearedNote.value = true;
  editMode.value = false;
} catch (e) { /* store alerted and rethrew; stay in edit mode so edits are not lost */ }
```

   - **All ephemeral skips are cleared** — the list may have been re-titled underneath them, and
     the `key` is a content hash that changes when a title changes.
   - Show a one-line note: `Skips cleared — review the list again`.
   - **Issue no second GET.** The modal shows the list returned by the PUT response. Do not call
     `fetchDaySheet` again.
   - Leave `hiddenTaskIds` and `extras` untouched — they are about the day's tasks and today's
     one-offs, not the standing list.

6. **AC57 — the three control families must stay unmistakable.** Do not rename or merge any of
   these; no two may share a verb:

| Control | Scope | Verb on the button | Icon | Persists? |
|---|---|---|---|---|
| Standing skip | this printout, standing list | `Skip on this sheet` / `Undo skip` | outline X | **no** |
| Task hide | this printout, this event's tasks | `Hide from sheet` / `Show on sheet` | crossed-out eye | **no** |
| Standing edit/delete | **every garden, every future sheet** | `Delete from the list` (inside Edit mode) | trash | **yes** |

   The separation is carried by: distinct verbs (skip / hide / delete), distinct icons, the fact
   that the only persistent controls live behind the explicit **Edit list** toggle that disables
   the ephemeral controls while it is on, the `bg-dark-orange` banner that appears *only* in edit
   mode, the two ephemeral families living under different section headings, and their
   opposite-polarity restore verbs (`Undo skip` vs `Show on sheet`).

7. **Reset on close.** Extend Task 8's `resetEphemeral()` to also set `editMode = false`,
   `draftList = []`, `skipsClearedNote = false`, and clear any pending empty-list confirmation.

8. **Styling.** Same token discipline as Task 8: only `custom-light`, `primary`, `darkest-green`,
   `forest-panel`, `forest-border`, `dark-orange` plus neutral utilities, each with a `dark:`
   counterpart. **No arbitrary `bg-[#...]` / `text-[#...]` / `border-[#...]`.** Write class names
   literally; never build them by concatenation.

9. The only network call this task adds is `eventStore.saveStandingTasks(...)`. Do not call
   `fetchWrapper` directly from the component.

### Done when
- `npx eslint src/components/modals/PrintDaySheetModal.vue --no-fix` is clean.
- `yarn build` succeeds.
- `grep -nE '(bg|text|border)-\[#' src/components/modals/PrintDaySheetModal.vue` returns nothing.
- `grep -c 'Skip on this sheet' ...` , `grep -c 'Hide from sheet' ...`, and
  `grep -c 'Delete from the list' ...` each return ≥ 1 on
  `src/components/modals/PrintDaySheetModal.vue` (AC57's grep half).
- `grep -n 'fetchDaySheet' src/components/modals/PrintDaySheetModal.vue` shows exactly one
  occurrence, inside the `modelValue` watcher (AC46's "no second GET").
- Browser check as a manager of the event's garden, DevTools open:
  - **AC45** Edit-list controls render only for a manager; while edit mode is on the skip controls
    are disabled and the "changes apply to every garden" banner is visible.
  - **AC46** after a successful save exactly one `PUT` appears in the Network tab and **no**
    following `GET`; skips are cleared and the note shows.
  - **AC47** attempting to save an empty list shows the fall-back-to-defaults warning **before**
    any request appears in the Network tab.
  - **AC57** the three verbs read as in the table and only `Delete from the list` is reachable
    behind the Edit-list toggle.

---

## Coverage map

Every AC in design.md is claimed by exactly one brief.

| AC | Brief | AC | Brief | AC | Brief |
|---|---|---|---|---|---|
| AC1 | T1 | AC20 | T2 | AC39 | T3 |
| AC2 | T1 | AC21 | T6 | AC40 | T8 |
| AC3 | T5 | AC22 | T2 | AC41 | T8 |
| AC4 | T7 | AC23 | T2 | AC42 | T8 |
| AC5 | T6 | AC24 | T2 | AC43 | T8 |
| AC6 | T5 | AC25 | T2 | AC44 | T8 |
| AC7 | T5 | AC26 | T2 | AC45 | T9 |
| AC8 | T5 | AC27 | T6 | AC46 | T9 |
| AC9 | T5 | AC28 | T6 | AC47 | T9 |
| AC10 | T6 | AC29 | T7 | AC48 | T8 |
| AC11 | T6 | AC30 | T7 | AC49 | T6 |
| AC12 | T6 | AC31 | T7 | AC50 | T6 |
| AC13 | T6 | AC32 | T7 | AC51 | T6 |
| AC14 | T6 | AC33 | T4 | AC52 | T6 |
| AC15 | T5 | AC34 | T5 | AC53 | T2 |
| AC16 | T5 | AC35 | T5 | AC54 | T2 |
| AC17 | T6 | AC36 | T7 | AC55 | T8 |
| AC18 | T2 | AC37 | T4 | AC56 | T8 |
| AC19 | T2 | AC38 | T7 | AC57 | T9 |

Per brief:

- **T1 [BE]** data model — AC1, AC2 (2)
- **T2 [BE]** pure renderer — AC18, AC19, AC20, AC22, AC23, AC24, AC25, AC26, AC53, AC54 (10)
- **T3 [BE]** permission seed — AC39 (1)
- **T4 [BE]** standing-list service — AC33, AC37 (2)
- **T5 [BE]** day-sheet assembly service — AC3, AC6, AC7, AC8, AC9, AC15, AC16, AC34, AC35 (9)
- **T6 [BE]** day-sheet endpoints — AC5, AC10, AC11, AC12, AC13, AC14, AC17, AC21, AC27, AC28, AC49, AC50, AC51, AC52 (14)
- **T7 [BE]** standing-list write endpoint — AC4, AC29, AC30, AC31, AC32, AC36, AC38 (7)
- **T8 [FE]** store + modal core + EventView — AC40, AC41, AC42, AC43, AC44, AC48, AC55, AC56 (8)
- **T9 [FE]** edit-list mode — AC45, AC46, AC47, AC57 (4)

Total 2+10+1+2+9+14+7+8+4 = **57**. No AC is orphaned; no AC is double-owned.

## File-collision map (why the dependency edges exist)

| File | Written by | Notes |
|---|---|---|
| `src/api/volunteer-day/routes/01-volunteer-day.js` | T6 only | never edited concurrently |
| `src/api/volunteer-day/controllers/volunteer-day.js` | T6 only | never edited concurrently |
| `src/api/day-sheet-standing-task/routes/01-day-sheet-standing-task.js` | T7 only | |
| `tests/app.test.js` | T4 (one line), then T5 (one line) | serialized by T5 → T4 dependency |
| `tests/tasks/standing-tasks.js` | T4 creates, T7 appends | serialized by T7 → T4 |
| `tests/event/day-sheet.js` | T5 creates, T6 appends | serialized by T6 → T5 |
| `tests/event/day-sheet-render.test.js` | T2 only | standalone jest file; **not** required from `app.test.js`, which is what keeps T2 parallel with T4/T5 |
| `src/components/modals/PrintDaySheetModal.vue` | T8 creates, T9 modifies | serialized by T9 → T8 |

Shared test-DB note for whoever dispatches: `tests/tasks/standing-tasks.js` runs **before**
`tests/event/day-sheet.js` in the shared `app.test.js` suite and the DB is not reset between
modules. Both briefs require their own `resetStandingList()` in `beforeEach`/`afterAll`; do not
relax that.
