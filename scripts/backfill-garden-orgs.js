#!/usr/bin/env node
/**
 * Links gardens that have no organization (see audit-org-coverage.js).
 *
 * DRY RUN BY DEFAULT. Never pass --apply until the --map file has been
 * reviewed (Decision Q1(b)). Actions printed:
 *   link-mapped-org     ORPHAN garden with an entry in --map
 *   create-org          ORPHAN garden with no map entry (creates an org titled like the garden)
 *   link-published-row  PUBLISHED_UNLINKED: copy the draft's org onto the published row
 *   link-draft-row      DRAFT_UNLINKED: copy the published row's org onto the draft row
 *
 * --map <file.json> takes { "<gardenDocumentId>": "<organizationDocumentId>" }.
 *
 * This boots Strapi: CRON_ENABLED=false is set below before Strapi is required,
 * but strapi.load() still runs schema sync (DDL). Run on the DEPLOYED image:
 *   fly ssh console -C "node scripts/backfill-garden-orgs.js [--map file.json] [--apply]"
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');

let map = {};
const mapIdx = argv.indexOf('--map');
if (mapIdx !== -1) {
  const p = argv[mapIdx + 1];
  try {
    if (!p || p.startsWith('--')) throw new Error('--map requires a file path');
    map = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
    const ok = map && typeof map === 'object' && !Array.isArray(map)
      && Object.entries(map).every(([k, v]) => k !== '' && typeof v === 'string' && v !== '');
    if (!ok) throw new Error('map must be an object of non-empty string keys and values');
  } catch (err) {
    console.error(`Invalid --map: ${err.message}`);
    process.exit(2);
  }
}

// Must be set before @strapi/strapi is required, so config/server.js reads it.
process.env.CRON_ENABLED = 'false';

const { createStrapi } = require('@strapi/strapi');

const fmtLinks = (links) => links.map((l) => `${l.version}:${l.gardenRowId}->${l.orgRowId}`).join(', ');

async function main() {
  const strapi = await createStrapi().load();
  try {
    const { actions, skipped } = await strapi.service('api::billing.coverage').backfill({ apply, map });

    for (const a of actions) {
      const from = a.previousOrgs?.length ? ` (was ${a.previousOrgs.join(', ')})` : '';
      console.log(`${a.type} ${a.gardenDocumentId} "${a.gardenTitle}" -> ${a.organizationDocumentId}${from} (links: ${fmtLinks(a.links)})`);
    }
    for (const s of skipped) {
      console.log(`skipped ${s.gardenDocumentId} -> ${s.organizationDocumentId} (${s.reason})`);
    }
    console.log(`\n${actions.length} action(s), ${skipped.length} skipped.`);
    if (!apply) console.log('DRY RUN: nothing written. Re-run with --apply to write.');
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
