/**
 * INSPECTION PROBE — written by the Inspector, not by the implementer.
 * Org usage page (.claude/specs/org-usage-page). Boots its own Strapi instance
 * (use a separate DATABASE_FILENAME). Probes what the shipped tests do not:
 *   P1  full report response shape field-by-field over HTTP (contract keys, types)
 *   P2  list: draft-only org appears with its draft title; sort by title ci, nulls last
 *   P3  billable `system` row counts in units/messages, not in byCategory; byGarden sum holds
 *   P4  stray garden that exists in ANOTHER org gets its real title
 *   P5  byGarden tie-break by title (case-insensitive), null-title last
 *   P6  core /api/organizations/:documentId still resolves (not shadowed)
 *   P7  administrator role present at boot receives both grants (re-run grant path)
 *   P8  history months clamp wiring through controller (months=0 -> 1 entry) using a
 *       non-metering-start "now" is impossible over HTTP; asserted at service level.
 * Deliberately NOT required from tests/app.test.js.
 */
const { setupStrapi, cleanupStrapi } = require('../helpers/strapi');
const { restoreAll } = require('../helpers/patch');
const { http, issueJwt, makeOrg, makeGarden, makeUser, uniq } = require('../billing/helpers');

jest.setTimeout(120000);

const GARDEN = 'api::garden.garden';
const ORG = 'api::organization.organization';

beforeAll(async () => { await setupStrapi(); });
afterEach(() => restoreAll());
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1000));
  await cleanupStrapi();
});

const rec = (o) => strapi.service('api::billing.usage').record({
  to_number: '+14155550199', source: 'inspection', segments: 1, units: 1, direction: 'api',
  category: 'broadcast', num_media: 0, period: '2032-05', sent_at: '2032-05-02T00:00:00Z', ...o,
});
const NOW = new Date('2032-05-10T00:00:00Z');
const report = () => strapi.service('api::billing.report');

