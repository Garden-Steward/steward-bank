# Printable Volunteer Day Sheet + Print Wizard
Status: DESIGNED
Requested by / date: cameron@oufp.org — 2026-08-21
Repos: `steward-bank` (backend, base `49f8ceb`) + `garden-vue` (frontend, base `9c51041`), both on branch `claude/printable-garden-checklist-izguqn`.

## Intent

The morning of a workday, a garden manager opens the event page in Garden Steward,
clicks **Print day sheet**, glances over a list of the things that always get done
plus the tasks specifically scheduled for that day, X's out the ones that don't
apply today, optionally types one extra line ("bring the wheelbarrow back from the
lower plot"), and prints. What comes out of the printer is a plain black-on-white
sheet with big type and big empty checkboxes that a volunteer with dirty gloves can
carry around the garden in bright sun and tick off with a pencil. The standing list
itself — the things that are true every workday at every garden — is editable in the
app by garden managers, not just by whoever has a Strapi admin login.

Two things on this sheet must never be confused, and the design keeps them apart
everywhere: **X-ing a row out is ephemeral** (it changes only the sheet being printed
right now and is never written anywhere), while **editing or deleting a standing row
is persistent and global** (it changes what every garden prints from then on).

## Current state

- Volunteer Days are `api::volunteer-day.volunteer-day`
  (`src/api/volunteer-day/content-types/volunteer-day/schema.json:1`). Tasks hang off
  them through `garden_tasks` (`schema.json:40`, `mappedBy: volunteer_day`).
- Garden tasks are `api::garden-task.garden-task`
  (`src/api/garden-task/content-types/garden-task/schema.json:1`). They have
  `title`, `overview`, `status`, `type`, `max_volunteers`, `volunteers` — **no
  priority field**, so there is no ordering signal for a printed list.
- The numeric-id read path already exists and is already public:
  `GET /api/volunteer-days/by-id/:id` → `volunteer-day.getById`
  (`src/api/volunteer-day/routes/01-volunteer-day.js:29-35`, `config: { auth: false }`;
  controller at `src/api/volunteer-day/controllers/volunteer-day.js:17-33`). It uses
  `strapi.db.query(...).findOne({ where: { id }, populate })` because v5's core
  `findOne` keys on `documentId`.
- There is no printable output anywhere in either repo, no concept of a "standing"
  or recurring-every-workday checklist item (`api::recurring-task` is a different
  thing — it generates real `garden-task` rows), and no single types at all in
  `src/api/` today.
- `EventView.vue` (`/home/user/garden-vue/src/views/EventView.vue:43-46`) already has
  an `isManager` computed derived from `event.garden.managers`, and a manager-only
  block at lines 146-152 holding the "Edit Event" link.
- Manager authorization in this codebase is the `garden.managers` relation, not a
  users-permissions role. Established pattern:
  `src/api/location-tracking/controllers/location-tracking.js:18-37` (load garden with
  `populate: ['managers']`, `managers.some(m => m.id === user.id)`),
  `src/api/project/controllers/project.js:62`, plus the administrator escape hatch at
  `src/api/garden/controllers/garden.js:46` (`ctx.state.user.role.type !== 'administrator'`).

Insufficient because: nothing produces paper, nothing orders tasks by importance, and
the "things we do every workday" knowledge lives only in people's heads.

## Design

### D1. Data model changes

**D1a. New component `checklist.standing-task`** — `src/components/checklist/standing-task.json`,
shaped after `src/components/projects/impact-metric.json`:

```json
{
  "collectionName": "components_checklist_standing_tasks",
  "info": { "displayName": "Standing Task", "description": "One line on the every-workday checklist" },
  "options": {},
  "attributes": {
    "title": { "type": "string", "required": true },
    "note":  { "type": "text" }
  }
}
```

No `active` flag, no `sort_order`, no `garden` relation. Order is array order.

**D1b. New single type.** Folder `src/api/day-sheet-standing-task/`, schema at
`content-types/day-sheet-standing-task/schema.json`:

```json
{
  "kind": "singleType",
  "collectionName": "day_sheet_standing_tasks",
  "info": {
    "singularName": "day-sheet-standing-task",
    "pluralName": "day-sheet-standing-tasks",
    "displayName": "Day Sheet Standing Tasks"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "standing_tasks": {
      "type": "component",
      "repeatable": true,
      "component": "checklist.standing-task"
    }
  }
}
```

UID is therefore `api::day-sheet-standing-task.day-sheet-standing-task`. The folder
name / `singularName` is the Strapi-conventional singular of the requested
`day-sheet-standing-tasks`; the plural (and the Content-Manager label) is
"Day Sheet Standing Tasks" as requested. Strapi requires `singularName !== pluralName`,
which is the only reason for the deviation.

`draftAndPublish` is **off** on purpose: a single type with D&P produces a draft row
and a published row, and the read path would have to pick one. Off means exactly one
row, ever.

**Do not create core routes for this API.** The folder gets `content-types/`,
`services/`, `controllers/`, and one custom `routes/01-day-sheet-standing-task.js`
(D3). Omitting the core route file means the stock `GET/PUT/DELETE
/api/day-sheet-standing-tasks` endpoints never exist, so no role grant can ever
accidentally hand every logged-in volunteer write access to the list. The single type
still appears in the Strapi admin Content Manager (admin uses the content-type
registry, not the content API), so admin-side editing continues to work.

**D1c. `priority` on garden-task.** Add to
`src/api/garden-task/content-types/garden-task/schema.json`:

```json
"priority": { "type": "enumeration", "enum": ["High", "Normal", "Low"], "default": "Normal" }
```

Additive and nullable in the DB. Existing rows will read back `null`; every consumer
in this design normalizes `null`/unknown to `"Normal"` at read time. **No backfill
migration** — a `scripts/backfill-task-priority.js` is explicitly optional and out of
scope.

### D2. The assembly service (single source of truth for JSON and HTML)

`src/api/volunteer-day/services/day-sheet.js`, auto-registered as
**`api::volunteer-day.day-sheet`** (Strapi registers one service per file in
`services/`). Exports a factory `({ strapi }) => ({ ... })`.

Responsibilities:

1. `assemble(eventId, { excludeKeys, extras })` → the sheet payload (below). Both
   endpoints call this and nothing else; neither controller queries the DB directly.
   This is the "can never drift" guarantee.
2. `resolveEvent(eventId)` — `strapi.db.query('api::volunteer-day.volunteer-day').findOne({ where: { id: eventId }, populate: { garden: true } })`.
   Numeric id, matching `getById`'s precedent. Returns `null` → controller 404s.
3. `loadTasks(event)` — see D2a.
4. `sortTasks(tasks)` — rank `High=0`, `Normal=1`, `Low=2`; `null`/unknown → 1.
   Tie-break on ascending numeric `id`. Deterministic; relation populate order is not
   relied on.
5. Delegates the standing list to
   `strapi.service('api::day-sheet-standing-task.day-sheet-standing-task').getList()`
   (D3). Never requires another module's files directly.
6. `renderHtml(sheet)` — thin wrapper over the pure renderer in
   `src/api/volunteer-day/services/day-sheet-render.js` (a plain CommonJS module, no
   `strapi` access, `module.exports = { renderDaySheetHtml(sheet) }`). Pure function
   in, string out, so it is unit-testable without booting Strapi.
7. `parseSheetParams(query)` — the shared param validator (D5), used identically by
   both endpoints. Throws a tagged error the controllers translate per content type.

**D2a. Draft/publish handling for tasks (the sharp edge).** `garden-task` has
`draftAndPublish: true`, so in v5 a single logical task can exist as two rows (same
`documentId`, different numeric `id`), and this repo deliberately leaves tasks
unpublished until they leave `INITIALIZED`
(`src/api/garden-task/services/garden-task.js:26-29`). Walking `event.garden_tasks`
from whichever event row the numeric id happened to hit therefore under- or
over-reports. The service does this instead:

1. Resolve the event row by numeric id; take its `documentId`.
2. `strapi.db.query('api::volunteer-day.volunteer-day').findMany({ where: { documentId }, select: ['id'] })`
   → all row ids for that logical event (draft + published).
3. `strapi.db.query('api::garden-task.garden-task').findMany({ where: { volunteer_day: { id: { $in: rowIds } } }, populate: { volunteers: { select: ['id'] } } })`.
4. Dedupe by `documentId`, preferring the row with `publishedAt != null`; fall back to
   the draft row when only a draft exists.
5. Sort per D2.4.

No status filtering — a `FINISHED` task still prints, with its status in the JSON.
(Alternative considered and rejected in Risks.)

**D2b. PII.** The HTML endpoint is unauthenticated and its URL contains an
enumerable numeric id, so **no volunteer PII appears in either payload**: no names, no
phone numbers, no emails, no user ids. Tasks expose `volunteer_count` (integer) and
`max_volunteers` only. `volunteers` is populated solely to count it and is dropped
before the payload is built. The sheet does show garden title, event title, event
date/time, task titles and manager-authored `overview` copy — all of which is already
public through `GET /api/volunteer-days/by-id/:id` and `/volunteer-days/public`.

### D3. The standing list: service, read, and manager-guarded write

`src/api/day-sheet-standing-task/services/day-sheet-standing-task.js`
(UID `api::day-sheet-standing-task.day-sheet-standing-task`) owns all standing-list
logic. Both the day-sheet assembly service and the write controller go through it.

```
DEFAULT_STANDING_TASKS  // exported for tests
computeKey(title)       // stable ephemeral identifier
getList()               // → { items: [{key,title,note}], source: 'single-type'|'default' }
replaceList(items)      // validate + persist whole array, → same shape as getList()
```

**Defaults.** When the single-type row does not exist, or `standing_tasks` is absent,
or it contains zero usable items, `getList()` returns these five, in this order, with
`source: 'default'`:

1. Start a fire in the cob oven
2. Weed pathways
3. Find what needs harvesting and make harvest bundles
4. Clear trash from the triangle garden area
5. Prune back or pull out dead growth

All with `note: null`.

**Read.** `strapi.documents('api::day-sheet-standing-task.day-sheet-standing-task').findFirst({ populate: { standing_tasks: true } })`.
D&P is off, so there is one row and no status juggling. Items whose `title` is missing
or whitespace-only are skipped defensively. If the surviving list is empty → defaults.
(`strapi.db.query(uid).findOne({ populate: { standing_tasks: true } })` is an
acceptable fallback if the documents API proves awkward for single types in 5.36 —
but read and write must use the same API family.)

**`computeKey(title)`** — `sha1(title.trim().toLowerCase().replace(/\s+/g,' ')).slice(0,8)`
(hex, lowercase, Node `crypto`). This is the identifier the wizard sends back in
`exclude`. It is deliberately *content*-derived, not index- or row-id-derived, so:
reordering the list in admin or in the wizard does not shift which row an exclusion
refers to; deleting a row makes its key simply stop matching; editing a row's title
makes the old key stop matching, so the row **prints** rather than silently
disappearing (fail-safe direction). Two rows with identical titles collapse to one key
and are excluded together — acceptable for a list capped at 30 short lines, and noted
in Risks.

**Read access surface: the day-sheet JSON endpoint only.** There is no standalone
`GET /api/day-sheet-standing-tasks`. The wizard is the only consumer and it always has
an event in hand; the `PUT` returns the saved list, so an editor round-trip needs no
extra GET. Minimal surface, one fewer public endpoint to reason about.

**Write: `PUT /api/day-sheet-standing-tasks/list`.**

- Route file `src/api/day-sheet-standing-task/routes/01-day-sheet-standing-task.js`,
  handler `day-sheet-standing-task.replaceList`, **no `auth: false`** (authentication
  required). The `01-` prefix is the repo convention; the `/list` suffix also means the
  path can never collide with the stock single-type path if core routes are added
  later.
- Controller `src/api/day-sheet-standing-task/controllers/day-sheet-standing-task.js`
  is a **plain object controller** (`module.exports = { async replaceList(ctx) {...} }`),
  not `createCoreController`, so no core actions come along for the ride. Thin: guard,
  delegate to the service, return.
- **Guard (stated exactly, because it is the whole point):**

  ```
  const user = ctx.state.user;
  if (!user) return ctx.unauthorized('You must be logged in to edit the standing task list');
  if (user.role?.type !== 'administrator') {
    const managedCount = await strapi.db.query('api::garden.garden').count({
      where: { managers: { id: user.id } },
    });
    if (managedCount === 0) {
      return ctx.forbidden('Only garden managers can edit the standing task list');
    }
  }
  ```

  In words: **authenticated AND (administrator OR a manager of at least one garden).**
  Because the list is global there is no single garden to check against, so "manages
  ≥ 1 garden" is the closest honest analogue of the per-garden pattern at
  `location-tracking.js:30-36`. The `count` query on the `managers` relation is the
  authoritative statement of that rule.
- **The users-permissions grant is not the gate.** `replaceList` must be enabled for the
  `Authenticated` role (D6) or every manager gets 403 — but that grant is role-wide and
  would otherwise let any logged-in volunteer write. The in-controller check above is
  the real authorization; the grant is only what lets the request reach it.

**Whole-list replace semantics.** The request body is the entire desired array; add,
edit, delete, and reorder are all expressed as "here is the new list".

- Body: `{ "data": { "standing_tasks": [ { "title": "...", "note": "..." } ] } }`.
  A bare `{ "standing_tasks": [...] }` is also accepted (`ctx.request.body?.data || ctx.request.body`,
  matching `location-tracking.js:41`).
- `standing_tasks` must be an array → otherwise 400.
- Length cap **30**. Longer → 400.
- Per item: `title` required, string, trimmed, control characters stripped, internal
  whitespace collapsed, resulting length **1..120** → otherwise 400 naming the offending
  **index only** (never echoing the value).
- `note` optional: `null`/`undefined`/`""` → stored as `null`. Otherwise string,
  control characters other than `\n` stripped, max **500** chars → otherwise 400.
  Non-string `note` → 400.
- Unknown keys on an item are ignored.
- **Empty array is allowed and means "clear the curated list"** — which, per the
  fallback rule, makes the next sheet print the five hardcoded defaults again. It does
  *not* produce an empty section. This is surprising enough that the wizard must warn
  before saving an empty list (D7/frontend).
- Persistence: `findFirst` → `strapi.documents(uid).create({ data: { standing_tasks } })`
  if absent, else `strapi.documents(uid).update({ documentId, data: { standing_tasks } })`.
  Component array order is preserved by Strapi as insertion order, which is what makes
  reorder work with no `sort_order` field.
- **Concurrency: last write wins.** No version token, no ETag, no optimistic locking.
  Two managers saving within the same minute means the later save silently discards the
  earlier one. Accepted for a global list of ≤ 30 short lines; recorded as a known
  limitation, not engineered around.
- Response is the same `{ standing, meta }` shape the day sheet returns, so the wizard
  can swap it into place without a refetch.

### D4. The printed HTML

Rendered by `day-sheet-render.js`. Constraints, all non-negotiable:

- **No branding. No logo. No color of any kind.** Pure `#000` on `#fff`. No fills, no
  tints, no grey. The Garden Steward brandbook governs the wizard modal inside the app,
  **not** this document.
- Single self-contained document: `<!DOCTYPE html>`, one inline `<style>` in `<head>`,
  **zero `<script>`**, zero external requests (no webfonts, no images, no CSS links).
  The repo CSP (`config/middlewares.js`, helmet defaults) permits inline styles and
  forbids inline scripts, which matches exactly.
- `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`,
  `<meta name="robots" content="noindex">`, `<title>Day Sheet — {event title}</title>`.
- `@page { size: letter; margin: 0.5in }`.
- Fonts: headings `Charter, Georgia, serif`; body `system-ui, -apple-system, Helvetica, sans-serif`.
- Type scale (never smaller than this, at any density): section heads **18pt bold**,
  task titles **16pt bold**, body/notes **13–14pt**.
- Checkbox: `display:inline-block; width:16px; height:16px; border:2px solid #000;`
  `flex-shrink:0; margin-top:3px;` in a `display:flex; gap:12px; align-items:flex-start`
  row, so long titles wrap beside the box rather than under it.
- Section separators: `border-top: 2px solid #000`. Section head gets `break-after: avoid`;
  every `.item` gets `break-inside: avoid`.
- Screen-only hint line at the top (`.hint`, hidden inside `@media print`): "Press
  Ctrl-P / Cmd-P to print." — there is no JS to auto-open the dialog and none is wanted.

Document structure, in order:

1. **Header** — event title (h1, 18pt bold serif); second line 14pt: garden title,
   then the event date/time formatted in `America/Los_Angeles` via `date-fns-tz`
   (the repo's established zone — `config/helpers/cron-helper.js:128`,
   `src/api/volunteer-day/controllers/VdayHelper.js:8`), e.g.
   "Saturday, August 22, 2026 at 9:00 AM"; then small "Printed <date>". If the event
   is canceled, a plain-text line "THIS EVENT IS CANCELED" in bold caps (no red).
2. **Every Workday** — the standing items that survived `exclude`, in list order,
   followed by the validated `extra` lines in submitted order, rendered identically
   (checkbox + 16pt title). Extras are not visually distinguished; they are just
   additional lines for today. `note` prints under the title at 13pt when present.
3. **Today's Tasks** — the day's tasks in priority order. Each: checkbox, 16pt bold
   title, and a 13pt meta line rendered as plain text — `High priority · Weeding · needs 4`
   — with priority shown as a word, never a color. `overview` prints beneath, truncated
   at 240 chars on a word boundary with a trailing "…". If the event has zero tasks, the
   section prints with the single line "No tasks scheduled for today."
4. **Notes** — heading plus 5 blank ruled lines (`border-bottom:1px solid #000`,
   0.4in apart) for writing on. `break-inside: avoid`.

**Degradation as the day gets busy.** `totalItems = standing(after exclusion) + extras + tasks`.
The server picks one class on `<body>` — no JS, no measurement:

| totalItems | class | effect |
|---|---|---|
| ≤ 10 | `density-normal` | full layout; task overviews shown; 0.30in vertical gap between items |
| 11–18 | `density-compact` | task overviews **dropped**; item gap 0.18in; type sizes unchanged |
| > 18 | `density-dense` | overviews dropped; item gap 0.12in; Notes section omitted; type sizes still unchanged |

Nothing is ever truncated out of the list itself and type never shrinks below the
scale above — past ~18 items the sheet simply flows onto page two, with
`break-inside: avoid` keeping any single task block whole.

**HTML escaping.** Every interpolated value — event title, garden title, standing
titles and notes, extra lines, task titles, overviews, formatted dates — passes through
one `escapeHtml()` that replaces `& < > " '` with `&amp; &lt; &gt; &quot; &#39;`,
ampersand first. Nothing is interpolated into an attribute value, a `<style>` block, a
URL, or an event handler; all user-influenced text lands in element text content only.
Error responses from the HTML endpoint reflect **nothing** back (D5).

### D5. Ephemeral wizard params (shared validator)

Applies identically to both day-sheet endpoints, in `parseSheetParams(query)`.

**`exclude`** — the standing rows dropped from *this* printout.
- Format: comma-separated `computeKey` values, e.g. `?exclude=1a2b3c4d,ff00ab99`.
  Repeated `?exclude=` params are concatenated before splitting.
- Each token must match `/^[0-9a-f]{8}$/`. Any token that does not → **400**.
- Max **30** tokens after dedupe → more is 400.
- Tokens that match no current standing row are **ignored silently** (this is the whole
  point of content-derived keys: the list can change between page load and print, and a
  stale key just means that row prints).
- Absent/empty → nothing excluded.

**`extra`** — one-off lines added for today.
- Format: repeated query key, `?extra=bring%20the%20wheelbarrow%20back&extra=lock%20the%20gate`.
  A single `?extra=...` string is equally valid. Standard percent-encoding of UTF-8
  (`encodeURIComponent` on the client). A nested/object form (`extra[a]=b`) → 400.
- Max **5** lines. Each trimmed, control characters stripped, length 1..120 after
  trimming; empty/whitespace-only entries are dropped rather than erroring. Combined
  length across all lines ≤ 400 chars. Violations → 400.
- Order is preserved.

**Error surfaces (deliberately non-reflective).** Invalid params produce a fixed
message that never contains any part of the input:
- JSON endpoint → Strapi's standard `ctx.badRequest('Invalid exclude parameter')` /
  `ctx.badRequest('Invalid extra parameter')` envelope.
- HTML endpoint → status 400, `Content-Type: text/plain; charset=utf-8`, body exactly
  `Invalid exclude parameter` or `Invalid extra parameter`. Plain text, so even a
  hypothetical escaping bug in the renderer cannot be reached through an error path.

Both endpoints set `Cache-Control: no-store` (live data; params are per-print).
`X-Content-Type-Options: nosniff` already comes from the security middleware.

### D6. Permissions summary

| Route | Route `auth` | Role grant needed | In-controller check |
|---|---|---|---|
| `GET /api/volunteer-days/by-id/:id/day-sheet` | `auth: false` | none | none |
| `GET /api/volunteer-days/by-id/:id/day-sheet.html` | `auth: false` | none | none |
| `PUT /api/day-sheet-standing-tasks/list` | default (required) | `Authenticated`: `api::day-sheet-standing-task.day-sheet-standing-task.replaceList` | admin **or** manages ≥ 1 garden |

Both read endpoints are `auth: false`, matching the existing `by-id` family
(`routes/01-volunteer-day.js:34`). Rationale for the JSON one too: its payload is a
strict subset of what the public HTML endpoint already serves (D2b — no PII), so
requiring auth buys no confidentiality; it would require permission seeding that, if
missed, 403s the wizard; and `fetch-wrapper.js:62-65` **logs the user out** on any
401/403, so an unseeded permission would eject managers from the app. If the user later
wants the JSON authenticated, it is a two-line change plus a seed entry — noted in Risks.

Seeding: add to `scripts/seed-content-permissions.js` `DESIRED.authenticated`:
`'api::day-sheet-standing-task.day-sheet-standing-task': ['replaceList']`. That script's
controller-name derivation (`namespace.split('::')[1].split('.')[1]`) yields
`day-sheet-standing-task`, which is correct. Nothing is added to the `public` block.
**Deploy is not complete until this seed runs against Fly** — the write endpoint 403s
for everyone until then.

### D7. Explicitly out of scope

- Garden + date fallback for locating the event. The sheet is anchored to one Volunteer
  Day by numeric id, full stop.
- Per-garden standing lists, an `active` flag, a `sort_order` field, or any `garden`
  relation on the component.
- Persisting anything the wizard's **X-out** or **extra line** controls do.
- Server-side PDF generation. The browser's print dialog is the whole output pipeline.
- Filtering the day's tasks by status.
- Backfilling `priority` on existing rows.
- Printing from anywhere other than an event page (no "print all this week").
- A standalone public `GET` for the standing list.
- Any change to `getById`, `getByGarden`, or the existing SMS copy builders.

## API contract

Base URL: `${VITE_API_URL}/api`. All three endpoints below are additive; none changes
a shape the current frontend consumes.

---

### 1. `GET /api/volunteer-days/by-id/:id/day-sheet`

Wizard data. **Auth: none** (`config: { auth: false }`). No role grant required.

**Params** — `:id` numeric volunteer-day id (the same id used by `/d/:id` and SMS
links). Non-numeric → 400.

**Query** — optional `exclude`, `extra` per D5. No `populate` is honored or needed; the
server decides what to populate. Unknown query params are ignored.

**200** `Content-Type: application/json`, `Cache-Control: no-store`:

```json
{
  "data": {
    "event": {
      "id": 42,
      "documentId": "k3n1p9c4x0",
      "title": "Saturday Workday",
      "startDatetime": "2026-08-22T16:00:00.000Z",
      "canceled": false,
      "garden": { "id": 3, "documentId": "b7q2z8", "title": "Triangle Garden", "slug": "triangle-garden" }
    },
    "standing": [
      { "key": "1a2b3c4d", "title": "Start a fire in the cob oven", "note": null },
      { "key": "9f0e1d2c", "title": "Weed pathways", "note": "Start at the north gate" }
    ],
    "tasks": [
      {
        "id": 91,
        "documentId": "t7w2m1",
        "title": "Turn the compost",
        "priority": "High",
        "type": "Weeding",
        "status": "INITIALIZED",
        "overview": "Both bins, front to back.",
        "volunteer_count": 2,
        "max_volunteers": 4
      }
    ],
    "excludedKeys": ["ff00ab99"],
    "extras": ["bring the wheelbarrow back"],
    "meta": {
      "standingSource": "single-type",
      "standingCount": 2,
      "taskCount": 1,
      "generatedAt": "2026-08-21T14:03:00.000Z",
      "printPath": "/api/volunteer-days/by-id/42/day-sheet.html"
    }
  }
}
```

Field notes:
- `standing` is **always the full list**, never pre-filtered — the wizard needs every
  row to render its X controls. `excludedKeys` echoes back only the submitted keys that
  survived validation (unknown ones included; the server does not tell you which
  matched). `extras` echoes the normalized lines.
- `key` is the D3 content hash. It is **not** a database id and is not stable across a
  title edit — by design.
- `priority` is always one of `"High" | "Normal" | "Low"`; a `null` column value is
  normalized to `"Normal"` before it leaves the service.
- `id` is numeric (internal); `documentId` is the v5 public string identity. Both are
  returned for event, garden, and tasks. The wizard keys off nothing but `key`; the
  print URL uses the numeric `id`.
- No `volunteers` array, no names, no phones, no emails (D2b).
- `garden` may be `null` if the event has none; the renderer then omits the garden line.
- `meta.standingSource` is `"default"` when the five hardcoded defaults are in play,
  `"single-type"` when the curated list is.

**400** — non-numeric `:id`, or invalid `exclude`/`extra`. Standard Strapi envelope:
`{ "data": null, "error": { "status": 400, "name": "BadRequestError", "message": "Invalid exclude parameter", "details": {} } }`.
The message is one of a fixed set and never contains submitted input.

**404** — no volunteer day with that id:
`{ "data": null, "error": { "status": 404, "name": "NotFoundError", "message": "Volunteer day not found", "details": {} } }`.

**401/403** — not applicable; the route is public.

**Compatibility** — brand new path, additive. Nothing consumes it today.

---

### 2. `GET /api/volunteer-days/by-id/:id/day-sheet.html`

The printable sheet. **Auth: none** (`config: { auth: false }`) — it is opened in a
fresh browser tab, which carries no Authorization header, so this is a requirement, not
a convenience.

**Params/query** — identical to endpoint 1, and parsed by the same
`parseSheetParams()`.

**200** — `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`. Body is
a complete standalone HTML document per D4: one inline `<style>`, no `<script>`, no
external URLs, black on white.

**400** — `text/plain; charset=utf-8`, body exactly `Invalid exclude parameter` or
`Invalid extra parameter`. No HTML, no reflection.

**404** — `text/plain; charset=utf-8`, body exactly `Volunteer day not found`.

**Compatibility** — brand new path, additive.

---

### 3. `PUT /api/day-sheet-standing-tasks/list`

Replace the entire global standing list. **Auth: required.**
Role grant: `Authenticated` → `api::day-sheet-standing-task.day-sheet-standing-task.replaceList`
(must be seeded — D6). Authorization: administrator **or** manager of at least one
garden, enforced in the controller.

**Request** `Content-Type: application/json`:

```json
{ "data": { "standing_tasks": [
  { "title": "Start a fire in the cob oven", "note": null },
  { "title": "Weed pathways", "note": "Start at the north gate" }
] } }
```

A bare `{ "standing_tasks": [...] }` is also accepted. `[]` is valid and clears the
list. Validation per D3 (array, ≤ 30 items, title 1..120 after normalization, note
≤ 500 or null).

**200** `Cache-Control: no-store`:

```json
{
  "data": {
    "standing": [
      { "key": "1a2b3c4d", "title": "Start a fire in the cob oven", "note": null },
      { "key": "9f0e1d2c", "title": "Weed pathways", "note": "Start at the north gate" }
    ],
    "meta": { "standingSource": "single-type", "standingCount": 2 }
  }
}
```

Saving `[]` returns the five defaults with `"standingSource": "default"`,
`"standingCount": 5` — the honest reflection of what will print next.

**400** — body/validation failure. Standard Strapi envelope with one of:
`standing_tasks must be an array`, `standing_tasks may contain at most 30 items`,
`Item <n>: title is required`, `Item <n>: title must be 120 characters or fewer`,
`Item <n>: note must be 500 characters or fewer`, `Item <n>: note must be a string`.
`<n>` is a zero-based index; **no submitted content appears in any message.**

**401** — an Authorization header that is present but invalid/expired:
`{ "data": null, "error": { "status": 401, "name": "UnauthorizedError", "message": "Missing or invalid credentials" } }`.

**403** — two distinct cases, same status:
(a) no Authorization header at all → the users-permissions layer rejects the Public
role with `{"error":{"status":403,"name":"ForbiddenError","message":"Forbidden"}}`;
(b) authenticated but neither administrator nor a manager of any garden → the
controller returns `{"error":{"status":403,"name":"ForbiddenError","message":"Only garden managers can edit the standing task list"}}`.
Implementations must not assume 401 for the anonymous case — Strapi returns 403 there.

**404** — not applicable (single type; absent row is created).

**Compatibility** — brand new path, additive.

---

### Deploy order and skew window

**Backend deploys first and must tolerate the old frontend.** It does:

- Every route above is a new path. No existing response shape changes.
- `priority` is an additive, nullable attribute. The old frontend never sends it; Strapi
  partial-updates leave it untouched, and `stripReadOnly` on the frontend does not trip
  over it. The old event editor and task cards ignore an unknown field.
- The new component and single type add tables via Strapi's boot-time schema sync on
  Fly. No data migration, no downtime step.
- Until `yarn seed:content-permissions` runs against production, endpoint 3 returns 403
  to everyone (fail-closed). Endpoints 1 and 2 work immediately.

If the frontend somehow ships first, the wizard's fetch 404s and the store's
`handleError` surfaces an alert; nothing corrupts. The manager should just not see the
button until the backend is up — but no code depends on that.

## Frontend intent

**Views/stores touched**

- `src/stores/event.store.js` — extended, no new store (nothing is cached long-term and
  the day sheet is event-scoped). Add:
  - state `daySheet: {}`
  - `async fetchDaySheet(id)` → `fetchWrapper.get(`${baseUrl}/by-id/${id}/day-sheet`)`,
    sets `this.daySheet = res.data`, `.catch(this.handleError)` — the existing
    `handleError` at line 38 (alert store + rethrow).
  - `daySheetPrintUrl(id, { excludeKeys, extras })` → returns a URL **string**, performs
    no fetch: `${baseUrl}/by-id/${id}/day-sheet.html` plus
    `exclude=${excludeKeys.join(',')}` when non-empty and one
    `extra=${encodeURIComponent(line)}` per line.
  - `async saveStandingTasks(items)` → `fetchWrapper.put(`${import.meta.env.VITE_API_URL}/api/day-sheet-standing-tasks/list`, { data: { standing_tasks: items } })`,
    merges `res.data.standing` into `this.daySheet.standing`, `.catch(this.handleError)`.
- `src/components/modals/PrintDaySheetModal.vue` — new, exported from
  `src/components/modals/index.js` alongside the existing six.
- `src/views/EventView.vue` — a **Print day sheet** button beside the existing "Edit
  Event" link inside the same `v-if="user && isManager && event?.id"` manager block
  (lines 146-152; wrap the two in a `flex gap-2` container), a `showPrintDaySheet` ref,
  and the modal instance next to the existing phone-number modal at the end of the
  template.

**What the user observes**

*Step 1 — Review.* The modal opens on the event page and loads the sheet. Top block:
**Every workday** — each standing row with its title, optional note, and an **X**
button labeled "Skip on this sheet". Clicking X strikes the row through and swaps in a
small "Skipped — undo" affordance; the row stays visible so nothing feels deleted.
Below the list, one text input plus an **Add line** button appends a one-off line for
today (max 5, 120 chars each, enforced client-side with the same limits the server
enforces; added lines get their own remove control). Second block: **Today's tasks**,
read-only, rendered **in the order the API returned them** — the frontend must not
re-sort, because priority ordering is the server's contract. Each task shows title,
priority word, type, and overview.

*Step 1b — Edit the shared list (managers only).* An **Edit list** toggle above the
standing block. Turning it on visibly changes the block: a persistent banner in
`bg-dark-orange` text reading "You're editing the shared standing list — changes apply
to every garden and every future sheet", inline text inputs for title and note, a
trash button per row, up/down reorder buttons, an **Add task** row, and explicit
**Save changes** / **Cancel** buttons. While in edit mode the X/skip controls are
rendered disabled, so the two ideas are never operable at once. Cancel restores the
last-loaded list and leaves edit mode with nothing saved. Save calls
`saveStandingTasks`, and **on success all skips are cleared** (the list may have been
re-titled underneath them) with a one-line note "Skips cleared — review the list
again". Saving an empty list requires confirming a warning: "This clears the list —
sheets will fall back to the five built-in defaults."

The two concepts stay apart via: different verbs ("Skip on this sheet" vs
"Delete from the list"), different iconography (X-in-outline vs trash), a mode toggle
so only one set is live at a time, and the orange persistent banner that only ever
appears in edit mode.

*Step 2 — Print.* A summary ("5 standing lines, 1 extra, 4 tasks") and an **Open print
sheet** button that does `window.open(url, '_blank', 'noopener')` with the URL from
`daySheetPrintUrl`. The new tab shows the plain sheet; the user presses Cmd/Ctrl-P. The
modal offers **Back** to return to Review and adjust.

Closing the modal discards all ephemeral state (skips, extras, step) — reopening starts
clean.

**Which gate for the manager-only editing UI.** Use the existing `isManager` computed in
`EventView.vue:43-46` (managers of *this* event's garden), passed into the modal as a
prop. It is **sufficient but not necessary**: everyone it admits also passes the backend
guard (managing this garden ⇒ managing ≥ 1 garden), so the UI never offers an action
that will 403. It is under-inclusive — a manager of a *different* garden viewing this
event sees the list but no Edit toggle. That is an acceptable, arguably desirable,
narrowing; do **not** build a new "manages any garden" signal for this feature. If one
is ever wanted, the natural source is a `managedGardenCount` on the auth store populated
from `/api/gardens?populate=managers` (already fetched by `gardens.store.js:17`) — but
that is out of scope here, and the backend remains the authority regardless.

**Styling.** Modal chrome uses existing Tailwind tokens only — `bg-custom-light`,
`dark:bg-forest-panel`, `border-forest-border`, `text-darkest-green`, `bg-primary` for
secondary actions, `bg-dark-orange` for the primary/destructive-adjacent actions — never
arbitrary hex. Dark mode follows `VolunteerDayModal.vue` and the modal block at
`EventView.vue:219-239`. None of this touches the printed sheet, which has no branding
at all.

## Risks & alternatives considered

- **Draft/publish duplication on `garden-task`** is the single most likely bug. This repo
  keeps tasks unpublished while `INITIALIZED` (`garden-task.js:26-29`), so naively reading
  `event.garden_tasks` from one event row either misses unpublished tasks or double-counts
  a task that has both rows. D2a's documentId-dedupe is the mitigation, and AC15/AC16
  test both directions.
- **`documentId` vs `id`.** The whole feature is anchored on numeric id (SMS links), so
  every lookup goes through `strapi.db.query`, never core `findOne`. Both identifiers are
  returned in JSON so no consumer has to guess.
- **Content-derived exclusion keys** trade one failure mode for another: identical titles
  collapse to one key and are skipped together, and a title edit invalidates its key. Both
  fail toward *printing* a line rather than silently dropping the wrong one. Index-based
  `?exclude=0,3` was rejected: a concurrent admin reorder would drop the wrong rows.
  Component row ids were rejected: whole-list replace recreates component rows, so ids are
  not stable across a save.
- **A global list is genuinely global.** Any garden manager's edit changes what *every*
  garden prints, with no audit trail and no per-garden override. The user has accepted this
  knowingly for the current single-org deployment. If gardens outside this org are ever
  onboarded, this must change before onboarding: the component gains a `garden` relation
  (or the storage moves to a collection type keyed by garden) with a global fallback, the
  write guard narrows from "manages ≥ 1 garden" to "manages *this* garden", and the
  day-sheet service resolves the list from the event's garden with the global list as
  backstop. That is a schema + migration change, not a tweak — flag it early.
- **Last-write-wins on save.** Two managers editing simultaneously silently lose one set of
  edits. Accepted; documented in D3.
- **Both read endpoints are public.** This is a deliberate extension of the existing public
  `by-id` route and depends entirely on D2b (no PII) holding. AC21 exists specifically to
  keep it holding as the payload evolves. The alternative — authenticating the JSON
  endpoint — was rejected because it adds a seeding dependency whose failure mode is
  `fetch-wrapper.js:62-65` logging managers out of the app, in exchange for confidentiality
  the public HTML endpoint gives away anyway.
- **The 403-logs-you-out footgun.** Any 401/403 from the write endpoint logs the user out
  of garden-vue. The UI gate (managers only see the Edit toggle) keeps normal users away
  from it; a hand-crafted request still ejects the caller. Not worth changing
  `fetch-wrapper` for this feature, but worth knowing during manual testing.
- **Lifecycles.** None are added. The v5 migration already burned this repo on lifecycles
  firing during schema sync and seeds (`volunteer-day/content-types/volunteer-day/lifecycles.js:8`
  guards on `strapi.isLoaded`). All behavior here lives in explicit services.
- **Single type with no core routes.** Slight novelty for this codebase (no single types
  exist today). Verify at implementation that the API folder loads cleanly with only
  content-types/services/controllers/one custom route — if Strapi 5.36 objects, add a core
  routes file but grant it to **no** role.
- **CSP.** Inline `<style>` is permitted by the repo's helmet config; inline `<script>` is
  not — which is exactly the intended shape. If a future implementer reaches for JS on the
  print page, the CSP will stop them, correctly.
- **Task overview length** is manager-authored and unbounded; the 240-char truncation plus
  the density rules are what keep a chatty garden from producing a six-page sheet.

## Acceptance criteria

**Data model**

AC1. `src/components/checklist/standing-task.json` exists with exactly two attributes:
`title` (string, `required: true`) and `note` (text, optional); collectionName
`components_checklist_standing_tasks`.

AC2. The single type `api::day-sheet-standing-task.day-sheet-standing-task` exists with
`"kind": "singleType"`, `"draftAndPublish": false`, and one repeatable component attribute
`standing_tasks` of type `checklist.standing-task`. It has **no** `garden` relation, no
`active` flag, and no `sort_order` field.

AC3. `garden-task` schema has `priority` as an enumeration of exactly
`["High","Normal","Low"]` with `default: "Normal"`. A garden-task row whose `priority`
column is `null` is reported as `"Normal"` by the day-sheet JSON.

AC4. No core route file exists for `day-sheet-standing-task`; `GET /api/day-sheet-standing-tasks`
returns 404 (route not found), not 403.

**Day sheet JSON**

AC5. `GET /api/volunteer-days/by-id/:id/day-sheet` with **no Authorization header** returns
200 and a body matching the endpoint-1 contract shape (`data.event`, `data.standing`,
`data.tasks`, `data.meta`).

AC6. With no single-type row present, `data.standing` is exactly the five documented
defaults in the documented order, each with `note: null`, and `data.meta.standingSource === "default"`.

AC7. With a single-type row holding three standing tasks, `data.standing` has those three
in component-array order and `data.meta.standingSource === "single-type"`.

AC8. Every entry in `data.standing` has an 8-lowercase-hex-character `key`, and the same
title yields the same key across two separate requests.

AC9. Given tasks with priorities Low, High, Normal, High (created in that order),
`data.tasks` returns them ordered High, High, Normal, Low, with the two Highs in ascending
numeric-`id` order.

AC10. `GET .../day-sheet` for a nonexistent id returns 404 with
`error.message === "Volunteer day not found"`.

AC11. `?exclude=notahex` returns 400 with `error.message === "Invalid exclude parameter"`,
and the response body contains the substring `notahex` **nowhere**.

AC12. `?exclude=<valid key>` returns 200 with the **full** standing list in `data.standing`
(nothing filtered out) and the submitted key present in `data.excludedKeys`.

AC13. Six `extra` params return 400 (`"Invalid extra parameter"`); five valid ones return
200 with `data.extras` equal to the five trimmed strings in submitted order.

AC14. `data.meta.printPath` equals `/api/volunteer-days/by-id/<id>/day-sheet.html`.

AC15. A task attached to the event that has **never been published** (`publishedAt` null)
appears exactly once in `data.tasks`.

AC16. A task that exists as both a draft row and a published row (same `documentId`)
appears exactly once in `data.tasks`, and the reported `id` is the published row's.

**Print HTML**

AC17. `GET /api/volunteer-days/by-id/:id/day-sheet.html` with no Authorization header
returns 200 with `Content-Type` starting `text/html`.

AC18. The response body contains `@page` with `size: letter` and `margin: 0.5in`, contains
`<style`, and contains **no** `<script`, no `<link`, no `src="http`, and no `href="http`.

AC19. The response body contains no color declaration other than black/white: it matches no
`#[0-9a-fA-F]{3,6}` other than `#000`/`#000000`/`#fff`/`#ffffff`, and contains no `rgb(`,
`hsl(`, or named color keywords.

AC20. `?extra=%3Cscript%3Ealert(1)%3C%2Fscript%3E` returns 200 whose body contains
`&lt;script&gt;` and does **not** contain the literal `<script`. Likewise a standing task or
event title containing `<img src=x onerror=1>` is rendered escaped.

**PII**

AC21. For an event whose tasks have volunteers assigned and whose `confirmed` list is
non-empty, the JSON response body contains no volunteer `firstName`, `lastName`, `email`,
`phoneNumber`, or `username` value, and no `volunteers` array; each task instead carries an
integer `volunteer_count`. The same assertion holds for the `.html` response body.

AC22. The body contains the event title, the garden title, and the start date formatted in
`America/Los_Angeles` (e.g. an event at `2026-08-22T16:00:00Z` renders `9:00 AM`, not
`4:00 PM`).

AC23. With `?exclude=<key of standing item 2>`, item 2's title does not appear in the body
while items 1 and 3 do. With an `exclude` key matching nothing, all items appear.

AC24. Submitted `extra` lines appear in the "Every Workday" section, after the standing
items, in submitted order.

AC25. Density degrades on count: with ≤10 total items the `<body>` carries
`density-normal` and at least one task `overview` string appears; with 11-18 it carries
`density-compact` and no task `overview` text appears; with >18 it carries `density-dense`
and the "Notes" heading is absent. Type-size declarations (18pt/16pt/13pt) are identical in
all three.

AC26. Each task block and each checklist item carries `break-inside: avoid` (via a class
whose rule declares it), and every checklist item renders a 16px-square element with
`2px solid #000` border.

AC27. `.../day-sheet.html?exclude=zzz` returns 400 with `Content-Type` starting
`text/plain` and body exactly `Invalid exclude parameter`. A nonexistent id returns 404,
`text/plain`, body exactly `Volunteer day not found`.

AC28. Both day-sheet responses carry `Cache-Control: no-store`.

**Standing-list write**

AC29. `PUT /api/day-sheet-standing-tasks/list` with **no Authorization header** returns 403
(Public role lacks the grant) and the stored list is unchanged. With a malformed/expired
bearer token it returns 401.

AC30. An authenticated user who is in **no** garden's `managers` relation and whose role is
not `administrator` receives 403 with message
`Only garden managers can edit the standing task list`, and the stored list is unchanged.

AC31. An authenticated user who is a manager of **any one** garden (present in that
garden's `managers` relation) receives 200 and the list is persisted. An `administrator`
who manages no garden also receives 200.

AC32. Validation: `standing_tasks` not an array → 400; 31 items → 400; an item with
`title: ""` or `title: "   "` or missing title → 400 naming the index; a 121-character
title → 400; a 501-character note → 400; a non-string note → 400. No 400 message contains
any submitted title or note text.

AC33. A 120-character title and a 500-character note are both accepted (boundary is
inclusive).

AC34. Reorder round-trips: PUT `[A,B,C]`, then PUT `[C,A,B]`, then `GET .../day-sheet`
returns `data.standing` titles in exactly `C, A, B` order, and each item's `key` is
unchanged from before the reorder.

AC35. Delete/edit round-trips: PUT a two-item list, then PUT a one-item list with the first
item's title changed → `GET .../day-sheet` shows exactly one item with the new title,
`standingSource === "single-type"`, and the removed item's title appears nowhere.

AC36. PUT `{ "data": { "standing_tasks": [] } }` returns 200 with `data.standing` equal to
the five defaults and `data.meta.standingSource === "default"`; a subsequent
`GET .../day-sheet.html` prints those five.

AC37. The write is idempotent in identity terms: PUT the same list twice and the single type
still has exactly one row (`strapi.db.query(uid).count()` === 1) with the expected number of
component rows (no orphan accumulation).

AC38. A saved edit is visible on the next render with no restart and no cache flush:
PUT a new list, then immediately `GET .../day-sheet.html` and see the new titles (AC28's
`no-store` is what makes this observable through a browser too).

AC39. `scripts/seed-content-permissions.js` includes
`'api::day-sheet-standing-task.day-sheet-standing-task': ['replaceList']` under
`authenticated` and **not** under `public`.

**Frontend**

AC40. `PrintDaySheetModal` is exported from `/home/user/garden-vue/src/components/modals/index.js`,
and `EventView.vue` renders a "Print day sheet" control only when `user && isManager && event?.id`.

AC41. Opening the modal issues exactly one `GET .../by-id/<id>/day-sheet` and renders the
day's tasks in the received order (no client-side re-sort).

AC42. Clicking X on a standing row strikes it through and, on reaching step 2, the generated
URL contains that row's `key` in the `exclude` param; clicking undo removes it from the URL.
Nothing is sent to the server by either action.

AC43. Adding "bring the wheelbarrow back" produces `extra=bring%20the%20wheelbarrow%20back`
(or `+`-encoded equivalent) in the generated URL, and a sixth line is refused client-side.

AC44. Closing and reopening the modal clears all skips, extras, and the step — no ephemeral
state survives, and none of it was ever POSTed or PUT.

AC45. The Edit-list controls (inline inputs, trash, reorder, Save) render only when the
manager prop is true; while edit mode is on, the skip/X controls are disabled, and the
"changes apply to every garden" banner is visible.

AC46. After a successful save, all ephemeral skips are cleared and the modal shows the
list returned by the PUT response without issuing another GET.

AC47. Attempting to save an empty list surfaces a confirmation warning stating the list will
fall back to built-in defaults before any request is sent.

AC48. Modal markup uses only `tailwind.config.js` tokens (`custom-light`, `primary`,
`darkest-green`, `forest-panel`, `forest-border`, `dark-orange`) — no arbitrary
`bg-[#...]`/`text-[#...]` classes are introduced by this feature — and it renders legibly
in dark mode (`darkMode: 'class'`).

## Verification plan

Backend tests go in `tests/event/day-sheet.js` and `tests/tasks/standing-tasks.js`, each
`require`d from `tests/app.test.js` after the existing requires. They share the one Strapi
instance booted by `tests/helpers/strapi.js`, so any service stub must go through
`tests/helpers/patch.js` (the `afterEach(restoreAll)` in `app.test.js:13-15` handles
teardown). HTTP assertions use `supertest(strapi.server.httpServer)` against `/api/...`
paths, following `tests/user/user.http.js:38`. Fixtures build on `tests/event/eventMock.js`
and `tests/tasks/taskMock.js`; a pure renderer test can `require`
`src/api/volunteer-day/services/day-sheet-render.js` directly with a hand-built sheet
object and no Strapi at all.

| AC | How |
|---|---|
| AC1–AC4 | Unit: read the JSON schema files and assert shape; plus a booted-Strapi assertion that `strapi.contentType('api::day-sheet-standing-task.day-sheet-standing-task')` exists and `strapi.contentType('api::garden-task.garden-task').attributes.priority.enum` matches. AC4 via supertest expecting 404. **Backend-verifiable.** |
| AC5–AC10, AC14 | Supertest against seeded event/garden/task rows created with `strapi.db.query(...).create` in `beforeAll`. AC6 requires deleting any single-type row first; AC7 creates one via `strapi.documents(uid).create`. **Backend-verifiable.** |
| AC11–AC13 | Supertest with crafted query strings; assert status, `error.message`, and `expect(res.text).not.toContain('notahex')`. **Backend-verifiable + contract-level.** |
| AC15–AC16 | DB setup: create one task left unpublished (`publishedAt: null`) and one published via the documents API so both rows exist; then supertest and assert `data.tasks.length` and the returned `id`. This is the AC most likely to fail first — write it early. **Backend-verifiable.** |
| AC21 | Supertest both endpoints for an event with assigned volunteers and confirmed users; assert `res.text` does not contain the seeded user's firstName/email/phone, and that `data.tasks[0].volunteer_count` is a number. **Backend-verifiable.** |
| AC17–AC20, AC22–AC28 | Mostly pure-renderer unit tests (`renderDaySheetHtml(fixture)` → string assertions with regexes for the color and script checks), plus two supertest smoke checks for headers/status. AC19's "no color" check is a regex over the whole body — keep it in the renderer unit test so it runs fast. AC22 needs the event fixture's `startDatetime` fixed to a known UTC instant; no clock control needed, but assert the rendered string literally. AC25 needs three fixtures at 8 / 14 / 22 items. **Backend-verifiable.** |
| AC29–AC31 | Permission matrix — **cannot be done by unit tests alone.** Needs seeded roles: in `beforeAll`, grant `replaceList` to role 1 (Authenticated) using the `grantPrivileges` helper in `tests/helpers/strapi.js:114`, then issue JWTs with `strapi.plugins['users-permissions'].services.jwt.issue({ id })` for (a) a user managing a garden, (b) a user managing none, (c) an administrator-role user. Three supertest calls plus a no-header call. If `grantPrivileges` proves fiddly for a fresh api, an acceptable substitute is asserting the controller guard directly (call the exported handler with a fake `ctx`) **plus** one live supertest for the happy path — but the anonymous-403 case must be exercised over HTTP, because that behavior comes from the middleware, not our code. **Backend-verifiable.** |
| AC32–AC33 | Supertest with a manager JWT, table-driven over the invalid bodies; assert 400 and that the message contains no submitted text. **Backend-verifiable.** |
| AC34–AC38 | Supertest sequences (PUT → PUT → GET), plus a direct `strapi.db.query(uid).count()` and a component-row count for AC37 (DB inspection). AC38 asserts the `.html` body after a PUT in the same test. **Backend-verifiable.** |
| AC39 | Static assertion / grep over `scripts/seed-content-permissions.js`. Separately, **manual**: run `yarn seed:content-permissions` against the develop server and confirm the Authenticated role shows `replaceList` enabled in the admin Roles screen. |
| AC40–AC48 | **UI-observable** — no Vitest harness exists in garden-vue today, so verify in a browser against `yarn dev` (garden-vue) + `yarn develop` (steward-bank) as a manager of the event's garden, with DevTools open. AC41/AC42/AC43 are also **contract-level**: read the actual Network tab request URLs and confirm they match the API-contract section character-for-character (param names, comma separator, percent-encoding). AC44 is verified by confirming the Network tab shows **zero** non-GET requests across a full skip/extra/print cycle. AC45/AC47 are visual + interaction checks. AC48 is a grep of the new `.vue` file for `-\[#` plus a dark-mode toggle in the browser. |

Cross-cutting manual checks that no automated test covers:

- **Actual printing.** Open the `.html` URL in Chrome and Safari, hit Cmd-P, and look at
  the preview: one page for a light day, clean two-page flow for a busy one, nothing
  clipped at the 0.5in margin, checkboxes big enough to tick. Then print one on paper and
  read it outdoors — that is the real acceptance test and it belongs to the user.
- **Deploy order.** After the backend ships to Fly and before the frontend does, load the
  production event page with the old frontend and confirm nothing changed; then hit the
  `.html` URL directly and confirm it renders.
- **Permission seeding on production**, per AC39 — the write endpoint is fail-closed until
  it runs.

## Note to the main thread

This spec spans two repos, adds a content-type + component + enum, introduces the repo's
first single type, and changes the authorization model in a small but real way (a
global-resource write guard that has no per-garden anchor). It is on the gnarly side. The
two places most worth a careful implementer are **D2a (draft/publish task dedupe)** and
**D3 (the manager guard + whole-list replace validation)** — if a lane is going to get
something subtly wrong, it will be one of those two.
