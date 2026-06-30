#!/usr/bin/env node
/**
 * Adds schema.json columns to PostgreSQL before Strapi v5 internal migrations run.
 *
 * Strapi's core::5.0.0-discard-drafts migration copies all scalar fields from the
 * content-type schema, but schema sync hasn't created new columns yet on a v4 DB.
 * Without this step, boot fails with "column X does not exist".
 *
 * Usage:
 *   node scripts/pre-migrate-v5-columns.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SCALAR_TYPES = {
  string: 'varchar(255)',
  text: 'text',
  richtext: 'text',
  boolean: 'boolean',
  integer: 'integer',
  biginteger: 'bigint',
  float: 'double precision',
  decimal: 'decimal',
  date: 'date',
  time: 'time',
  datetime: 'timestamptz',
  timestamp: 'timestamptz',
  json: 'jsonb',
  enumeration: 'varchar(255)',
  email: 'varchar(255)',
  password: 'varchar(255)',
  uid: 'varchar(255)',
};

function findSchemaFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSchemaFiles(fullPath));
    } else if (entry.name === 'schema.json') {
      results.push(fullPath);
    }
  }
  return results;
}

function loadDraftPublishScalars() {
  const schemaDirs = [
    path.join(__dirname, '../src/api'),
    path.join(__dirname, '../src/extensions'),
  ];

  const tables = new Map();

  for (const dir of schemaDirs) {
    for (const schemaPath of findSchemaFiles(dir)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      if (!schema.collectionName || schema.options?.draftAndPublish !== true) {
        continue;
      }

      const table = schema.collectionName;
      if (!tables.has(table)) {
        tables.set(table, []);
      }

      for (const [attributeName, attribute] of Object.entries(schema.attributes || {})) {
        const sqlType = SCALAR_TYPES[attribute.type];
        if (!sqlType) continue;
        tables.get(table).push({ column: attributeName, sqlType });
      }
    }
  }

  return tables;
}

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
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [table, column]
  );
  return result.rowCount > 0;
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [table]
  );
  return result.rowCount > 0;
}

async function preMigrateV5Columns() {
  const tables = loadDraftPublishScalars();
  const client = new Client(getDatabaseConfig());

  console.log('Connecting to PostgreSQL for pre-v5 column migration...');
  await client.connect();

  try {
    let added = 0;

    for (const [table, columns] of tables.entries()) {
      if (!(await tableExists(client, table))) {
        console.log(`  Skipping ${table} (table does not exist yet)`);
        continue;
      }

      for (const { column, sqlType } of columns) {
        if (await columnExists(client, table, column)) {
          continue;
        }

        console.log(`  Adding ${table}.${column} (${sqlType})`);
        await client.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`
        );
        added += 1;
      }
    }

    console.log(`Pre-v5 column migration complete (${added} column(s) added).`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  preMigrateV5Columns().catch((error) => {
    console.error('Pre-v5 column migration failed:', error);
    process.exit(1);
  });
}

module.exports = preMigrateV5Columns;
