# Org SMS billing, Phase 1: metering

Every outbound SMS/MMS is recorded per organization so orgs can later be billed on usage. Phase 1 only measures: it changes who gets texted or what they receive in no way. Decided with Cameron, 2026-10.

## Pricing (Phases 2–3)
- **Free:** 500 outbound segments a month (UTC calendar month), no card.
- **Standard:** $20/mo including 1,500 segments, then $0.02 per segment, via Stripe Checkout with metered billing.
- **Over the free cap,** only `broadcast` sends pause. Reminders, replies and login codes keep going and still count. Warning emails go out at 80% and 100%.
- **MMS** counts as 3 units.
- Constants are in `config/billing.js`.

## How it works
- **Single path.** Every send goes through `api::sms.sms.send()` (`src/api/sms/services/sms.js`):
  1. resolve the garden and org (`api::billing.resolver`);
  2. gate (`api::billing.usage.canSend`, which always allows in Phase 1);
  3. send via `api::sms.transport`;
  4. write a ledger row (`api::billing.usage.record`).
  - `sendSms`, `handleSms` and `sendContactCard` are thin wrappers around it.
- **One Twilio client.** `src/api/sms/services/transport.js` is the only place that builds a Twilio client. Dry-run applies when `SMS_DRY_RUN`, `ENVIRONMENT=test` or `NODE_ENV=test` is set, and then nothing reaches Twilio. Staging still skips weekly-schedule texts, as it did before.
- **Ledger.** `sms-usage` (`sms_usages` table) is private: it has no routes and no permissions.
  - It stores org and garden **documentId strings** plus segments, units, category and source.
  - Segments come from Twilio's `numSegments`, falling back to `src/utils/sms-segments.js`.
- **Categories.** Every call site tags one:

  | Category | Sends |
  |---|---|
  | `broadcast` | manager blasts and event announcements |
  | `reminder` | cron water/task/event reminders, poll reminders, weekly schedule |
  | `transactional` | replies to inbound texts, pass/transfer, RSVP, invites |
  | `system` | login codes, vacation check-ins; never billed |
  | (untagged) | treated as `transactional`, with a warning |

- **TwiML replies** from `POST /api/sms` are metered separately. Replies Twilio blocks are skipped: any opt-out keyword, or a sender who is already opted out.
- **Signature check.** `POST /api/sms` verifies Twilio's signature against `TWILIO_WEBHOOK_URL`. `TWILIO_SIGNATURE_MODE` is `log` (the default) or `enforce`.
- **Every garden has an org.**
  - A Document Service middleware on garden `create` makes an org when none is given (`api::billing.coverage`).
  - Existing gardens are handled by `scripts/audit-org-coverage.js` and `scripts/backfill-garden-orgs.js`. The backfill previews by default; `--apply` writes, and `--map` points gardens at a shared org, consolidating multi-garden operators.
- **Reconcile.** `scripts/reconcile-twilio-usage.js` compares a month of the ledger with Twilio's usage records and exits 1 above 2% drift.

## Why it's built this way (don't undo these)
- **documentId strings, not relations, in the ledger.** Organization and garden are draft & publish, and publishing re-inserts the published row with a new numeric id. A relation would end up pointing at deleted rows.
- **No garden lifecycle hook for auto-orgs.** v5 publish fires `beforeCreate`/`afterCreate` again, which would make duplicate orgs. The Document Service middleware runs once per real create.
- **The backfill writes rows directly** (`db.query` on each garden row). `documents().update`/`publish` would publish managers' pending draft edits.
- **Metering fails open.** A resolver or ledger error is logged and the text still goes out.
- **A blocked send returns `{blocked:true}` and never throws.** Blast loops treat errors as opt-out signals (`SmsOptOut.handleSendError`).
- **The gate runs before the `message` row is written.** `message` rows drive conversation state (`validateQuestion`), so one must never exist for a text that wasn't sent.
- **Billing data stays off `organization`.** That type is populated into public garden pages, so anything billing-related goes in its own private content type.
- **The repo is public,** so all enforcement and webhook verification is server-side.

## Rollout
1. Deploy. Set `TWILIO_WEBHOOK_URL` and leave the signature mode as `log`.
2. Run the audit. Build a `--map` grouping gardens under their real orgs, then run the backfill as a preview, then with `--apply`.
3. Run the reconcile daily for about a week and expect under 2% drift.
4. Once the logs show no `valid=false` on real traffic, set `TWILIO_SIGNATURE_MODE=enforce`.

## Next
- **Phase 2 (not built):** org managers, `org-subscription`, the broadcast cap with a 409 preflight on blasts, alert emails, the usage API and page in garden-vue, and a manager check on `groupSms`.
  - **Open question:** volunteer-day and poll reminders are the largest mass sends but are tagged `reminder`, so the cap never pauses them. Revisit when designing Phase 2.
- **Phase 3:** Stripe Checkout, the customer portal, meter-event reporting and webhooks.
