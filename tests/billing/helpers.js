'use strict';

/**
 * Shared fixtures for the billing integration tests (tests/billing/*.js).
 *
 * Every function uses the global `strapi` at call time, so this file can be
 * required before the shared instance has booted.
 */

const request = require('supertest');
const { patchService } = require('../helpers/patch');

const UID = {
  ORG: 'api::organization.organization',
  GARDEN: 'api::garden.garden',
  USER: 'plugin::users-permissions.user',
  LEDGER: 'api::sms-usage.sms-usage',
  TASK: 'api::garden-task.garden-task',
  EVENT: 'api::volunteer-day.volunteer-day',
  MESSAGE: 'api::message.message',
  CAMPAIGN: 'api::sms-campaign.sms-campaign',
};

let seq = 0;
let phoneSeq = 0;

const uniq = (prefix) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

// Only billing tests use the +1415 prefix.
const uniqPhone = () => '+1415' + String(5550000 + ++phoneSeq).padStart(7, '0');

const http = () => request(strapi.server.httpServer);

const issueJwt = (user) => strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });

/** Draft and published rows of a garden document ({ draft, published }, null when absent). */
const gardenRows = async (documentId) => {
  const rows = await strapi.db.query(UID.GARDEN).findMany({
    where: { documentId },
    populate: { organization: { select: ['id', 'documentId', 'publishedAt'] } },
  });
  return {
    draft: rows.find((r) => !r.publishedAt) || null,
    published: rows.find((r) => r.publishedAt) || null,
  };
};

const makeOrg = async ({ title = uniq('Billing Org'), publish = true } = {}) => {
  const created = await strapi.documents(UID.ORG).create({
    data: { title },
    ...(publish && { status: 'published' }),
  });
  const rows = await strapi.db.query(UID.ORG).findMany({
    where: { documentId: created.documentId },
    select: ['id', 'publishedAt'],
  });
  const draft = rows.find((r) => !r.publishedAt);
  const published = rows.find((r) => r.publishedAt);
  return {
    documentId: created.documentId,
    title,
    draftId: draft ? draft.id : null,
    publishedId: published ? published.id : null,
  };
};

const makeGarden = async ({
  title = uniq('Billing Garden'),
  sms_slug = uniq('bill'),
  organization = null,
  publish = true,
} = {}) => {
  const created = await strapi.documents(UID.GARDEN).create({
    data: { title, sms_slug, ...(organization && { organization }) },
    ...(publish && { status: 'published' }),
  });
  if (!organization) {
    // Guarantees an org-less garden even once Slice 1c's auto-org middleware lands.
    const rows = await strapi.db.query(UID.GARDEN).findMany({
      where: { documentId: created.documentId },
      select: ['id'],
    });
    for (const row of rows) {
      await strapi.db.query(UID.GARDEN).update({ where: { id: row.id }, data: { organization: null } });
    }
  }
  return { documentId: created.documentId, title, sms_slug, ...(await gardenRows(created.documentId)) };
};

const makeUser = async (overrides = {}) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  return strapi.db.query(UID.USER).create({
    data: {
      username: uniq('billing-user'),
      email: `${uniq('billing')}@example.com`,
      provider: 'local',
      confirmed: true,
      firstName: 'Bill',
      lastName: 'Ing',
      phoneNumber: uniqPhone(),
      role: role.id,
      ...overrides,
    },
  });
};

/**
 * Reads through the Document Service on purpose: rows with a null `publishedAt`
 * would be invisible here, which is what AC23 checks.
 */
const ledgerFind = (filters = {}) => strapi.documents(UID.LEDGER).findMany({
  filters,
  populate: ['user'],
  sort: 'id:asc',
});

/** For fire-and-forget send paths: re-reads until `count` rows exist or the timeout passes. Never throws. */
const pollLedger = async (filters, { count = 1, timeoutMs = 2000, intervalMs = 50 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let rows = await ledgerFind(filters);
  while (rows.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    rows = await ledgerFind(filters);
  }
  return rows;
};

const ledgerCount = (where = {}) => strapi.db.query(UID.LEDGER).count({ where });

/** Sets env vars (`undefined` deletes). Returns restore(). */
const setEnv = (vars) => {
  const old = {};
  for (const key of Object.keys(vars)) {
    old[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return () => {
    for (const key of Object.keys(old)) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  };
};

/** Stubs api::sms.transport `create`; returns the jest.fn. Undone by the global afterEach. */
const stubTransport = (impl) => patchService(
  'api::sms.transport',
  'create',
  jest.fn(impl || (async () => ({ sid: 'SMstub', numSegments: '1', numMedia: '0', simulated: false }))),
);

const clearResolver = () => strapi.service('api::billing.resolver')?.clearCache?.();

module.exports = {
  UID,
  uniq,
  uniqPhone,
  http,
  issueJwt,
  gardenRows,
  makeOrg,
  makeGarden,
  makeUser,
  ledgerFind,
  pollLedger,
  ledgerCount,
  setEnv,
  stubTransport,
  clearResolver,
};
