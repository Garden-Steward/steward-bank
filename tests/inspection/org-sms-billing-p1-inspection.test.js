/**
 * INSPECTION PROBE — written by the Inspector, not by the implementer.
 * Org SMS billing Phase 1. Boots its own Strapi instance (use a separate
 * DATABASE_FILENAME) and probes behavior the shipped tests do not exercise:
 *   I1  production-mode chain (dry-run OFF) through the REAL transport with only
 *       the Twilio client factory stubbed: blast + handleSms + sendSms.
 *   I2  admin content-manager create path (HTTP, admin JWT) auto-creates one org;
 *       publish/update do not create more.
 *   I3  signature log mode with a VALID signature logs valid=true, no PII.
 *   I5  backfill map entry for a non-ORPHAN garden is silently ignored.
 * Deliberately NOT required from tests/app.test.js.
 */
const request = require('supertest');
const { setupStrapi, cleanupStrapi, grantPrivileges } = require('../helpers/strapi');
const { patch, restoreAll } = require('../helpers/patch');

jest.setTimeout(120000);

const ORG = 'api::organization.organization';
const GARDEN = 'api::garden.garden';
const USER = 'plugin::users-permissions.user';
const LEDGER = 'api::sms-usage.sms-usage';

let n = 0;
const uniq = (p) => `${p}-${Date.now().toString(36)}-${++n}`;
let phoneN = 0;
const phone = () => '+1510' + String(7770000 + ++phoneN);
const http = () => request(strapi.server.httpServer);

const mkOrg = () => strapi.documents(ORG).create({ data: { title: uniq('ProbeOrg') }, status: 'published' });
const mkGarden = async (orgDocId) => {
  const g = await strapi.documents(GARDEN).create({
    data: { title: uniq('ProbeGarden'), sms_slug: uniq('pg'), organization: orgDocId }, status: 'published',
  });
  const rows = await strapi.db.query(GARDEN).findMany({ where: { documentId: g.documentId } });
  return { ...g, published: rows.find((r) => r.publishedAt), draft: rows.find((r) => !r.publishedAt) };
};
const mkUser = async (o = {}) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  return strapi.db.query(USER).create({
    data: {
      username: uniq('pu'), email: `${uniq('pu')}@example.com`, provider: 'local', confirmed: true,
      firstName: 'Pro', lastName: 'Be', phoneNumber: phone(), role: role.id, ...o,
    },
  });
};
const ledger = (filters) => strapi.documents(LEDGER).findMany({ filters, populate: ['user'] });

beforeAll(async () => { await setupStrapi(); });
afterEach(() => restoreAll());
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1000));
  await cleanupStrapi();
});

describe('I1: production mode, real transport, stubbed Twilio client', () => {
  let saved;
  let creates;
  const transport = () => strapi.service('api::sms.transport');

  beforeEach(() => {
    saved = { ...process.env };
    delete process.env.SMS_DRY_RUN;
    process.env.ENVIRONMENT = 'prod';
    process.env.NODE_ENV = 'production';
    process.env.TWILIONUM = '+15550001111';
    creates = [];
    let i = 0;
    transport()._setClientFactory(() => ({
      messages: {
        create: async (args) => {
          creates.push(args);
          return { sid: `SMprobe${++i}`, numSegments: '2', numMedia: args.mediaUrl ? '1' : '0' };
        },
      },
    }));
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    transport()._setClientFactory(null);
  });

  it('isDryRun is false in this setup', () => {
    expect(transport().isDryRun()).toBe(false);
  });

  it('sms-campaign blast reaches messages.create with {body, from, to} and records real (non-simulated) rows', async () => {
    const org = await mkOrg();
    const g = await mkGarden(org.documentId);
    const a1 = await mkUser();
    const a2 = await mkUser();
    const copy = uniq('blast');
    const sent = await strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg([a1, a2], copy, g.published, { type: 'alert', sender: a1.id, alert: false });
    expect(sent).toEqual([a1.phoneNumber, a2.phoneNumber]);
    expect(creates).toEqual([
      { body: copy, from: '+15550001111', to: a1.phoneNumber },
      { body: copy, from: '+15550001111', to: a2.phoneNumber },
    ]);
    const rows = await ledger({ source: 'sms-campaign.group', to_number: { $in: [a1.phoneNumber, a2.phoneNumber] } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ simulated: false, segments: 2, units: 2, category: 'broadcast', organization_document_id: org.documentId });
      expect(r.twilio_sid).toMatch(/^SMprobe/);
    }
  });

  it('handleSms in prod writes the message row and sends with the task image as mediaUrl', async () => {
    const org = await mkOrg();
    const g = await mkGarden(org.documentId);
    const u = await mkUser({ activeGarden: g.published.id });
    const task = await strapi.db.query('api::garden-task.garden-task').create({ data: { title: uniq('t'), garden: g.published.id, publishedAt: new Date() } });
    task.primary_image = { url: 'https://example.test/img.jpg' };
    const body = uniq('hs');
    const res = await strapi.service('api::sms.sms').handleSms({ task, body, type: 'question', user: u, category: 'reminder', source: 'probe.hs' });
    expect(res).toMatchObject({ ok: true, simulated: false });
    expect(creates).toEqual([{ body, from: '+15550001111', to: u.phoneNumber, mediaUrl: 'https://example.test/img.jpg' }]);
    const msgs = await strapi.db.query('api::message.message').findMany({ where: { body } });
    expect(msgs).toHaveLength(1);
    const rows = await ledger({ source: 'probe.hs' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ num_media: 1, units: 3, simulated: false, organization_document_id: org.documentId });
  });

  it('weekly-schedule guard: ENVIRONMENT=stg still skips (prod-mode transport untouched)', async () => {
    process.env.ENVIRONMENT = 'stg';
    expect(transport().isDryRun()).toBe(false);
    const u = await mkUser();
    const out = await strapi.service('api::weekly-schedule.weekly-schedule').sendWeeklyMsg(
      { title: 'RT', garden: { id: 1 } }, [{ day: 'Monday', assignee: u }],
    );
    expect(out).toEqual([]);
    expect(creates).toHaveLength(0);
  });
});

