#!/usr/bin/env node
/**
 * Renames content-type columns that collide with Strapi v5's reserved `status`
 * query key, before Strapi boots.
 *
 * Strapi v5 reserves `status` for the draft/publish selector, so an attribute
 * literally named `status` breaks every admin content-manager save with
 * "Validation error: Invalid status". Affected attributes were renamed in the
 * schema; this migration carries each existing column (and its data) across so
 * schema sync doesn't drop the old column and recreate an empty one.
 *
 * Idempotent: skips any rename whose target column already exists.
 *
 * Usage:
 *   node scripts/rename-reserved-status-columns.js
 */

const { Client } = require('pg');

// table -> [fromColumn, toColumn]
const RENAMES = [
  ['projects', 'status', 'review_status'],
  ['garden_tasks', 'status', 'task_status'],
];

function getDatabaseConfig() {
  return {
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME || 'strapi',
    user: process.env.DATABASE_USERNAME || 'strapi',
    password: process.env.DATABASE_PASSWORD || 'strapi',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rowCount > 0;
}

async function renameReservedStatusColumns() {
  const client = new Client(getDatabaseConfig());
  console.log('Connecting to PostgreSQL to rename reserved `status` columns...');
  await client.connect();

  try {
    for (const [table, from, to] of RENAMES) {
      const hasTo = await columnExists(client, table, to);
      if (hasTo) {
        console.log(`  ${table}.${to} already present — nothing to do.`);
        continue;
      }
      const hasFrom = await columnExists(client, table, from);
      if (!hasFrom) {
        console.log(`  ${table}.${from} not found — nothing to rename.`);
        continue;
      }
      await client.query(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
      console.log(`  Renamed ${table}.${from} -> ${table}.${to}.`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  renameReservedStatusColumns().catch((error) => {
    console.error('Reserved `status` column rename failed:', error);
    process.exit(1);
  });
}

module.exports = renameReservedStatusColumns;
