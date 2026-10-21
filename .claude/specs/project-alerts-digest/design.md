# Project Alerts: Customize, Weekly Digest, beehiiv
Status: DESIGNED
Requested by / date: Cameron (cameron@oufp.org) / 2026-10-16
Combo feature: steward-bank (Strapi v5) + garden-vue (Vue 3 / Pinia)
Base: steward-bank `origin/main` @ 54ca1e3 (project alerts shipped in PR #54, b521fed).
garden-vue `origin/main` @ 396a03f. The alert UI is still only on the unmerged branch
`origin/claude/festive-edison-jluckt` (3e6a79a). That branch is 12 commits behind main.

## Intent
Today someone can ask to be emailed when a new community project is approved in a
zip or city, and they get one email per project, right away. They cannot say what
kinds of projects they care about, cannot see or change their signups in one
place, and cannot ask for a weekly summary instead of an email per project. After
this work, each person (by email, signed in or not) has one set of **Project Alert
preferences**: any number of places (zips and/or cities), the project categories
they care about (or all of them), and how often to hear (right away, a weekly
digest, or never). The weekly digest lists every project approved in their places
and categories that week in one email, never repeats a project they already got,
never goes out twice for the same week, and is not sent when there is nothing
new. Signed-in people manage this from a "Project alerts" page. Signed-out people
manage it from a link in every alert email, with no password. Unsubscribe links
already in people's inboxes keep working. Separately, and only if someone ticks
an explicit box, they are added to the Garden Steward newsletter on beehiiv, with
their places and interests attached so the newsletter can be segmented.
Unsubscribing from one never silently unsubscribes from the other, except through
an explicit "unsubscribe from everything" action.

## Current state

### Backend (steward-bank origin/main)
- `api::project-alert.project-alert`
  (`src/api/project-alert/content-types/project-alert/schema.json`): one row per
  (email, location). Fields: `email`, `scope` enum `city|zip`, `city` (lowercased),
  `zip`, `display_label`, `user` (manyToOne → user), `unsubscribe_token`
  (private), `unsubscribed_at` (private), `welcomed_at` (private). There is no
  per-person record, no categories, and no frequency.
- Routes (`src/api/project-alert/routes/project-alert.js:5-23`): custom only, with
  no core router, so subscriber emails can never be listed over REST.
  `POST /project-alerts` (`auth: false`, IP rate limit of 10/day,
  `middlewares/rate-limit.js`) and `GET /project-alerts/unsubscribe?token=`
  (`auth: false`).
- Controller (`controllers/project-alert.js:6-17`): `optionalUser` decodes a JWT
  if one is present, so a signed-in caller's email is used and linked.
- Service (`services/project-alert.js`):
  - `subscribe` (`:126-184`) finds or creates the location row and reactivates it if
    it was unsubscribed. The welcome email goes out only the first time an address
    signs up for anything (`welcomed_at` checked across rows, `:141-145`). It also
    soft-creates a user account with a 7-day verify link (`accountLink`, `:192-220`).
  - `unsubscribe` (`:223-231`) works per location row, by token.
  - `notifyForProject` (`:238-292`) uses the project's cached `location_city`/
    `location_zip`, or reverse-geocodes through Nominatim
    (`src/utils/reverse-geocode.js`). It **marks `subscribers_notified_at` before
    sending** (`:250-254`), keeps one email per address (a zip match wins over a
    city match, `:266-271`), skips the pitcher (`:273-274`), and sends instantly.
    It ignores category.
- Callers of `notifyForProject`: `api::project.review.sendDue`
  (`src/api/project/services/review.js:124-130`) when an approval's 10-minute undo
  window closes (cron `sendProjectReviewNotifications`, every minute,
  `config/cron-tasks.js:138-149`), and `controllers/verify.js:27-31` (email-verified
  pitch approval). **`subscribers_notified_at` is the single moment a project
  becomes "released to alerts" on both paths.** The digest keys on it.
- Project categorization (`src/api/project/content-types/project/schema.json`):
  `category` is an **enumeration**: `Infrastructure | Art | Event | Education |
  Planting | Community`, default `Community`. This is the only project taxonomy.
  The other taxonomies are not reusable:
  - `api::category` (title/description) is used only by `api::blog` (blog schema
    line 44). It is a blog taxonomy.
  - `api::tag` is a plant tag (relation to `api::plant`).
  - `api::interest` + `api::user-garden-interest` are per-garden volunteer interest
    tags used to target SMS campaigns (e.g. the "Temporary" tag,
    `controllers/user-garden-interest.js:19`). They hold garden membership
    semantics and are not about project types.
- Email goes through the Resend provider (`src/providers/email-resend/index.js`).
  It forwards `to/subject/html/text/cc/bcc/replyTo` only, with **no custom headers**,
  so `List-Unsubscribe` cannot be set today.
- Deploys: Fly `release_command` runs only `pre-migrate-v5-columns.js` and
  `rename-reserved-status-columns.js` (`fly.toml:14`). Strapi schema sync and the
  `src/index.js` bootstrap run on app boot. **Permission seeding
  (`scripts/seed-content-permissions-internal.js`) is NOT run on deploy.** Existing
  role grants in production were set by hand or by bootstrap code.
  `grantAdminProjectPermissions` (`src/index.js:20-42`) copies the authenticated
  role's `api::project.project.*` grants to the Administrator role at boot.
- Cron runs on every app instance (`config/server.js`, `CRON_ENABLED`). Jobs must
  be safe to run concurrently. The repo's compare-and-swap claim pattern is
  `updateMany` with a guarded `where` and a check on `count`
  (`src/api/auth/services/sms-login.js:122-135`).
- An unrelated existing newsletter path: `SmsHelper.saveVolunteerEmail`
  (`src/api/message/controllers/SmsHelper.js:241-265`) adds every SMS volunteer
  who texts an email to a **Mailchimp** list with `status: "subscribed"`. It does
  not ask for consent. It is out of scope here, but it is relevant to the beehiiv
  decision (see Open questions).

### Frontend (garden-vue)
- Branch `origin/claude/festive-edison-jluckt` adds
  `src/components/ProjectAlertSignup.vue` (zip/city segmented control, an email field
  when signed out, success state "You're on the list for X", "Add another place"),
  `src/stores/project-alerts.store.js` (`subscribe`, `unsubscribe`),
  `src/views/ProjectAlertUnsubscribe.vue` (route `/alerts/unsubscribe`, calls the
  API on mount), and wires the card into `ProjectsPublicView.vue`. **It is not
  merged.** Since its merge base, main has changed only `src/helpers/router.js`
  among the files it touches, so a rebase should be close to trivial.
- `src/components/NewsletterSignup.vue` (main) is a static link to
  `https://garden-steward.beehiiv.com/subscribe`, used on `PublicHomeView.vue:368`.
- There is no profile or settings page. The Nav profile menu (`src/components/Nav.vue`)
  has theme options and logout.
- `src/helpers/fetch-wrapper.js:62-65`: **any 401 or 403 while signed in calls
  `logout()`**. It offers only GET, POST, PUT, and DELETE (no PATCH).
- Router guard (`src/helpers/router.js:197-232`): public pages are listed explicitly,
  and `/manage/*` or `meta.requiresAuth` opens the login modal.

### Why it's insufficient
There is no per-person entity, so you can't have "my preferences", categories, or
frequency. Instant-only sending can't produce a digest. Unsubscribe tokens are per
location, so there is no single "manage my alerts" link. No beehiiv integration
exists.

## Design

### 1. Data model

#### 1a. New content type `api::project-alert.project-alert-preference`
This is a second content type inside the existing `project-alert` API folder, so
the service, controller, and routes stay in one module:
`src/api/project-alert/content-types/project-alert-preference/schema.json`,
`collectionName: project_alert_preferences`, `draftAndPublish: false`.
**No core router** (same rule as today: preferences are never listable).

| attribute | type | notes |
|---|---|---|
| `email` | email, required | lowercased, trimmed. One row per address. Enforced in the service (see Risks: no DB unique index). |
| `user` | relation manyToOne → `plugin::users-permissions.user` | **no `inversedBy`**, so the user extension schema is left alone. Set when the address belongs to an account. |
| `frequency` | enumeration `instant \| weekly \| off`, required, default `instant` | Do **not** name this `status` (reserved in v5). |
| `categories` | json | array of project `category` enum values. `[]` means **all categories**. Validated against `strapi.contentType('api::project.project').attributes.category.enum` at write time, so it never drifts from the project schema. |
| `manage_token` | string, private | random UUID. Used for both the manage-preferences link and the "unsubscribe from all project alerts" link. Generated on create. Never rotates automatically. |
| `welcomed_at` | datetime, private | moves here from the location rows. |
| `unsubscribed_at` | datetime, private | audit: when frequency was last set to `off` through an unsubscribe link. |
| `digest_through` | datetime, private | exclusive upper bound of the last digest window this person was **claimed** for (P2). |
| `last_digest_sent_at` | datetime, private | (P2) |
| `newsletter_opt_in_at` | datetime, private | (P3) explicit consent timestamp |
| `newsletter_opt_out_at` | datetime, private | (P3) |
| `newsletter_consent_source` | string, private | (P3) `alert_signup \| manage_page \| digest_footer` |
| `newsletter_state` | enumeration `none \| pending \| active \| unsubscribed \| error`, default `none` | (P3) mirrors beehiiv. Deliberately not `status`. |
| `beehiiv_subscription_id` | string, private | (P3) |
| `beehiiv_sync_needed_at` | datetime, private | (P3) outbox flag |
| `beehiiv_synced_at` | datetime, private | (P3) |
| `beehiiv_last_error` | text, private | (P3) |
| `locations` | relation oneToMany → `api::project-alert.project-alert`, `mappedBy: preference` | |

P3 fields may be added in P3 rather than P1. They are listed here so the shape is
designed once.

#### 1b. `api::project-alert.project-alert` becomes "a location of a preference"
Keep the uid, the table, and every existing column. This preserves every
`unsubscribe_token` already sent. Changes:
- Add `preference`: relation manyToOne → `api::project-alert.project-alert-preference`,
  `inversedBy: locations`.
- Change `displayName` to "Project Alert Location" (admin label only).
- Mark `email`, `user`, and `welcomed_at` as **legacy**. New code reads the address,
  owner, and welcome state from the preference. `email` is still written on new
  rows (a cheap denormalized copy that keeps the backfill and admin views sane).
  Do **not** drop the columns in this project: they are the rollback path.
- A location is active when `unsubscribed_at IS NULL`. Removing a location from
  preferences sets `unsubscribed_at` (soft delete), and adding it back clears it.
  The row and its token are never deleted. An old link to a removed location then
  says "you're unsubscribed" instead of 404.
- Max **10 active locations** per preference (constant, exposed via `/options`).
- Location matching is unchanged: zip is exact 5 digits, city is a lowercased name
  with no state (`normalizeCity`). City ambiguity across states, such as Portland,
  remains a known limitation and is out of scope.

#### 1c. Category taxonomy decision
Reuse the **project `category` enum** as the interest-category taxonomy. It is the
only field that categorizes projects, and every project already has a value
(default `Community`). Do not reuse `api::category`, `api::tag`, or
`api::interest`, for the reasons in Current state. Converting the enum to a
managed collection (an admin-editable category list with relations) is
**explicitly out of scope**. It would migrate every project and change the shape
the FE reads. If the user wants a richer taxonomy, that is a separate feature
(see Open questions).
Matching rule: a project matches a preference when `categories` is empty, or when
it contains `project.category`. A project whose `category` is null (possible on
legacy rows) matches **only** preferences with empty `categories`.

#### 1d. Migration / backfill (P1)
Idempotent bootstrap step in `src/index.js` (the same pattern as `backfillDrafts`,
`src/index.js:101`), named e.g. `backfillProjectAlertPreferences`. It runs after
schema sync on every boot and is a no-op once done:
1. Select `project_alerts` rows with `preference IS NULL`, ordered by id.
2. Group them by lowercased `email`. For each email, find the existing preference
   by email (lowest id if duplicates exist) or create one with:
   - `frequency`: `instant` if **any** of that email's rows has `unsubscribed_at IS NULL`,
     else `off`. This preserves exactly today's behavior: existing subscribers keep
     getting instant emails. They are not silently moved to weekly.
   - `categories`: `[]` (all), which matches today's behavior.
   - `user`: the first non-null `user` among the rows.
   - `welcomed_at`: the earliest non-null `welcomed_at` among the rows. This keeps the
     "welcome once per address" rule.
   - `manage_token`: a new UUID.
3. Link each row's `preference`.
4. Duplicate guard: if more than one preference exists for an email (for example,
   after a boot race), keep the lowest id, move the others' locations onto it, and
   delete the extras. The service's find-or-create must also pick the lowest id.
5. Log the count, as the drafts backfill does. Wrap the step in try/catch so a
   failure never blocks boot.

No raw-SQL pre-boot migration is needed. The changes are purely additive (a new
table, a new FK column), which Strapi schema sync handles.

### 2. Service responsibilities (`api::project-alert.project-alert`, fat)
- `getOrCreatePreference(email, { user })`: find by email, lowest id first.
  Creates with the default frequency (`DEFAULT_FREQUENCY`: `instant` in P1,
  `weekly` from P2 on, pending the open question). Links `user` if missing and the
  emails match.
- `subscribe({ email, zip, city, user, categories?, frequency?, newsletter_opt_in? })`:
  the existing contract, now routed through the preference. It adds or reactivates
  one location. If the preference is `off`, it sets it back to `DEFAULT_FREQUENCY`
  (today, re-signing up reactivates). `categories` and `frequency` are **ignored
  when the caller is not signed in as that email**. A signed-out POST can add a
  place but cannot change someone's frequency or categories. The welcome email logic
  is unchanged, except that it now checks `preference.welcomed_at` and the email
  contains the **manage link**. It enforces the 10-location cap (400).
- `serializePreference(pref, { maskEmail })` produces the shape in the API
  contract.
- `replacePreferences(pref, { frequency, categories, locations })` does full
  replacement with a diff by (scope, normalized value):
  keep matching active rows, reactivate matching inactive rows, soft-delete active
  rows that are missing, and create new rows. Validation errors return
  `{ error, details }`. Transition rule for the digest (P2): moving **from `instant`
  to `weekly`** sets `digest_through = now`, so projects already emailed instantly
  are not repeated in the next digest. Moving from `off` or from a new preference
  to `weekly` leaves `digest_through` unchanged (null means the window starts 7 days
  back).
- `unsubscribeByToken(token)`: first looks for a preference by `manage_token`
  (sets `frequency=off`, `unsubscribed_at=now`, returns `scope: 'all'`), then for a
  location by `unsubscribe_token` (the legacy per-location behavior, returns
  `scope: 'location'`). Both return the owning preference's `manage_token`, so the
  page can offer "manage instead". A location-token holder proved access to the same
  inbox, so this is safe. **Neither path touches the newsletter.**
- `sendManageLink(email)` (P1): if a preference exists for that email, it emails
  that person their manage link. It always returns the same answer whether or not
  the address exists.
- `matchesProject(pref, activeLocations, project)` is a pure function implementing
  the location and category rule. It is shared by the instant and digest paths.
- `notifyForProject(project)`: the existing geocode and **mark-first** behavior,
  unchanged. Recipients become: active locations matching the project's zip or city,
  grouped by preference, filtered to `frequency === 'instant'` and the category
  match, with the zip label beating the city label for the subject. The pitcher is
  still excluded. The footer becomes "Manage alerts" (manage link) + "Unsubscribe"
  (manage_token unsubscribe link). **It still sets `subscribers_notified_at`
  even if there are zero instant recipients.** That timestamp is what the digest
  keys on.
- P2: `api::project-alert.digest` (a new service file, `services/digest.js`) handles the
  weekly send. See section 4.
- P3: `api::project-alert.beehiiv` (a new service file) wraps beehiiv HTTP calls. It is
  the only file that knows beehiiv exists. See section 5.

Controllers stay thin. Each action resolves identity (JWT user, or token) and
calls one service method.

### 3. Permissions and routing
All routes go in `src/api/project-alert/routes/project-alert.js`. There is no core
router in this API, so there is nothing for custom routes to sort ahead of. The
`01-` filename prefix is not needed, but renaming the file to
`01-project-alert.js` is harmless and matches convention.

| route | auth | grant needed |
|---|---|---|
| `GET /project-alerts/options` | `auth: false` | none |
| `POST /project-alerts` (existing) | `auth: false` + rate limit | none |
| `GET /project-alerts/me` | **default auth (JWT required)** | authenticated + Administrator: `api::project-alert.project-alert.findMine` |
| `PUT /project-alerts/me` | default auth | authenticated + Administrator: `api::project-alert.project-alert.updateMine` |
| `GET /project-alerts/manage?token=` | `auth: false` | none (the token is the credential) |
| `PUT /project-alerts/manage?token=` | `auth: false` + rate limit | none |
| `POST /project-alerts/manage-link` | `auth: false` + rate limit | none |
| `GET /project-alerts/unsubscribe?token=` (existing) | `auth: false` | none |
| `POST /project-alerts/unsubscribe?token=` (P2, one-click) | `auth: false` | none |
| `POST /project-alerts/beehiiv-webhook` (P3) | `auth: false`, Svix-signature verified | none |

**Permission seeding (load-bearing):** Production does not run the seed scripts on
deploy, and garden-vue **logs the user out on any 403** (`fetch-wrapper.js:62-65`).
A missing grant would therefore log people out when they open the alerts page. So:
- Add both actions to `DESIRED.authenticated` in
  `scripts/seed-content-permissions-internal.js` (dev and test seeding), **and**
- Add an idempotent, add-only bootstrap step in `src/index.js` that ensures the
  authenticated role has `findMine` and `updateMine`. Then extend
  `ADMIN_MIRRORED_PREFIXES` (`src/index.js:20`) with `'api::project-alert.project-alert.'`,
  so Administrator-role users get them too.

**Status code rule for token endpoints:** a bad, unknown, or missing token returns
**404** (unknown) or **400** (missing), **never 401 or 403**. This keeps a signed-in
user who opens an old email link from being logged out by the fetch wrapper.

### 4. Weekly digest (P2)

**Cron:** `sendWeeklyProjectDigest` in `config/cron-tasks.js`. It is a one-line
delegate to `strapi.service('api::project-alert.digest').sendWeekly()` with a
try/catch (the pattern of `weeklyVacationCheckIn`). Proposed rule `'30 7 * * 4'`,
tz `America/Los_Angeles`: Thursday 07:30 PT, so people can plan weekend workdays.
The schedule is an **open question**. Define it once as a constant, e.g.
`DIGEST_SCHEDULE = { weekday: 4, hour: 7, minute: 30, tz }`, and use it for both
the cron rule and the window math.

**Window:** `sendWeekly({ now = new Date() })` computes
`end` = the most recent scheduled boundary ≤ `now`, in PT. A run that fires late,
or twice, computes the same `end`. For each preference, the window is
`[start, end)` with `start = max(pref.digest_through ?? end − 7d, end − 14d)`.
The 14-day floor means a missed week (outage) is caught up once, and a long-dormant
row doesn't dump months of projects.

**Qualifying projects:** `subscribers_notified_at ∈ [start, end)` AND
`review_status = 'APPROVED'` at send time (a project rejected or archived after
release drops out) AND `matchesProject(pref, locations, project)` AND the
recipient is not the pitcher (`created_by.email` / `submitter_email`). Projects that
could not be geocoded (no city and no zip) never qualify, the same as instant today.
Load the candidate projects once per run (window `[end − 14d, end)`, populate
`garden`, `created_by`, `hero_image`), then filter per preference in JS. `categories`
is JSON, so do not filter it in SQL.

**Recipients:** preferences with `frequency = 'weekly'` and at least one active
location.

**Idempotency (no double sends across restarts, overlapping runs, or multiple
machines):** for each preference, read `digest_through` (call it `prev`), then
**claim** with
`updateMany({ where: { id, frequency: 'weekly', digest_through: prev (or $null) }, data: { digest_through: end } })`.
Continue only if `count === 1`. This is a compare-and-swap, as in
`sms-login.js:122`. Then compute the projects and send. On success, set
`last_digest_sent_at`. The policy is **at-most-once**: a crash or a provider error
after the claim means that person misses that week's digest rather than getting it
twice. This matches "mark first" in `notifyForProject:250`. Log failures with the
preference id, never the email.

**Dedup with instant:** a project reaches a person through one channel only.
`notifyForProject` sends only to `instant`, and the digest only to `weekly`. Moving
from instant to weekly sets `digest_through = now` (section 2), so the next digest
starts after the last instant email.

**Empty digest:** if no projects qualify, **send nothing**. The claim still
advances `digest_through` to `end`, which is correct because the window was empty.
(Open question: should a "nothing new this week" email be sent? Recommendation: no.)

**Pacing:** send sequentially with a small delay between messages (target ≤ 2/s;
Resend's default API rate limit is low, so verify the account's limit). Retry once
on a 429. The cron is weekly, so a long run is fine. The claim makes overlapping
runs safe.

**Cap:** at most 20 projects per email, newest first, followed by "See all N new
projects" linking to `/projects`.

**Email outline** (built by a pure `digestEmail(pref, projects, { manageUrl, unsubscribeUrl })`
so it can be unit-tested):
- Subject: `3 new projects near Oakland and 94607` (singular for 1; when there are
  more than 2 places, `near Oakland, 94607 and 2 more places`).
- Preheader: the first project title.
- Intro: "New community projects approved this week in the places you follow."
- Grouped by matched place label (a zip label wins over a city label, as instant does).
  Each project card shows the hero image (if any), title, garden title, a category
  chip, `short_description`, and a "See the project" link (`projectUrl`).
- Footer: "You're getting this weekly digest for: Oakland, 94607 · Categories:
  Planting, Art (or 'all project types')", then **Manage alerts** (`/alerts?token=`),
  **Switch to instant emails** (the same link), **Unsubscribe** (`/alerts/unsubscribe?token=`).
  If P3 is live and the person has not opted in, add one line: "Want our newsletter
  too?" linking to the manage page. **It never auto-subscribes.** Add the
  organization's postal address if the user confirms one (see Open questions).
- Headers: `List-Unsubscribe: <https://<api-host>/api/project-alerts/unsubscribe?token=…>,
  <mailto:…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. This needs
  a **small provider change** (`src/providers/email-resend/index.js`) to pass
  `options.headers` through to Resend. Instant alert emails get the same headers.

### 5. beehiiv integration (P3)

#### 5a. What the beehiiv API offers (researched 2026-10-16)
beehiiv **renamed its plans on 2026-10-01**: Launch→**Free**, Scale→**Lite**,
Max→**Pro**, Enterprise unchanged. The developer docs still say "Max". Read Max as
Pro.

| Capability we'd use | API | Plan required | Confidence |
|---|---|---|---|
| Create subscription (`email`, `reactivate_existing`, `send_welcome_email`, `double_opt_override: on/off/not_set`, `custom_fields[]`, `utm_*`, `referring_site`, `automation_ids[]`, `newsletter_list_ids[]`) | `POST /v2/publications/{pub}/subscriptions` | All plans (Free has "API Access (excluding Send API)") | High (docs + pricing page) |
| Get / update subscription by email (custom fields incl. `delete: true`; `unsubscribe: true`) | `GET`/`PUT /v2/publications/{pub}/subscriptions/by_email/{email}` | All plans | High |
| Define custom fields (kinds: string, integer, boolean, date, datetime, list, double). Values for unknown fields are **silently dropped** with a `warnings` entry | `POST /v2/publications/{pub}/custom_fields` | All plans (pricing page lists custom fields on Free) | High |
| Subscriber tags (auto-created on first use) | `POST /v2/publications/{pub}/subscriptions/{id}/tags` | API on all plans. Tag *automation actions* are Lite+. Free-plan use of the tags endpoint **unverified** | Medium |
| Segments (create dynamic segments by **custom field** filters; tags are not a segment API filter) | `POST /v2/publications/{pub}/segments` | Free: 3 segments, Lite: 10, Pro/Enterprise: unlimited | Medium (limits from pricing page) |
| Automations / journeys (enroll via `automation_ids` on create, or `POST …/automations/{aut}/journeys`; the automation needs an active "Add by API" trigger) | as listed | Free: no live custom automations; Lite: 10; Pro: unlimited | Medium |
| Webhooks (`subscription.created/confirmed/deleted/paused/resumed`, `newsletter_list_subscription.unsubscribed`, `post.sent`, …), delivered via **Svix** (`svix-id`, `svix-timestamp`, `svix-signature`; secret in Settings → Webhooks) | `POST /v2/publications/{pub}/webhooks` | **Lite and above** ("paid users on the Lite plan and above") | High |
| Create / send posts ("Send API"): `title`, `body_content` (HTML) or `blocks`, `status: draft\|confirmed` (**defaults to draft since 2026-08-06**), `scheduled_at`, `recipients.email.include_segment_ids` / `tier_ids`, `email_settings.email_subject_line`, `newsletter_list_id`. Creation is async (201, then poll; 202 while building) | `POST /v2/publications/{pub}/posts` | **Pro (ex-Max) and Enterprise only**, "not in trial". An older help article said Enterprise-only beta. Per-recipient personalization is limited to block visibility via condition sets, which **cannot be created via API** | High for the tier, medium for capability details |
| Rate limit | all endpoints | 180 requests/minute per organization, all plans, 429 on excess | High |
| Subscriber cap | n/a | Free ≤ 2,500, Lite ≤ 100k, Pro ≤ 250k | Medium |

**The user must confirm which beehiiv plan the `garden-steward` publication is on.**
The architecture below works on **Free**. Lite adds real-time unsubscribe sync, and
Pro adds the optional post-drafting upgrade.

#### 5b. Recommended architecture (works on Free)
- **Our system stays the source of truth for alerts and the digest.** The
  per-person weekly digest is always sent by us through Resend, on every beehiiv
  tier. Even on Pro, a beehiiv post goes to segments, not per person. Segments are
  defined only by custom fields, and per-reader block conditions can't be created
  via API. A digest for "my 3 places × my 2 categories" doesn't fit a post.
- **beehiiv is the source of truth for the general newsletter.** We sync only
  people who **explicitly opted in**, and we attach their alert places and interests
  as custom fields, so the editor can build segments like "cities contains oakland".
- **Consent:** an unchecked-by-default checkbox, "Also send me the Garden Steward
  newsletter (monthly-ish updates). Unsubscribe any time." It appears on the alert
  signup card, the manage page, and as a link in the digest footer. Alert signup
  **never** implies newsletter consent, and existing alert subscribers are **not**
  bulk-imported into beehiiv. Store `newsletter_opt_in_at` and
  `newsletter_consent_source`.
- **Double opt-in:** create beehiiv subscriptions with `double_opt_override: 'on'`
  for every API-originated signup. This proves inbox ownership for signed-out
  signups, where anyone can type any email. beehiiv sends its own confirmation
  email, and our `newsletter_state` stays `pending` until beehiiv reports `active`.
  (If the user prefers to rely on the publication's default, use `not_set`. Open
  question.)
- **`reactivate_existing: true`** only on an explicit opt-in action (beehiiv's docs:
  only when the subscriber knowingly resubscribes). Never send it on a background
  re-sync.
- **Custom fields** (created once by an idempotent setup routine, or by hand in
  beehiiv; all `string` unless noted): `gs_cities` (comma-joined normalized city
  names), `gs_zips`, `gs_places` (display labels), `gs_categories` (or `all`),
  `gs_alert_frequency`, `gs_has_account` (boolean), `gs_source`. Because beehiiv
  drops unknown fields silently, the sync must **log `warnings`** from responses.
- **Outbox sync, never in the request path:** any change to a preference with
  `newsletter_opt_in_at` set (or a new opt-in or opt-out) sets
  `beehiiv_sync_needed_at = now`. A new cron, `syncBeehiivNewsletter`, runs every
  10 minutes. It claims up to 100 dirty rows (CAS on `beehiiv_sync_needed_at`), then:
  opt-in with no subscription id → create; opted in → `PUT by_email` with custom
  fields; opted out → `PUT by_email {unsubscribe: true}`. It records
  `beehiiv_subscription_id`, `newsletter_state`, `beehiiv_synced_at`, and
  `beehiiv_last_error`. It stays under 180 req/min. On a 429 or 5xx it leaves the
  row dirty for the next run.
- **Unsubscribe sync:**
  - Ours → beehiiv: only the newsletter toggle on the manage page, or the explicit
    "Unsubscribe from everything" button (which also sets alerts `off`), sends
    `unsubscribe: true`. An alert-email unsubscribe link does **not** unsubscribe
    from the newsletter.
  - beehiiv → ours, on **Lite+**: `POST /project-alerts/beehiiv-webhook`
    subscribed to `subscription.confirmed`, `subscription.deleted`,
    `subscription.paused`, `subscription.resumed`. It verifies the Svix signature
    over the **raw** request body (`config/middlewares.js` → `strapi::body` must
    set `includeUnparsed: true`, or the request must be read before parsing). It
    updates `newsletter_state` and `newsletter_opt_out_at` only and **never changes
    alert frequency**. It responds 2xx for unknown emails, so Svix doesn't retry
    forever.
  - beehiiv → ours, on **Free** (no webhooks): a nightly reconciliation cron that
    calls `GET by_email` for each opted-in preference whose state is `pending` or
    `active`, throttled, and applies the same state mapping. Run it on Lite+ too,
    as a backstop for missed webhooks.
  - beehiiv status mapping: `active` → `active`; `validating`/`pending` →
    `pending`; `inactive` → `unsubscribed`; `invalid`/`needs_attention` → `error`;
    `paused` → `unsubscribed`.
- **Config:** `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` (the `pub_…` id),
  `BEEHIIV_WEBHOOK_SECRET` (Lite+), set as Fly secrets (`fly secrets set …`). They
  are never committed or exposed to the FE. If `BEEHIIV_API_KEY` or
  `BEEHIIV_PUBLICATION_ID` is missing, the beehiiv service is a **logged no-op**:
  rows stay dirty, and nothing throws. Test and dev never call beehiiv for real;
  tests patch the beehiiv service.
- **The `NewsletterSignup.vue` hosted-form link stays as is.** People who sign up
  directly on beehiiv are not imported into our system (out of scope).

#### 5c. Upgrade path (if the plan is Pro or Enterprise)
Add an optional weekly "regional roundup" **draft** post: after the digest run,
create a beehiiv post with `status: 'draft'` (never `confirmed` automatically),
whose `body_content` is that week's approved projects, one draft per configured
region segment (`recipients.email.include_segment_ids`). An editor reviews and
sends it in beehiiv. This adds no per-person sends and makes no consent changes.
This is P4, not designed in detail here.

### Explicitly out of scope
- Converting project `category` to a managed taxonomy, or adding categories.
- Radius/geo-distance matching, state-qualified cities, and non-US postal codes.
- SMS delivery of alerts or digests.
- Changing or removing the Mailchimp call in `SmsHelper.saveVolunteerEmail` (flagged).
- Importing beehiiv-only subscribers into Garden Steward.
- Dropping the legacy `email`/`user`/`welcomed_at` columns on `project_alerts`.
- Admin-panel UI beyond what Strapi gives the new content type for free.
- Account email changes re-keying preferences: a preference keeps the address it was
  created with. `/me` resolves by `user` first.

## API contract
Base: `${VITE_API_URL}/api`. All bodies are JSON. Strapi error shape:
`{ data: null, error: { status, name, message, details } }`.
Identity is the preference itself. **No numeric `id` and no `documentId` of a
preference or location is ever returned.** Locations are identified by value
(`scope` + `zip`/`city`).

### Shared shape: `Preference`
```json
{
  "exists": true,
  "email": "pat@example.com",
  "frequency": "instant",
  "categories": ["Planting", "Art"],
  "locations": [
    { "scope": "zip",  "zip": "94607", "city": null,      "label": "94607" },
    { "scope": "city", "zip": null,    "city": "oakland", "label": "Oakland" }
  ],
  "newsletter": { "opted_in": false, "state": "none" },
  "next_digest_at": null
}
```
- `exists`: false when no preference exists yet (`/me` for a new user). In that case
  `frequency` is the server default, `categories` is `[]`, and `locations` is `[]`.
- `email`: full address on `/me`. **Masked** on token endpoints (`p•••@example.com`),
  so a forwarded email doesn't reveal the address in the UI.
- `categories`: `[]` means all.
- `locations`: active locations only, ordered by creation.
- `newsletter`: **P3 field.** Absent before P3. The FE must treat it as optional.
- `next_digest_at`: **P2 field.** An ISO datetime when `frequency === 'weekly'`,
  else null. Absent before P2.

### `GET /project-alerts/options` (P1, public)
200:
```json
{
  "categories": [{ "value": "Planting", "label": "Planting" }, "... all 6 project category enum values, in schema order"],
  "frequencies": ["instant", "off"],
  "max_locations": 10,
  "newsletter_available": false
}
```
`frequencies` is **capability-driven**: `["instant","off"]` in P1 and
`["instant","weekly","off"]` once P2 is deployed. The FE renders only what is
offered. `newsletter_available` is true only when P3 is deployed and beehiiv env
vars are set.

### `POST /project-alerts` (existing, P1 extends additively)
Auth: none (an optional JWT is honored). Rate limited at 10/IP/day.
Body: `{ email?, zip? | city?, categories?, frequency?, newsletter_opt_in? }`.
`email` is required when signed out. One of `zip`/`city` is required (unchanged).
`categories`/`frequency` apply **only** when the caller is signed in and the
email is theirs, and are silently ignored otherwise. `newsletter_opt_in: true`
records consent (P3, ignored before).
- 200: `{ "subscribed": true, "label": "94607" }`. Unchanged and identical whether
  or not the email has an account or a preference. **Never returns a token.**
- 400: bad email, zip, or city, or `"You can follow up to 10 places"`.
- 429: rate limit (existing).
Compatibility: additive. The old FE card keeps working unchanged.

### `GET /project-alerts/me` (P1)
Auth: JWT required. Grant: authenticated + Administrator → `findMine`.
- 200: `Preference`. Resolution order: preference whose `user` is me → preference
  whose email equals my email (linked to me on read) → `{ exists: false, ... }`
  (no row created).
- 400 `"Add an email address to your account to get project alerts"` when the
  user has no real email (SMS placeholder; `welcome.hasRealEmail`).
- 401: no or invalid JWT (Strapi default).

### `PUT /project-alerts/me` (P1)
Auth: JWT required. Grant: authenticated + Administrator → `updateMine`.
Body (full replacement; every key required):
```json
{ "frequency": "weekly", "categories": ["Planting"], "locations": [{ "zip": "94607" }, { "city": "Oakland, CA" }] }
```
P3 adds an optional `"newsletter_opt_in": true|false`.
- 200: the updated `Preference`. Creates the preference if it didn't exist. The first
  creation sends the welcome email, unless the user's email was welcomed before.
- 400: `error.details.errors` is an array of `{ path: ["locations", 1], message }`
  (invalid zip, empty city, more than 10 locations, unknown category, frequency not in
  `/options.frequencies`, duplicate location). Nothing is saved on a 400.
- 401: unauthenticated.

### `GET /project-alerts/manage?token=` (P1)
Auth: none.
- 200: `Preference` with a masked `email`.
- 400: missing token. 404: unknown token. **Never 401 or 403.**

### `PUT /project-alerts/manage?token=` (P1)
Auth: none. Rate limited (e.g. 30/IP/hour). Body and validation are the same as
`PUT /me`.
- 200: `Preference` (masked). 400: validation, same shape. 404: unknown token.

### `POST /project-alerts/manage-link` (P1)
Auth: none. Rate limited at 5/IP/hour, plus at most 1 email per address per
10 minutes. Body: `{ "email": "pat@example.com" }`.
- 200: `{ "sent": true }`, **always**, including for unknown addresses. Emails the
  manage link only if a preference exists.
- 400: malformed email. 429: rate limit.

### `GET /project-alerts/unsubscribe?token=` (existing; response extended)
Auth: none. Accepts a **preference `manage_token`** (turns off all project alerts:
`frequency=off`) or a **legacy location `unsubscribe_token`** (turns off that place).
- 200: `{ "unsubscribed": true, "label": "94607" | null, "scope": "location" | "all", "manage_token": "…" }`.
  `label` and `unsubscribed` are unchanged for legacy tokens. `scope` and
  `manage_token` are additive.
- 404: unknown token (unchanged). It is idempotent: a repeat call returns 200.

### `POST /project-alerts/unsubscribe?token=` (P2)
One-click (RFC 8058) target for the `List-Unsubscribe-Post` header. Mail clients
POST `List-Unsubscribe=One-Click` as form data. Same semantics as GET.
Returns 200 `{ "unsubscribed": true }` or 404.

### `POST /project-alerts/beehiiv-webhook` (P3; not called by the FE)
Auth: Svix signature. 200 on accepted, including unknown emails. 400 on a bad
signature.

### Deploy order and skew
Backend first, for every phase. All changes are additive to shapes the current
(or branch) FE uses: `POST /project-alerts` and `GET .../unsubscribe` are
supersets. The old FE never calls the new routes. The new FE must tolerate a
missing `newsletter` and `next_digest_at`, and must read `frequencies` from
`/options` rather than hardcoding `weekly`. Welcome and alert emails sent by the new
backend link to `/alerts?token=…`. **That FE route must be live before (or within
minutes of) the P1 backend deploy**, or manage links in welcome emails 404 on the FE.
Mitigation: deploy the FE route first (it renders an error state if the API is
missing), or deploy both together. This is the one place where the FE goes first.

## Frontend intent
**Prerequisite (P1, task 0):** rebase `claude/festive-edison-jluckt` onto
garden-vue `main` (only `src/helpers/router.js` conflicts) and fold it into the P1
FE branch, or merge it first as its own PR. Nothing below can land without it.

- **New page `/alerts` ("Project alerts")**, a public route added to `publicPages`
  in `src/helpers/router.js`. It handles three states:
  1. **Signed in:** loads `GET /me`. It shows the email the alerts go to, a list of
     places (chips with remove, plus an "add a zip or city" input using the same
     zip/city segmented control as the card), category checkboxes (an "All project
     types" toggle that, when on, sends `[]`), and a frequency choice (radio buttons
     from `/options.frequencies`: "Right away", "Weekly digest (Thursdays)", "Off").
     When weekly is selected, it shows `next_digest_at` as "Next digest: Thu Oct 22".
     P3 adds a newsletter checkbox with the consent copy, plus a pending state
     ("Check your inbox to confirm").
     Save calls `PUT /me` with the full form. Field errors map from
     `error.details.errors[].path`.
  2. **Signed out with `?token=`:** the same form, backed by
     `GET`/`PUT /manage?token=`, showing the masked email. A 404 shows "This link
     isn't valid anymore" plus the "email me a new link" form. It must **not**
     redirect to login.
  3. **Signed out without a token:** shows the signup card, a "Sign in to manage
     your alerts" link, and "Already subscribed? Email me a link to manage them"
     (`POST /manage-link`, always shows "If that address is subscribed, we've sent a
     link").
  If a signed-in user opens a `?token=` link, prefer the token preference when its
  masked email doesn't match theirs. Otherwise use `/me`.
- **`ProjectAlertSignup` card on `/projects`:**
  - Signed out: unchanged form, plus (P3) an unchecked newsletter checkbox. The
    success text becomes "Check your inbox. Your welcome email has a link to pick
    project types and choose a weekly digest."
  - Signed in: on mount, calls `GET /me`. If `exists`, it shows a summary instead of
    the form: "You get {weekly digests | instant emails} for Oakland, 94607 ·
    Customize" (link to `/alerts`). Otherwise it shows the form, and on success shows
    "Customize project types and frequency" linking to `/alerts`.
- **Project page entry point** (`ProjectPublic.vue`): a small "Get alerts for
  projects like this" link to
  `/alerts?prefill_zip={project.location_zip}&prefill_category={project.category}`.
  On `/alerts` the prefill only **pre-populates** the form, and nothing saves until
  the user presses Save. Signed out with no token, the prefill seeds the signup card.
- **Nav profile menu:** add a "Project alerts" item linking to `/alerts`.
- **Unsubscribe page** (`/alerts/unsubscribe`): after success, it shows "Manage
  your alerts instead" linking to `/alerts?token={manage_token}`. For
  `scope: 'location'` the text is "We won't email you about {label} anymore"; for
  `scope: 'all'` it is "You won't get any project alerts".
- **Store** `project-alerts.store.js` gains `options()`, `getMine()`,
  `updateMine(body)`, `getByToken(t)`, `updateByToken(t, body)`, and
  `requestManageLink(email)`. It uses PUT (the fetch wrapper has no PATCH).
- **Do not** call `/me` while signed out. The fetch wrapper would send no auth and
  get a 401, which is harmless, but it is wasted traffic.

## Risks & alternatives considered
- **Alternative: one wide table (keep one row per location and copy frequency and
  categories onto every row).** Rejected. Edits would fan out across rows and drift,
  "my preferences" would have no single identity, and digest claims would need
  per-email locking. **Alternative: a brand-new location table and dropping
  `project_alerts`.** Rejected. It would break every unsubscribe token already in
  inboxes, or need a token remap table.
- **No DB unique constraint on `email`.** In Strapi v5, `unique: true` is enforced by
  content validation, not reliably as a DB index, and `strapi.db.query` bypasses
  validation. Find-or-create must pick the lowest id, and the bootstrap backfill
  merges duplicates. A concurrent first signup for the same email is rare, and the
  merge makes it self-healing.
- **Permission grants and logout on 403:** see section 3. The bootstrap ensure is
  required, not optional.
- **Token-holder powers:** a forwarded email lets the recipient change preferences
  or unsubscribe. This is the industry norm. Mitigations: the email is masked and
  the address cannot be changed by token. A signed-out POST cannot change
  frequency or categories, and never returns a token (it would otherwise be an
  enumeration and takeover vector).
- **Link scanners:** corporate mail scanners prefetch GET links. The unsubscribe
  URL in emails points to the **FE page**, which calls the API from JS, so scanners
  that don't run JS don't unsubscribe anyone (unchanged). The `List-Unsubscribe`
  header points directly to the API **POST** endpoint, which scanners don't call.
- **Lifecycles:** none are added. All preference, digest, and outbox state changes
  go through explicit service methods. A lifecycle on `project_alerts` or the
  preference would fire during the bootstrap backfill and on admin edits.
- **Digest timestamp choice:** `subscribers_notified_at` and not `reviewed_at`.
  `reviewed_at` is set at decision time, before undo. The verify path never sets it.
  Undo can revert the decision. `subscribers_notified_at` is set exactly once, after
  undo closes, on both approval paths.
- **At-most-once digest:** a transient Resend error loses one person's week.
  Accepted for consistency with the codebase. The alternative (a per-send ledger
  table with retry) is noted if delivery guarantees matter later.
- **Resend throughput and bulk-sender rules:** pace sends and add `List-Unsubscribe`
  headers (needs the provider passthrough). At current volume, Gmail and Yahoo's
  5k/day bulk rules don't apply, but the headers are cheap insurance.
- **Raw body for Svix:** Strapi's body parser consumes the stream. Without
  `includeUnparsed`, signature verification always fails.
- **beehiiv silent field drops:** unknown custom field names are discarded with
  only a `warnings` entry. Log warnings, and run the custom-field setup before the
  first sync.
- **documentId vs id:** nothing public exposes either id for these types. Internal
  writes use numeric `id` through `strapi.db.query`, consistent with the module.
- **Default-frequency flip:** if P2 makes `weekly` the default for new signups,
  existing rows stay `instant` (the backfill sets instant explicitly). The welcome
  email copy must reflect the actual frequency.
- **Model note:** this spans two repos, a data backfill, a new cron with
  concurrency guarantees, and an external integration with an unknown plan tier.
  Each phase is designed to ship alone. If phases are re-planned or combined, re-run
  design with the strongest available model.

## Acceptance criteria

### P1: Preferences, multiple locations, categories (backend + FE)
AC1. After boot against a DB containing legacy rows (email A: zip 94607 active +
city oakland active, both `welcomed_at` set; email B: one row unsubscribed),
exactly one preference exists per email. A's preference has `frequency='instant'`,
`categories=[]`, `welcomed_at` equal to the earliest row value, and both rows
linked. B's preference has `frequency='off'`. Every row keeps its original
`unsubscribe_token`. Booting a second time creates no rows and changes nothing.
AC2. If two preferences exist for the same email before boot, after boot exactly
one remains (the lowest id), owning all locations of both.
AC3. `GET /api/project-alerts/options` (no auth) returns 200 with `categories`
equal to the project `category` enum values in schema order, `max_locations: 10`,
and `frequencies` = `["instant","off"]` (P1).
AC4. `POST /api/project-alerts` with the pre-existing body shape still returns
exactly `{ subscribed: true, label }`. The response contains no token. A
second-place signup for the same email adds a location row linked to the **same**
preference and sends no second welcome email. The welcome email contains
`/alerts?token=<preference.manage_token>`.
AC5. A signed-out `POST /api/project-alerts` with `{ email, zip, frequency: 'off', categories: ['Art'] }`
for an existing preference leaves that preference's `frequency` and `categories`
unchanged.
AC6. `GET /api/project-alerts/me` with no JWT returns 401. With a JWT for a user
with no preference, it returns 200 `{ exists: false, frequency: 'instant', categories: [], locations: [] }`
and creates no row. With a JWT for a user whose email has a preference (not yet
linked), it returns that preference with full `email` and links `user`.
AC7. `PUT /api/project-alerts/me` with `{ frequency:'instant', categories:['Planting'], locations:[{zip:'94607'},{city:'Oakland, CA'}] }`
returns 200 with `locations` labels `["94607","Oakland"]`. A following PUT with
`locations:[{zip:'94607'}]` returns one location. The Oakland row still exists with
`unsubscribed_at` set and its token unchanged. A third PUT re-adding Oakland clears
`unsubscribed_at` on **that same row** (no new row).
AC8. `PUT /me` returns 400, and saves nothing, for each of: 11 locations; zip `'123'`;
category `'Gardening'`; frequency `'weekly'` while `/options` doesn't offer it;
the same zip twice. `error.details.errors[0].path` identifies the bad item.
AC9. A user with the Administrator role (not authenticated) gets 200 from
`GET /me` and `PUT /me`. On a fresh DB after boot, the authenticated and
administrator roles both have `api::project-alert.project-alert.findMine` and
`.updateMine` enabled.
AC10. `GET /api/project-alerts/manage?token=<manage_token>` returns 200 with a
masked email (contains `•`, not the full local part). `PUT` with the same body as
AC7 returns 200 and persists. An unknown token returns 404 and a missing token
returns 400, on both GET and PUT, **even when a valid JWT is also sent** (never
401/403).
AC11. `POST /api/project-alerts/manage-link` returns 200 `{ sent: true }` for both a
subscribed and an unknown email. The email mock is called once (containing the
manage link) for the subscribed address and zero times for the unknown one. A
second request for the same address within 10 minutes sends nothing more.
AC12. `GET /api/project-alerts/unsubscribe?token=<legacy location token>` sets that
row's `unsubscribed_at`, leaves the preference's `frequency` unchanged, and returns
`{ unsubscribed: true, label, scope: 'location', manage_token }`.
With `token=<manage_token>`, it sets `frequency='off'` and `unsubscribed_at` on the
preference, leaves location rows untouched, and returns `scope: 'all'`. Unknown
tokens return 404.
AC13. `notifyForProject` for a project with category `Art` in zip 94699 emails:
an instant preference following 94699 with `categories=[]`, and an instant
preference following 94699 with `['Art']`. It does **not** email: an instant
preference with `['Planting']`, a `weekly` preference, an `off` preference, or the
pitcher. A preference following both the zip and the city gets one email with the
zip in the subject. `subscribers_notified_at` is set even when the recipient count
is 0.
AC14. Instant alert emails contain `/alerts?token=<manage_token>` and
`/alerts/unsubscribe?token=<manage_token>`.
AC15 (UI). Signed in, `/alerts` loads current preferences. Changing categories and
pressing Save persists them (verified by reload). Removing a place chip and saving
removes it. A 400 shows the message next to the offending place.
AC16 (UI). Signed out, `/alerts?token=<valid>` shows the form with the masked
email and saves. `/alerts?token=bogus` shows "This link isn't valid anymore" and
the email-me-a-link form, and does not open the login modal. Signed in, opening
`/alerts?token=bogus` does **not** log the user out.
AC17 (UI). On `/projects`, a signed-in user with a preference sees the summary line
with a Customize link and not the form. A signed-out user still sees the original
form and success state.
AC18 (UI). The Nav profile menu has a "Project alerts" item that navigates to
`/alerts`. The project page's "Get alerts for projects like this" opens `/alerts`
with that project's zip and category pre-filled and unsaved.
AC19 (UI). `/alerts/unsubscribe?token=<legacy>` shows "We won't email you about
{label}" and a "Manage your alerts instead" link to `/alerts?token=<manage_token>`.

### P2: Weekly digest
AC20. `/options.frequencies` is `["instant","weekly","off"]`. `PUT /me` accepts
`weekly`, and the response has `next_digest_at` equal to the next Thursday 07:30
America/Los_Angeles (as ISO).
AC21. `sendWeekly({ now })` with `now` = Thursday 07:31 PT: a weekly preference
following 94607 with `categories:['Planting']` gets exactly one email listing the
APPROVED Planting projects in 94607 whose `subscribers_notified_at` is in the
preceding 7 days. It excludes: a project released 8 days ago, an Art project, a
project in another zip, a project released then set to REJECTED or ARCHIVED, and a
project the recipient pitched. Afterward `digest_through` = Thursday 07:30 PT
(this week) and `last_digest_sent_at` is set.
AC22. Calling `sendWeekly` again with `now` = Thursday 07:45 PT, and with `now` =
Friday, sends nothing to anyone.
AC23. Two concurrent `sendWeekly` calls (`Promise.all`) with the same `now` send
each eligible person exactly one digest.
AC24. A weekly preference with no qualifying projects gets no email, and its
`digest_through` still advances to `end`.
AC25. `instant` and `off` preferences never receive a digest. `notifyForProject`
never emails a `weekly` preference.
AC26. A preference that moves from `instant` to `weekly` at time T, and
received an instant email for project X released before T, does not see X in its
next digest. A project released after T appears.
AC27. With `digest_through` 3 weeks old (a missed run), the next digest covers only
projects from the last 14 days.
AC28. If the email provider throws for one recipient, the other recipients still
get their digests. The failing preference's `digest_through` is advanced
(at-most-once) and the error log contains the preference id and not the email
address.
AC29. Digest email: the subject matches `^\d+ new projects? near ` and the body
groups projects under their matched place label, with more than 20 qualifying
projects showing 20 cards plus "See all". The footer contains the followed places,
the category summary, `/alerts?token=`, and `/alerts/unsubscribe?token=`. The
provider receives `List-Unsubscribe` and `List-Unsubscribe-Post` headers (and the
Resend payload includes `headers`).
AC30. `POST /api/project-alerts/unsubscribe?token=<manage_token>` with form body
`List-Unsubscribe=One-Click` returns 200 and sets `frequency='off'`.
AC31. `config/cron-tasks.js` `sendWeeklyProjectDigest` only delegates to
`api::project-alert.digest.sendWeekly()` inside try/catch, with
`tz: 'America/Los_Angeles'` and the rule derived from the shared schedule constant.
AC32 (UI). On `/alerts`, choosing "Weekly digest" and saving shows "Next digest:
<date>". The signed-in card summary says "weekly digests".

### P3: beehiiv newsletter sync
AC33. Signing up for alerts (any path) without `newsletter_opt_in: true` never
creates a beehiiv subscription (beehiiv service mock not called with create). It
leaves `newsletter_state='none'`.
AC34. `PUT /me` with `newsletter_opt_in: true` sets `newsletter_opt_in_at`,
`newsletter_consent_source='manage_page'`, and `beehiiv_sync_needed_at`. It does
not call beehiiv in the request. The next `syncBeehiivNewsletter` run calls create
with `email`, `double_opt_override: 'on'`, `reactivate_existing: true`, and
`custom_fields` containing `gs_zips`, `gs_cities`, `gs_categories`,
`gs_alert_frequency`. It then stores `beehiiv_subscription_id`, sets
`newsletter_state='pending'`, and clears `beehiiv_sync_needed_at`.
AC35. Changing locations or categories for an opted-in preference results, on the
next sync, in exactly one `PUT by_email` with the updated custom fields and
**without** `reactivate_existing`.
AC36. `PUT /me` with `newsletter_opt_in: false` results, on the next sync, in
`PUT by_email { unsubscribe: true }`. `newsletter_state` becomes `unsubscribed`
and `frequency` is unchanged.
AC37. The alert unsubscribe link (`GET /unsubscribe?token=<manage_token>`) for an
opted-in preference turns alerts off and makes **no** beehiiv call. "Unsubscribe
from everything" turns alerts off **and** queues the newsletter unsubscribe.
AC38. A beehiiv 429 or 500 during sync leaves the row dirty with
`beehiiv_last_error` set. The next run retries. One run makes at most 100 beehiiv
requests.
AC39. With `BEEHIIV_API_KEY` unset, sync is a no-op that logs once per run, with no
throw and rows left dirty. `/options.newsletter_available` is false.
AC40 (Lite+). `POST /api/project-alerts/beehiiv-webhook` with a valid Svix
signature and `subscription.deleted` for an opted-in email sets
`newsletter_state='unsubscribed'` and `newsletter_opt_out_at`, and leaves
`frequency` unchanged. An invalid signature returns 400 and changes nothing. An
unknown email returns 200.
AC41. The nightly reconciliation, given beehiiv returning `status: 'active'` for a
`pending` preference, sets `newsletter_state='active'`. Given `inactive`, it sets
`unsubscribed`.
AC42 (UI). The alert card and `/alerts` show the newsletter checkbox unchecked by
default only when `/options.newsletter_available`. After opting in, `/alerts`
shows "Check your inbox to confirm" while `state === 'pending'`.

## Verification plan
Backend tests follow `tests/project-alert/index.js` (one Strapi instance, sqlite,
`patch`/`patchService` from `tests/helpers/patch.js`, email asserted via a patched
`strapi.plugins.email.services.email.send`). Register new test files in
`tests/app.test.js`.

| AC | How | Kind |
|---|---|---|
| AC1, AC2 | Insert legacy `project_alerts` rows (and duplicate preferences) with `strapi.db.query`, then call the exported backfill function directly (it must be exported from `src/index.js` or a util so tests can call it). Run it twice and assert the row counts and fields. | backend (supertest suite, service-level) |
| AC3–AC12 | supertest against `/api/project-alerts/*`. JWTs via `services.jwt.issue`. Administrator role via a user created with the `administrator` role. AC9 also queries `plugin::users-permissions.permission` after boot. | backend + contract |
| AC10 second half | supertest sending a valid `Authorization` header along with a bogus token, asserting 404 and not 401/403. | backend + contract |
| AC11 | Rate-limit stores are module-level. Use distinct emails and assert the per-email throttle within one test. | backend |
| AC13, AC14 | Service test like the existing "emails matching zip and city subscribers" case, with `reverseGeocode` patched. | backend |
| AC15–AC19 | Browser against both dev servers (`strapi develop` + `vite`), with a seeded user, a seeded token preference, and one legacy location row. Check the network panel: request bodies match the contract (full-replacement PUT, `[]` for all categories). AC16's logout check: sign in, open a bogus token link, confirm still signed in. | UI + contract |
| AC20–AC28, AC31 | Service tests calling `strapi.service('api::project-alert.digest').sendWeekly({ now })` with explicit `now` values. Seed projects with explicit `subscribers_notified_at`, `review_status`, `location_zip`, `category`, `created_by`. Clock control is the `now` parameter, with no Date mocking. AC23 uses `Promise.all` of two calls and counts email mock calls per recipient. AC31 requires `config/cron-tasks.js` and asserts that the task calls a patched service. | backend |
| AC29 | Unit test the pure `digestEmail` builder (like `tests/project-alert/helpers.test.js`), plus a provider unit test asserting that `headers` reaches the mocked `resend.emails.send` payload. | backend unit |
| AC30 | supertest POST with `type('form')`. | backend + contract |
| AC32 | Browser. | UI |
| AC33–AC39, AC41 | Patch `api::project-alert.beehiiv` (create, updateByEmail, getByEmail) with jest fns. Drive changes via supertest, then call the sync and reconcile service methods directly. AC38 makes the mock reject with `{ status: 429 }`. AC39 unsets env vars in-test (restore after). | backend |
| AC40 | supertest with a body signed using a test secret (Svix's documented HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`). This needs the raw-body middleware config. Also verify **manually once** against a real beehiiv test webhook, since the payload field names (e.g. `data.email`) are not documented on the pages reviewed. | backend + manual |
| AC42 | Browser, with beehiiv env vars set to a sandbox publication, or the service stubbed. | UI |
| beehiiv tier | **Manual:** the user confirms the plan in beehiiv Settings → Billing. Once, with real keys in a staging env, create one test subscription with the `gs_*` custom fields and confirm no `warnings` are returned. | manual |

Not coverable by unit tests alone: cron wiring in production (check Fly logs for
the first Thursday run), multi-machine concurrency (covered logically by AC23's CAS
test, confirm in logs), real Resend header delivery (send one digest to a Gmail
inbox and confirm Gmail shows the "Unsubscribe" affordance), and beehiiv double
opt-in email behavior.

## Phasing
- **P1: Preferences, multiple locations, categories, and manage links.** Backend:
  preference type, location relation, backfill, the `/options`, `/me`, `/manage`,
  `/manage-link` endpoints, the extended unsubscribe, category-aware instant alerts,
  manage links in emails, and permission grants. FE: rebase the alert branch, add
  `/alerts`, the card summary, the Nav item, the project-page link, and the
  unsubscribe "manage instead" link. Ships independently and is useful alone
  (categories and multiple places for instant alerts). ACs 1–19.
- **P2: Weekly digest.** Digest service, cron, email template, one-click unsubscribe
  POST, provider header passthrough, `weekly` in `/options`, the
  `DEFAULT_FREQUENCY` decision, and `next_digest_at`. FE changes are small (one
  more radio option, next-digest text). ACs 20–32.
- **P3: beehiiv sync (Free-tier compatible).** Consent fields, outbox sync cron,
  reconciliation cron, beehiiv service, custom-field setup, an optional webhook (if
  Lite+), the newsletter checkbox in the FE, and `newsletter_available`. ACs 33–42.
- **P4 (optional, Pro/Enterprise only):** a weekly regional roundup **draft** post
  via the Send API. Not designed here.

## Open questions for the user
1. **beehiiv plan tier:** which plan is the `garden-steward` publication on (now
   named Free / Lite / Pro / Enterprise)? This decides webhook vs. polling for
   unsubscribe sync (Lite+), how many segments you can build (Free 3, Lite 10), and
   whether the P4 draft-post upgrade is possible (Pro/Enterprise).
2. **Category taxonomy:** is the existing project `category` list (Infrastructure,
   Art, Event, Education, Planting, Community) good enough for "what I'm interested
   in"? Many projects may just carry the default `Community`. Should managers be
   nudged to set it in review? A richer or admin-editable taxonomy is a separate
   feature.
3. **Digest day and time:** the proposal is Thursday 07:30 Pacific. Is that right?
   Should an empty week send a "nothing new" email (recommended: no)?
4. **Do instant alerts stay?** The design keeps them as a choice. If yes: should
   **new** signups default to weekly once P2 ships (recommended) while existing
   subscribers stay instant (recommended, since the backfill keeps them instant)?
   Or should existing subscribers be moved to weekly with a one-time notice email?
5. **Newsletter double opt-in:** force beehiiv double opt-in for all API signups
   (recommended), or use the publication's default setting?
6. **Postal address:** what physical mailing address should go in digest and
   newsletter footers (CAN-SPAM)?
7. **Mailchimp:** `SmsHelper.saveVolunteerEmail` still adds SMS volunteers to a
   Mailchimp list as "subscribed" without asking. Is Mailchimp still in use? Should
   it be retired in favor of beehiiv (with explicit consent) in a follow-up?
8. **Account soft-creation:** today every new alert email gets a soft user account
   and a 7-day "create your account" link. Keep that behavior for the digest-era
   signup card?

## Sources (beehiiv research)
- https://developers.beehiiv.com/api-reference/subscriptions/create
- https://developers.beehiiv.com/api-reference/subscriptions/update-by-email.md
- https://developers.beehiiv.com/api-reference/custom-fields/create.md
- https://developers.beehiiv.com/api-reference/segments/create.md
- https://developers.beehiiv.com/api-reference/automation-journeys/create.md
- https://developers.beehiiv.com/api-reference/webhooks/create
- https://developers.beehiiv.com/webhooks.md
- https://developers.beehiiv.com/api-reference/posts/create
- https://developers.beehiiv.com/welcome/rate-limiting
- https://developers.beehiiv.com/llms.txt
- https://www.beehiiv.com/pricing
- https://www.beehiiv.com/support/article/36759164012439-using-the-send-api-and-create-post-endpoint
- https://pricingsaas.com/companies/beehiiv/diffs/2026D275 (plan rename: Launch/Scale/Max → Free/Lite/Pro)
- Subscription tags endpoint (third-party mirror; verify against the official docs): https://apis.io/apis/beehiiv/beehiiv-subpackage-subscriptiontags-api/
