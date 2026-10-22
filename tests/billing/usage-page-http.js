'use strict';

/**
 * GET /api/organizations/usage and /api/organizations/:documentId/usage.
 * Covers AC1 to AC7, AC8 (list half), AC13, AC15, AC16, AC17 over HTTP.
 */

const { http, issueJwt, makeOrg, makeGarden, makeUser, uniq } = require('./helpers');

const GARDEN = 'api::garden.garden';
const PERM = 'plugin::users-permissions.permission';
const ROLE = 'plugin::users-permissions.role';
const ACTIONS = ['api::organization.organization.usageList', 'api::organization.organization.usageReport'];
const NOT_FOUND = { data: null, error: { status: 404, name: 'NotFoundError', message: 'Organization not found' } };

describe('billing: usage-page http', () => {
  const period = new Date().toISOString().slice(0, 7);
  let O1;
  let O2;
  let G1;
  let G2;
  let mgr;
  let vol;
  let nobody;
  let admin;
  let draftOnly;
  let pubOnly;
  const jwt = {};

  const get = (path, token) => {
    const req = http().get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const setOnRows = async (garden, rowKey, data) => {
    await strapi.db.query(GARDEN).update({ where: { id: garden[rowKey].id }, data });
  };

  beforeAll(async () => {
    let role = await strapi.db.query(ROLE).findOne({ where: { type: 'administrator' } });
    if (!role) {
      role = await strapi.db.query(ROLE).create({
        data: { name: 'Administrator', description: 'usage-page test', type: 'administrator' },
      });
    }
    const have = await strapi.db.query(PERM).findMany({ where: { role: role.id, action: { $in: ACTIONS } } });
    for (const action of ACTIONS.filter((a) => !have.some((p) => p.action === a))) {
      await strapi.db.query(PERM).create({ data: { action, role: role.id } });
    }
    admin = await makeUser({ role: role.id });

    O1 = await makeOrg();
    O2 = await makeOrg();
    G1 = await makeGarden({ organization: O1.documentId });
    G2 = await makeGarden({ organization: O2.documentId });

    mgr = await makeUser();
    vol = await makeUser();
    nobody = await makeUser();
    draftOnly = await makeUser();
    pubOnly = await makeUser();

    for (const key of ['draft', 'published']) {
      await setOnRows(G1, key, { managers: [mgr.id], volunteers: [vol.id] });
    }
    await setOnRows(G2, 'draft', { managers: [draftOnly.id] });
    await setOnRows(G2, 'published', { managers: [pubOnly.id] });

    for (const u of [['mgr', mgr], ['vol', vol], ['nobody', nobody], ['admin', admin], ['draftOnly', draftOnly], ['pubOnly', pubOnly]]) {
      jwt[u[0]] = issueJwt(u[1]);
    }

    for (const units of [3, 2]) {
      await strapi.service('api::billing.usage').record({
        organization_document_id: O1.documentId,
        garden_document_id: G1.documentId,
        to_number: '+14155550100',
        source: 'usage-page-http-test',
        segments: 1,
        units,
        direction: 'api',
        category: 'broadcast',
        num_media: 0,
        period,
        sent_at: new Date().toISOString(),
      });
    }
  });

  it('AC1/AC8/AC17: manager list has exactly O1 with its units', async () => {
    const res = await get('/api/organizations/usage', jwt.mgr).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toEqual([{
      documentId: O1.documentId, title: O1.title, period, units: 5, freeUnits: 500,
    }]);
    const rep = await get(`/api/organizations/${O1.documentId}/usage`, jwt.mgr).expect(200);
    expect(rep.headers['cache-control']).toBe('no-store');
    expect(rep.body.data.current.units).toBe(res.body.data[0].units);
  });

  it('AC2: a user managing nothing gets an empty list', async () => {
    const res = await get('/api/organizations/usage', jwt.nobody).expect(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('AC3: a volunteer sees nothing and gets 404', async () => {
    const list = await get('/api/organizations/usage', jwt.vol).expect(200);
    expect(list.body.data).toEqual([]);
    await get(`/api/organizations/${O1.documentId}/usage`, jwt.vol).expect(404);
  });

  it('AC4: admin sees every org once and can open any report', async () => {
    const res = await get('/api/organizations/usage', jwt.admin).expect(200);
    const ids = res.body.data.map((o) => o.documentId);
    expect(ids).toContain(O1.documentId);
    expect(ids).toContain(O2.documentId);
    expect(new Set(ids).size).toBe(ids.length);
    await get(`/api/organizations/${O2.documentId}/usage`, jwt.admin).expect(200);
  });

  it('AC5/AC17: an org the caller cannot see 404s identically to a missing one', async () => {
    const hidden = await get(`/api/organizations/${O2.documentId}/usage`, jwt.mgr).expect(404);
    const missing = await get(`/api/organizations/does-not-exist-${uniq('x')}/usage`, jwt.mgr).expect(404);
    expect(hidden.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(hidden.body);
    expect(hidden.headers['cache-control']).toBe('no-store');
  });

  it('AC6: no token is 403, a bad token is 401', async () => {
    for (const path of ['/api/organizations/usage', `/api/organizations/${O1.documentId}/usage`]) {
      await get(path).expect(403);
      await get(path, 'not-a-jwt').expect(401);
    }
  });

  it('AC7: a manager on only the draft row, or only the published row, has access', async () => {
    await get(`/api/organizations/${O2.documentId}/usage`, jwt.draftOnly).expect(200);
    await get(`/api/organizations/${O2.documentId}/usage`, jwt.pubOnly).expect(200);
  });

  it('AC13: report carries the period fields', async () => {
    const res = await get(`/api/organizations/${O1.documentId}/usage`, jwt.mgr).expect(200);
    const d = res.body.data;
    expect(d.period).toBe(period);
    expect(d.resetsAt.endsWith('-01T00:00:00.000Z')).toBe(true);
    expect(d.enforced).toBe(false);
    expect(d.meteringStartedAt).toBe('2026-10-21');
    expect(d.freeUnits).toBe(500);
  });

  it('AC15: odd months values are not errors and history is floored', async () => {
    for (const months of ['0', '99', 'abc']) {
      const res = await get(`/api/organizations/${O1.documentId}/usage?months=${months}`, jwt.mgr).expect(200);
      const h = res.body.data.history;
      expect(h.length).toBeLessThanOrEqual(12);
      expect(h.length).toBeGreaterThanOrEqual(1);
      for (const e of h) expect(e.period >= '2026-10').toBe(true);
    }
  });

  it('AC16: grants are on authenticated, not public; core find is not broken', async () => {
    const perms = await strapi.db.query(PERM).findMany({ where: { action: { $in: ACTIONS } }, populate: ['role'] });
    for (const action of ACTIONS) {
      const types = perms.filter((p) => p.action === action).map((p) => p.role && p.role.type);
      expect(types).toContain('authenticated');
      expect(types).not.toContain('public');
    }
    const res = await get('/api/organizations');
    expect(res.status).not.toBe(500);
  });
});
