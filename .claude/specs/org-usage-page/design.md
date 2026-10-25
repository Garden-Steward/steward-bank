# Org usage page (read-only SMS usage)
Requested by / date: Cameron, 2026-10-21

## Intent
A garden manager opens **Usage** in the manage sidebar and sees their organization's SMS usage for the current UTC month. The page shows:
- billable units against the 500-unit free tier, clearly labelled as informational (nothing is paused or charged yet);
- a breakdown by garden and by category, plus non-billable system texts shown separately;
- the date the count resets;
- the last few months of history, with October 2026 marked as partial because metering began on 2026-10-21.

Anyone who manages at least one garden in an org can see that org's usage. Strapi administrators can see every org. Nobody else sees the link or the data. Nothing about sending changes.

## Decisions
- **Access.** A user can see an org when they are in `managers` on any row (draft or published) of a garden whose `organization` is that org. This is the same rule `loadMembership` in `garden.js` uses. `role.type === 'administrator'` can see every org. No `organization.managers` field.
- **Org you can't see → 404, never 403.** garden-vue's `fetch-wrapper.js` logs the user out on 401/403. A 404 also avoids revealing that the org exists. A request with no token still gets the users-permissions 403, but the frontend never makes one because `/manage/*` requires auth.
- **What counts.** A **billable** row has `billable=true`, `blocked=false` and `simulated=false`. Only billable rows count toward `units`. Rows with `billable=false`, `blocked=false` and `simulated=false` (mostly `system`) are reported separately in `nonBillable`. Simulated and blocked rows are never shown.
- **Months are UTC.** They come from the ledger's `period`. The reset date is the 1st of the next month at 00:00 UTC, and the frontend shows it as a UTC date.
- **Metering start.** Add `METERING_STARTED_AT: '2026-10-21'` to `config/billing.js`. History never goes back before that month, and that month gets `partial: true`.
- **No garden-dashboard stat card.** The grid already has 4 cards across 4 columns. A fifth card would need its own fetch, and an org-wide number on a single garden's page would mislead. **Out of scope.**
- **Cameron's answers to the open questions (2026-10-21):**
  - One 500 free-tier yardstick for every org, until there are plans.
  - Show the muted non-billable line.
  - Managers of draft-only gardens can see the org.
  - Say "texts", with the footnote about long and picture messages.
- **Also out of scope:** enforcement, `canSend` changes, Stripe, alert emails, viewing a past month's breakdown (history is totals only), CSV export, and the `blockedCount` field.

## API contract
Both endpoints are new and purely additive. They are custom routes in `src/api/organization/routes/01-custom-organization.js`, which sorts ahead of the core `/organizations/:id`. Both are granted to the `authenticated` and `administrator` roles at boot and **not** to Public. The controller does the authorization check. Every response sets `Cache-Control: no-store`. Errors use the `sendError` shape: `{ data: null, error: { status, name, message } }`.

### GET /api/organizations/usage
Lists the orgs the caller can see, with this month's headline number. It drives the nav link and the org picker.

**200:**
```json
{ "data": [
  { "documentId": "abc123", "title": "Acme Gardens", "period": "2026-10", "units": 212, "freeUnits": 500 }
] }
```
- If the caller can see no orgs, the response is still 200 with `"data": []`, never an error.
- Results are sorted by `title` (case-insensitive) with nulls last, then by `documentId`.
- An org appears whether it is published or draft-only. `title` comes from the published row when there is one, otherwise from the draft.
- **401:** sent for an invalid or expired token (this comes from the users-permissions layer).

### GET /api/organizations/:documentId/usage?months=6
The full report for one org.
- `months` sets how many months of history to return, including the current month. The default is 6. The value is clamped to 1–12, and a non-integer falls back to the default.

**200:**
```json
{ "data": {
  "organization": { "documentId": "abc123", "title": "Acme Gardens" },
  "period": "2026-10",
  "resetsAt": "2026-11-01T00:00:00.000Z",
  "freeUnits": 500,
  "enforced": false,
  "meteringStartedAt": "2026-10-21",
  "current": {
    "units": 212,
    "messages": 180,
    "byCategory": {
      "broadcast":     { "units": 120, "messages": 100 },
      "reminder":      { "units": 70,  "messages": 60 },
      "transactional": { "units": 22,  "messages": 20 }
    },
    "nonBillable": { "units": 15, "messages": 15 },
    "byGarden": [
      { "gardenDocumentId": "g1", "title": "North Lot", "units": 150, "messages": 120 },
      { "gardenDocumentId": "g2", "title": "Rooftop",   "units": 0,   "messages": 0 },
      { "gardenDocumentId": null, "title": null,        "units": 2,   "messages": 2 }
    ]
  },
  "history": [
    { "period": "2026-10", "units": 212, "messages": 180, "partial": true }
  ]
} }
```

Field rules:
- `freeUnits` is `config billing.FREE_UNITS`. `enforced` is always `false` in this phase.
- **`byCategory`** always has all three billable keys, with zeros where there is no usage. Billable rows tagged `system` (only possible through an explicit override) are counted in `units` but have no category key.
- **`byGarden`**:
  - It counts billable rows only, and `sum(byGarden.units) === current.units`.
  - It lists every garden currently in the org, even with 0 units.
  - It also lists any other `garden_document_id` that appears in this org's rows. Its title is looked up and is `null` if the garden no longer exists.
  - Rows with no garden id are grouped into one entry with `gardenDocumentId: null`.
  - It is sorted by units descending, then by title.
