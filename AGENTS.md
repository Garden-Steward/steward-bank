# AGENTS.md — steward-bank

Instructions for coding agents (Codex, Claude Code, Cursor, Copilot, Aider…) and the humans
driving them. `CLAUDE.md` just points here, so this is the one file to keep current.

## What this is

steward-bank is the backend for **Garden Steward** (steward.garden): SMS-first software for
running public, foragable community gardens — volunteer days, watering schedules, tasks,
projects, plants, SMS campaigns and per-organization SMS billing. The web frontend is
**garden-vue** (`Garden-Steward/garden-vue`); its `DESIGN.md` covers
anything visual, including email templates.

> The README is partly out of date. Trust this file: it's **Strapi 5.36** (not 4), email is
> **Resend** (not SendGrid).

## Setup

```bash
nvm use                       # Node 20 (see .nvmrc)
yarn install                  # yarn.lock is the lockfile
cp .env.example .env
```

Then edit `.env` for safe local development:

```bash
ENVIRONMENT=development
SMS_DRY_RUN=true              # REQUIRED — never send real texts from a laptop
```

There's no email dry-run or local upload provider on `main` yet: with `RESEND_API_KEY` and
`GOOGLE_CLOUD_CREDENTIALS` blank, email sends and media uploads will fail. Avoid those flows
or ask a maintainer for sandbox keys.

Local dev needs Postgres (tests use SQLite and don't). Quickest way:

```bash
docker run -d --name gs-postgres -p 5432:5432 \
  -e POSTGRES_USER=strapi -e POSTGRES_PASSWORD=strapi -e POSTGRES_DB=strapi postgres:16
yarn develop                  # API on http://localhost:1337, admin at /admin
yarn seed                     # test gardens, users, events, tasks, messages, projects
```

Leave Twilio, Google, Mailchimp, weather and Sentry keys blank unless your feature needs one;
ask a maintainer for sandbox credentials rather than using personal ones.

## Commands

| Task | Command |
|---|---|
| Dev server | `yarn develop` |
| All tests | `yarn test` (jest, SQLite, runs in band) |
| One test file | `NODE_ENV=test npx jest tests/<path> --forceExit` |
| Syntax check | `node --check <file>` |
| Lint | `npx eslint <changed files>` |
| Seed | `yarn seed` |

**Don't run `yarn deploy`, `yarn migrate`, or anything against production.** Deploys and
migrations go through the maintainer.

## Layout

```
src/api/<type>/          one folder per content type
  content-types/         schema.json — the data model
  controllers/           request handling
  routes/                core router + 01-custom-<type>.js for custom endpoints
  services/              business logic — put logic here, keep controllers thin
src/index.js             bootstrap: permissions, backfills, cron wiring
config/                  server, plugins (email/upload), billing, cron-tasks, helpers/
config/env/test/         test overrides (SQLite)
scripts/                 seeds and maintenance scripts
tests/                   jest + supertest, grouped by domain
.claude/specs/<feature>/ design docs for shipped features — readable by any tool
```

Key domains: `garden`, `garden-task`, `recurring-task`, `volunteer-day` (events),
`project`, `organization`, `sms`, `sms-campaign`, `sms-usage`, `billing`, `message`, `plant`,
`weather`, `user-garden-interest`.

## Rules that will bite you

- **SMS costs real money and reaches real people.** All sending goes through
  `src/api/sms/services/transport.js`, which dry-runs when `SMS_DRY_RUN=true` or in test. Never
  call Twilio directly, never bypass the transport, never loosen opt-out handling
  (`tests/sms-opt-out.test.js`). Every send is metered for billing even in dry run.
- **Return 404, not 403**, for things a user can't see. garden-vue logs the user out on any
  401/403, so a 403 on a read boots them from the app. Hidden and missing both → 404.
- **Strapi v5:** use the Document Service (`strapi.documents('api::garden.garden')`) and
  `documentId` (string) as the public ID. Content with draft/publish has two rows; edit
  through the Document Service so relations survive.
- **Schema changes** (`schema.json`) alter the production database on deploy. Flag them
  clearly in the PR and get a maintainer's OK first.
- Cron jobs are off in tests and seeds (`CRON_ENABLED=false`). Don't add work to bootstrap
  that sends messages.
- Privacy: phone numbers, emails and exact locations are sensitive. Only garden managers see
  volunteer contact details. Never log them, never return them from public endpoints, never
  commit `.env` or real user data.

## Testing

- Add or update tests for any behavior change. Copy a neighboring test in `tests/<domain>/`
  as the template.
- Run the targeted test while working, then `yarn test` before opening a PR.
- If something was already failing before your change, say so in the PR; don't "fix" it
  inside your feature.

## How to build a feature

For anything bigger than a small fix, design before coding. This works in any tool:

1. **Design.** Write `.claude/specs/<feature-slug>/design.md`: the intent (what a user
   should be able to do), acceptance criteria you can verify, and — if garden-vue is involved —
   an **API contract**: endpoint, method, auth, request and response JSON, error codes. Both
   repos build against the contract, never against each other's code. Look at
   `.claude/specs/org-usage-page/design.md` for the shape.
2. **Break down.** Split it into small tasks, each touching a few files and independently
   testable. Tag backend `[BE]` and frontend `[FE]`; they can run in parallel.
3. **Implement** one task at a time. If the code disagrees with the plan, stop and fix the
   plan instead of improvising.
4. **Verify** against every acceptance criterion, not just "tests pass". Hit the endpoint
   with curl, check the frontend in a browser.
5. **Clean up.** Condense `design.md` to a one-page overview (what it does, where the pieces
   live, decisions and non-obvious constraints). Delete scratch notes.

(Claude Code users: `/feature` and the agents in `.claude/agents/` automate this pipeline.
Codex and other tools: follow the steps above by hand; the specs are plain Markdown.)

## Working in the hackathon

- Branch from `main`: `feat/<short-name>` or `fix/<short-name>`. One feature per PR.
- Small commits, imperative messages: `feat: add RSVP count to volunteer-day endpoint`.
- PR description: what changed, how you tested (commands + results), any schema change, and a
  link to the matching garden-vue PR if there is one. Backend deploys first, so it must
  tolerate the old frontend.
- Don't refactor outside your feature or bump dependencies unless that's the task.

## When you're unsure

Pick the smallest change that does the job, write down what you assumed in the PR, and keep
going. Ask a maintainer before: schema changes, anything that sends SMS or email, auth and
permissions, billing, or deleting files you didn't create.