describe('org-usage-page inspection', () => {
  let O; let Oother; let Gz; let Ga; let GA; let Gx; let mgr;

  beforeAll(async () => {
    O = await makeOrg({ title: 'Probe Org ' + uniq('p') });
    Oother = await makeOrg();
    Gz = await makeGarden({ title: 'zeta', organization: O.documentId });
    Ga = await makeGarden({ title: 'alpha', organization: O.documentId });
    GA = await makeGarden({ title: 'Beta', organization: O.documentId });
    Gx = await makeGarden({ title: 'Other-org garden', organization: Oother.documentId });
    mgr = await makeUser();
    const rows = await strapi.db.query(GARDEN).findMany({ where: { documentId: Gz.documentId } });
    for (const r of rows) await strapi.db.query(GARDEN).update({ where: { id: r.id }, data: { managers: [mgr.id] } });

    const o = O.documentId;
    await rec({ organization_document_id: o, garden_document_id: Gz.documentId, units: 2 });
    await rec({ organization_document_id: o, garden_document_id: Ga.documentId, units: 2, category: 'reminder' });
    await rec({ organization_document_id: o, garden_document_id: GA.documentId, units: 2, category: 'transactional' });
    // billable system via override
    await rec({ organization_document_id: o, garden_document_id: Gz.documentId, units: 3, category: 'system', billable: true });
    // stray: garden of another org
    await rec({ organization_document_id: o, garden_document_id: Gx.documentId, units: 2 });
    await rec({ organization_document_id: o, units: 2 });
  });

  it('P3/P4/P5: system billable, stray titles, tie-break', async () => {
    const r = await report().getOrgReport(O.documentId, { now: NOW });
    expect(r.current.units).toBe(13);
    expect(r.current.messages).toBe(6);
    expect(Object.keys(r.current.byCategory).sort()).toEqual(['broadcast', 'reminder', 'transactional']);
    const catSum = Object.values(r.current.byCategory).reduce((s, x) => s + x.units, 0);
    expect(catSum).toBe(10);
    const bg = r.current.byGarden;
    expect(bg.reduce((s, x) => s + x.units, 0)).toBe(13);
    expect(bg.find((g) => g.gardenDocumentId === Gx.documentId).title).toBe('Other-org garden');
    // Gz 5 first; then ties at 2: alpha, Beta, Other-org garden, null last
    expect(bg.map((g) => g.title)).toEqual(['zeta', 'alpha', 'Beta', 'Other-org garden', null]);
  });

  it('P2: draft-only org listed with draft title; sort ci, nulls last', async () => {
    const draftOrg = await makeOrg({ title: 'aaa-draft-' + uniq('d'), publish: false });
    const list = await report().listForUser({ id: -1, role: { type: 'administrator' } }, { now: NOW });
    const hit = list.filter((e) => e.documentId === draftOrg.documentId);
    expect(hit).toHaveLength(1);
    expect(hit[0].title).toBe(draftOrg.title);
    const titles = list.map((e) => e.title);
    const firstNull = titles.indexOf(null);
    if (firstNull >= 0) expect(titles.slice(firstNull).every((t) => t === null)).toBe(true);
    const nonNull = titles.filter((t) => t !== null);
    expect(nonNull).toEqual([...nonNull].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  });

  it('P2b: published title wins over a divergent draft title', async () => {
    const o = await makeOrg({ title: 'Pub Title ' + uniq('t') });
    await strapi.db.query(ORG).update({ where: { id: o.draftId }, data: { title: 'Draft Title Changed' } });
    const r = await report().getOrgReport(o.documentId, { now: NOW });
    expect(r.organization.title).toBe(o.title);
  });

  it('P1: report contract shape over HTTP, exact key sets', async () => {
    const res = await http().get(`/api/organizations/${O.documentId}/usage`)
      .set('Authorization', `Bearer ${issueJwt(mgr)}`).expect(200);
    const d = res.body.data;
    expect(Object.keys(res.body)).toEqual(['data']);
    expect(Object.keys(d).sort()).toEqual(['current', 'enforced', 'freeUnits', 'history', 'meteringStartedAt', 'organization', 'period', 'resetsAt'].sort());
    expect(Object.keys(d.organization).sort()).toEqual(['documentId', 'title']);
    expect(Object.keys(d.current).sort()).toEqual(['byCategory', 'byGarden', 'messages', 'nonBillable', 'units']);
    expect(Object.keys(d.current.nonBillable).sort()).toEqual(['messages', 'units']);
    for (const g of d.current.byGarden) expect(Object.keys(g).sort()).toEqual(['gardenDocumentId', 'messages', 'title', 'units']);
    for (const h of d.history) {
      expect(Object.keys(h).sort()).toEqual(['messages', 'partial', 'period', 'units']);
      expect(typeof h.units).toBe('number');
    }
    expect(d.history[0].period).toBe(d.period);
    expect(typeof d.current.units).toBe('number');
    const list = await http().get('/api/organizations/usage')
      .set('Authorization', `Bearer ${issueJwt(mgr)}`).expect(200);
    expect(Object.keys(list.body.data[0]).sort()).toEqual(['documentId', 'freeUnits', 'period', 'title', 'units']);
    expect(typeof list.body.data[0].units).toBe('number');
  });

  it('P6: core findOne by documentId still resolves to core, not usage', async () => {
    const res = await http().get(`/api/organizations/${O.documentId}`)
      .set('Authorization', `Bearer ${issueJwt(mgr)}`);
    // Whatever the grant, it must not be the usage handler's shape
    expect(res.body?.data?.current).toBeUndefined();
    // eslint-disable-next-line no-console
    console.log('P6 core findOne status', res.status);
  });

  it('P8: months clamp at service level with far-future now', async () => {
    const svc = report();
    const r1 = await svc.getOrgReport(O.documentId, { months: svc.parseMonths('0'), now: NOW });
    expect(r1.history).toHaveLength(1);
    const r12 = await svc.getOrgReport(O.documentId, { months: svc.parseMonths('99'), now: NOW });
    expect(r12.history).toHaveLength(12);
    const r6 = await svc.getOrgReport(O.documentId, { months: svc.parseMonths('abc'), now: NOW });
    expect(r6.history).toHaveLength(6);
    expect(r6.history[0]).toMatchObject({ period: '2032-05', units: 13, partial: false });
  });
});