- **`history`**:
  - It is ordered newest first and always includes the current period.
  - It has one entry per month from the current month back `months-1` months, but stops at the `meteringStartedAt` month.
  - Months with no rows show 0.
  - `partial` is true only for the metering-start month.
- **404** `NotFoundError` "Organization not found" is returned when the org doesn't exist or the caller can't see it. Both cases give the same response.
- **401:** sent for an invalid token.

**Deploy order.** Deploy the backend first. The old frontend never calls these endpoints, so there is no version-skew risk.

## Backend pieces
- **`api::billing.report` service (new; all logic lives here):**
  - `visibleOrgDocumentIds(user)`: returns `'all'` for an admin, otherwise a list of org documentIds.
  - `listForUser(user)`.
  - `getOrgReport(orgDocumentId, { months })`.
  - It uses knex aggregates grouped by `category`, `garden_document_id` and `period`, following the pattern in `usage.js`. It does not loop over orgs or gardens with one query each. It may reuse `cols()` and `num()` by extracting them.
- **`organization` controller:** add two thin actions, `usageList` and `usageReport`. Each reads `ctx.state.user`, calls the service and maps the result to the response contract. The user must be loaded with `role` so the controller can check `role.type`.
- **Route file:** `src/api/organization/routes/01-custom-organization.js`.
- **Bootstrap:** add `api::organization.organization.usageList` and `api::organization.organization.usageReport` to `MEMBER_ACTIONS` in `src/index.js`.
- **Config:** add `METERING_STARTED_AT` to `config/billing.js`.
- **Tests:** add `tests/billing/usage-page.js` and register it in `tests/billing/index.js` `ORDER`, before `org-coverage`.

## Frontend pieces
- **`src/stores/usage.store.js`** (export it from `stores/index.js`):
  - `orgs` holds the list response and is loaded once per session. Add a `loadOrgs({ force })` action.
  - `report` holds the detail response, loaded by `loadReport(documentId, months)`.
  - It calls the API through `fetchWrapper`.
- **Route:** `/manage/usage`, named `manage-usage`, with `requiresAuth`. It shows `orgs[0]`, or the org given in `?org=<documentId>`. When there is more than one org, a picker updates the query string.
- **`ManageLayout.vue`:** add a "Usage" nav item (a simple bar-chart icon) that appears only when `orgs.length > 0`. It is active when the path starts with `/manage/usage`. ManageLayout triggers `loadOrgs()`, the same way it already does `gardensStore.getAll()`.
- **`src/views/UsageView.vue`**, inside `ManageLayout`, styled like `GardensView` (Playfair heading, cream and sage cards, dark-mode variants):
  - **Header:** the org title and "SMS usage, <Month YYYY> (UTC)".
  - **Meter:** "212 of 500 free texts this month" with a progress bar. Past 100% the bar shows full in an amber over-limit style and the label reads "Over the free tier". The copy never says paused, blocked or charged.
  - **Notice**, always shown while `enforced === false`: "For your information only. Nothing is paused or charged yet."
  - **Reset line:** "Resets on November 1 (UTC)", formatted from `resetsAt` in the UTC time zone.
  - **By category:** three rows (Broadcasts, Reminders, Replies & transactional), plus a muted line "Login codes & system texts (not counted): N".
  - **By garden:** a table with title and units. A `null` title reads "Unassigned".
  - **History:** a small table or bar list, newest first. A partial month gets a "Partial: metering began Oct 21" tag.
  - **Copy note:** "units" is shown as "texts". A footnote explains that a long text or picture message counts as more than one.
  - **States:**
    - loading: spinner;
    - empty list: "You don't manage any gardens that belong to an organization" (shown when the user opens the URL directly);
    - 404 on the report: "Organization not found" with a link back to `/manage`.

## Risks & alternatives
- **Draft & publish.** Garden and org each have two rows per document. Always dedupe by `documentId`, and look for managers on either row (the same as `loadMembership`). The ledger already stores documentIds, so no relations are involved.
- **Admin scale.** The coverage backfill can create one org per garden, so an admin's list may be long. Its query cost stays constant because the units come from one grouped query over `period = current`.
- **Alternative rejected:** a single endpoint returning full reports for every visible org. It is wasteful for admins and would change shape when the picker arrives.
- **Alternative rejected:** putting billing fields on `organization` itself. This is ruled out by the P1 rule that billing data stays off `organization`.

## Notes
- **Admins are found by role type.** The backend treats a user as an admin only when `role.type === 'administrator'`; garden-vue's `isAdmin` also matches on the role name. If production's admin role has a different type, admins only see the orgs whose gardens they manage, and the boot grant skips them. Check with `select type, name from up_roles`.
- **Server errors.** A non-404 report error shows "Couldn't load usage right now" with a retry button.
- **When this becomes billing:** `freeUnits` and `enforced` will come from the org's plan instead of a constant.
