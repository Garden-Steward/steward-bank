#!/usr/bin/env node
/**
 * Read-only audit: classifies every garden by its organization link
 * (OK, ORPHAN, PUBLISHED_UNLINKED, DRAFT_UNLINKED, MISMATCH, ORG_UNPUBLISHED).
 *
 * This boots Strapi, which is not a neutral act:
 *   - Strapi arms and starts the cron jobs inside strapi.load(). We set
 *     CRON_ENABLED=false below, before Strapi is required, so none of this
 *     app's jobs are registered.
 *   - strapi.load() also runs schema sync, which issues DDL. Run this on the
 *     DEPLOYED image (fly ssh console), never from a laptop or a branch whose
 *     schema differs from production.
 *
 * It makes no writes and sends nothing.
 *
 * Usage (against prod):
 *   fly ssh console -C "node scripts/audit-org-coverage.js [--json]"
 */

// Must be set before @strapi/strapi is required, so config/server.js reads it.
process.env.CRON_ENABLED = 'false';

const { createStrapi } = require('@strapi/strapi');

const asJson = process.argv.includes('--json');

async function main() {
  const strapi = await createStrapi().load();
  try {
    const result = await strapi.service('api::billing.coverage').audit();

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.table(
      result.gardens.map(({ documentId, title, sms_slug, hasPublished, draftOrg, publishedOrg, classification }) => ({
        documentId, title, sms_slug, hasPublished, draftOrg, publishedOrg, classification,
      }))
    );
    console.log('');
    for (const [classification, count] of Object.entries(result.summary)) {
      console.log(`${classification}: ${count}`);
    }
    if (result.summary.DRAFT_UNLINKED) {
      console.log('\nDRAFT_UNLINKED gardens are fixed by the backfill action "link-draft-row".');
    }
  } finally {
    await strapi.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
