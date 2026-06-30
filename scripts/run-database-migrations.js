#!/usr/bin/env node
/**
 * Bootstraps Strapi against the configured database so schema sync and
 * internal v5 migrations run before the app serves traffic.
 *
 * Usage:
 *   node scripts/run-database-migrations.js
 *
 * Fly.io runs this automatically via release_command in fly.toml.
 */

const { createStrapi } = require('@strapi/strapi');
const seedContentPermissionsInternal = require('./seed-content-permissions-internal');
const preMigrateV5Columns = require('./pre-migrate-v5-columns');

async function runMigrations() {
  console.log('Running pre-v5 column migration...');
  await preMigrateV5Columns();

  console.log('Starting Strapi to run database migrations...');
  let strapi;

  try {
    strapi = await createStrapi().load();
    console.log('Database schema sync and internal migrations complete.');

    await seedContentPermissionsInternal(strapi);
    console.log('Post-migration permission setup complete.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    if (strapi) {
      await strapi.destroy();
    }
  }
}

runMigrations().then(() => process.exit(process.exitCode || 0));
