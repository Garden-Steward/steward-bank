# Event Brief + Garden Visit Info
Status: IMPLEMENTED (backend)
Requested by / date: cypress@oufp.org — 2026-10-16
Repos: `steward-bank` (this branch) + `garden-vue` (event page redesign, separate branch).

## Intent

Event pages say almost nothing beyond a title, a date and one blurb. A first-timer
can't tell what happens, what to bring, where to meet or whether it's for them.
Gardens should be able to say these things once and have them show on every event,
and Garden Steward should offer sensible defaults so a new garden's events aren't
empty on day one.

## Model: three layers, resolved at read time

| Layer | Where | Holds | Applies to |
|---|---|---|---|
| Visit info | `garden.visit_info` (`garden.visit-info`) | meeting spot + note, parking/transit, restroom, accessibility, kids/pets | every event at the garden |
| Series brief | `recurring-event-template.brief` (`events.brief`) | what to expect, agenda, bring items, good for, food, duration | every event the template generates |
| Event override | `volunteer-day.brief` (`events.brief`) | same fields; any filled field wins | that one event |

Fallback: when neither the event nor its template has any brief content, the
event gets the Garden Steward **starter** brief for its `type`
(`services/event-brief.js` → `STARTER_BRIEFS`). Starters are never mixed into a
brief a garden has filled in.

Overlay is field by field; lists (`agenda`, `bring_items`) are replaced wholesale,
never concatenated. An all-empty component row (which the admin and the editor
both create) counts as no content.

**Briefs are never copied onto generated events.** `createInstance` still copies
`blurb`/`content`; the brief is read live through the template relation, so an
edit to a template reaches the future instances it has already generated.

Events with no garden get `location_name`, `location_address` and an
`organization` (host) relation.

## API contract — `GET /api/volunteer-days/by-id/:id`

Existing fields unchanged. Added:

- `resolved_brief`: `{ what_to_expect, agenda: [{ time_text, label, detail }], bring_items: [{ label, provided_by: 'volunteer'|'garden' }], good_for, food, duration_text }`. Every key always present; empties are `null` / `[]`.
- `brief_source`: `'event' | 'template' | 'starter'`
- `brief`, `recurring_template.brief`: raw component rows (for editors)
- `garden.visit_info`: cleaned `{ meeting_spot, meeting_note, parking_transit, restroom, accessibility, kids_pets }` or `null` when empty
- `garden.hero_image`, `garden.organization` (`id, documentId, title, url, description` only)
- `organization` (same public fields), `location_name`, `location_address`, `planting`
- `event_tasks`: `[{ id, documentId, title, overview, type, task_status }]`. Deduped across draft/published rows and sorted the same way as the day sheet; `ABANDONED`/`SKIPPED` left off.
- `series`: `null` for events that aren't from a template, else `{ upcoming: [{ id, documentId, title, startDatetime }] (≤3), previous: { id, documentId, title, startDatetime, photo_album_url, featured_gallery } | null }`. Matched on the template's documentId; only published, not canceled, not disabled. `previous` is the most recent earlier instance (within 6) with photos.

Backward compatible: an old frontend ignores the new keys.

## Not in this change

- Manager UI to edit visit info / briefs, and the brief questionnaire.
  Until then, edit in the Strapi admin.
- Lat/lng for no-garden events (address only).