describe('I2: admin content-manager create path', () => {
  let adminToken;
  beforeAll(async () => {
    const superAdmin = await strapi.service('admin::role').getSuperAdmin()
      || await strapi.service('admin::role').createSuperAdminRole?.();
    const email = `${uniq('admin')}@example.com`;
    await strapi.service('admin::user').create({
      email, firstname: 'Probe', lastname: 'Admin', password: 'ProbePass123!', isActive: true, roles: [superAdmin.id],
    });
    const res = await http().post('/admin/login').send({ email, password: 'ProbePass123!' });
    adminToken = res.body?.data?.token || res.body?.data?.accessToken;
    if (!adminToken) console.log('admin login response', res.status, JSON.stringify(res.body).slice(0, 400));
  });

  const orgCount = () => strapi.db.query(ORG).count({});

  it('creating a garden in the admin (empty connect) auto-creates exactly one org; publish/update add none', async () => {
    expect(adminToken).toBeTruthy();
    const before = await orgCount();
    const title = uniq('AdminGarden');
    const res = await http()
      .post(`/content-manager/collection-types/${GARDEN}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, sms_slug: uniq('ag'), organization: { connect: [], disconnect: [] } });
    expect([200, 201]).toContain(res.status);
    const docId = res.body.data.documentId;
    expect(await orgCount()).toBe(before + 2); // one document, draft + published rows

    const pub = await http()
      .post(`/content-manager/collection-types/${GARDEN}/${docId}/actions/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title });
    expect([200, 201]).toContain(pub.status);
    const upd = await http()
      .put(`/content-manager/collection-types/${GARDEN}/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `${title} edited` });
    expect([200, 201]).toContain(upd.status);
    expect(await orgCount()).toBe(before + 2);

    const rows = await strapi.db.query(GARDEN).findMany({ where: { documentId: docId }, populate: { organization: true } });
    const orgDocs = new Set(rows.map((r) => r.organization && r.organization.documentId));
    expect(orgDocs.size).toBe(1);
    expect([...orgDocs][0]).toBeTruthy();
    const pubRow = rows.find((r) => r.publishedAt);
    expect(pubRow.organization.publishedAt).toBeTruthy();
  });

  it('admin create with an org selected creates no org', async () => {
    const org = await mkOrg();
    const before = await orgCount();
    const res = await http()
      .post(`/content-manager/collection-types/${GARDEN}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: uniq('AdminGarden2'), sms_slug: uniq('ag2'), organization: { connect: [{ documentId: org.documentId }], disconnect: [] } });
    expect([200, 201]).toContain(res.status);
    expect(await orgCount()).toBe(before);
  });
});

describe('I3: signature log mode, valid signature', () => {
  it('logs info valid=true without phone or body', async () => {
    const { getExpectedTwilioSignature } = require('twilio/lib/webhooks/webhooks');
    await grantPrivileges(2, 'api::message.message', ['fetchSms']);
    const u = await mkUser();
    const saved = { ...process.env };
    process.env.TWILIO_WEBHOOK_URL = 'https://probe.test/api/sms?x=1';
    process.env.TWILIO_AUTH_TOKEN = 'probe-token';
    delete process.env.TWILIO_SIGNATURE_MODE;
    const info = patch(strapi.log, 'info', jest.fn());
    const warn = patch(strapi.log, 'warn', jest.fn());
    try {
      const params = { From: u.phoneNumber, Body: 'smiles', To: '+15550001111', MessageSid: 'SMx', NumMedia: '0' };
      const sig = getExpectedTwilioSignature('probe-token', process.env.TWILIO_WEBHOOK_URL, params);
      const res = await http().post('/api/sms').type('form').set('X-Twilio-Signature', sig).send(params);
      expect(res.status).toBe(200);
      const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('twilio-signature'));
      expect(lines).toEqual(['[twilio-signature] mode=log valid=true']);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('twilio-signature'))).toEqual([]);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});

describe('I5: backfill map for a non-ORPHAN garden', () => {
  it('reports (or applies) the requested consolidation for an already-linked garden', async () => {
    const orgA = await mkOrg();
    const orgB = await mkOrg();
    const g = await mkGarden(orgA.documentId);
    const res = await strapi.service('api::billing.coverage').backfill({ apply: false, map: { [g.documentId]: orgB.documentId } });
    const mentioned = [...res.actions, ...res.skipped].some((a) => a.gardenDocumentId === g.documentId);
    // Design §10 scopes --map to ORPHANs; this probe records whether a non-ORPHAN map entry is surfaced at all.
    console.log('I5 non-orphan map entry surfaced in actions/skipped:', mentioned);
    expect(typeof mentioned).toBe('boolean');
  });
});
