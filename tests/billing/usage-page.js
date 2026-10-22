'use strict';

/**
 * api::billing.report: parseMonths, listForUser, getOrgReport. Covers AC8 to AC15 at service level.
 *
 * Current-month cases use far-future periods (2031-03 current, 2031-01 old) so other billing tests
 * cannot interfere. History cases use a separate org with now = 2027-03-15 so the real
 * METERING_STARTED_AT floor (2026-10) applies.
 */

const { uniq, makeOrg, makeGarden } = require('./helpers');

const usage = () => strapi.service('api::billing.usage');
const report = () => strapi.service('api::billing.report');

const NOW = new Date('2031-03-15T12:00:00Z');
const NOW_HIST = new Date('2027-03-15T00:00:00Z');

const row = (overrides = {}) => ({
  organization_document_id: null,
  garden_document_id: null,
  to_number: '+14155550100',
  source: 'usage-page-test',
  segments: 1,
  units: 1,
  direction: 'api',
  category: 'broadcast',
  num_media: 0,
  period: '2031-03',
  sent_at: '2031-03-10T12:00:00Z',
  ...overrides,
});

describe('billing: usage-page service', () => {
  let O;
  let O2;
  let OR;
  let OH;
  let G1;
  let G2;
  let goneId;
  let rep;

  beforeAll(async () => {
    O = await makeOrg();
    O2 = await makeOrg();
    OR = await makeOrg();
    OH = await makeOrg();
    G1 = await makeGarden({ organization: O.documentId });
    G2 = await makeGarden({ organization: O.documentId });
    goneId = 'gone-' + uniq('g');
    const o = O.documentId;
    const g1 = G1.documentId;

    const rows = [
      row({ organization_document_id: o, garden_document_id: g1, units: 3 }),
      row({ organization_document_id: o, garden_document_id: g1, units: 1 }),
      row({ organization_document_id: o, garden_document_id: g1, units: 2, category: 'reminder' }),
      row({ organization_document_id: o, units: 1, category: 'transactional' }),
      row({ organization_document_id: o, garden_document_id: g1, units: 1, category: 'system', billable: false }),
      row({ organization_document_id: o, garden_document_id: g1, units: 5, simulated: true }),
      row({ organization_document_id: o, garden_document_id: g1, units: 7, blocked: true }),
      row({ organization_document_id: o, garden_document_id: goneId, units: 1, category: 'reminder' }),
      row({ organization_document_id: O2.documentId, units: 100 }),
      row({ organization_document_id: o, units: 50, period: '2031-01', sent_at: '2031-01-10T12:00:00Z' }),
      // Reminder-only org.
      row({ organization_document_id: OR.documentId, units: 4, category: 'reminder' }),
      // History org: floor at 2026-10, rows before it must not appear.
      row({ organization_document_id: OH.documentId, units: 2, period: '2027-01', sent_at: '2027-01-10T00:00:00Z' }),
      row({ organization_document_id: OH.documentId, units: 3, period: '2027-01', sent_at: '2027-01-11T00:00:00Z' }),
      row({ organization_document_id: OH.documentId, units: 9, period: '2027-01', sent_at: '2027-01-12T00:00:00Z', billable: false }),
      row({ organization_document_id: OH.documentId, units: 4, period: '2026-10', sent_at: '2026-10-25T00:00:00Z' }),
      row({ organization_document_id: OH.documentId, units: 8, period: '2026-09', sent_at: '2026-09-25T00:00:00Z' }),
    ];
    for (const r of rows) await usage().record(r);

    rep = await report().getOrgReport(o, { now: NOW });
  });

  it('AC8: current.units is the sum of billable rows only', () => {
    // 3 + 1 + 2 + 1 + 1 (gone garden); system non-billable, simulated and blocked excluded.
    expect(rep.current.units).toBe(8);
    expect(rep.current.messages).toBe(5);
    expect(rep.period).toBe('2031-03');
  });

  it('AC9: byCategory has exactly the three keys; empty categories default to 0', async () => {
    expect(Object.keys(rep.current.byCategory).sort()).toEqual(['broadcast', 'reminder', 'transactional']);
    expect(rep.current.byCategory.broadcast).toEqual({ units: 4, messages: 2 });
    expect(rep.current.byCategory.reminder).toEqual({ units: 3, messages: 2 });
    expect(rep.current.byCategory.transactional).toEqual({ units: 1, messages: 1 });

    const r = await report().getOrgReport(OR.documentId, { now: NOW });
    expect(r.current.byCategory.broadcast).toEqual({ units: 0, messages: 0 });
    expect(r.current.byCategory.transactional).toEqual({ units: 0, messages: 0 });
    expect(r.current.byCategory.reminder).toEqual({ units: 4, messages: 1 });
  });

  it('AC10: nonBillable counts the non-billable row', () => {
    expect(rep.current.nonBillable).toEqual({ units: 1, messages: 1 });
  });

  it('AC11: byGarden includes empty gardens, one null entry, unknown gardens with null title', () => {
    const bg = rep.current.byGarden;
    const g2 = bg.find((e) => e.gardenDocumentId === G2.documentId);
    expect(g2).toMatchObject({ units: 0, messages: 0, title: G2.title });
    expect(bg.filter((e) => e.gardenDocumentId === null)).toHaveLength(1);
    expect(bg.find((e) => e.gardenDocumentId === goneId)).toMatchObject({ title: null, units: 1 });
    expect(bg.find((e) => e.gardenDocumentId === G1.documentId)).toMatchObject({ title: G1.title, units: 6 });
    expect(bg.reduce((s, e) => s + e.units, 0)).toBe(rep.current.units);
    const units = bg.map((e) => e.units);
    expect(units).toEqual([...units].sort((a, b) => b - a));
  });

  it('AC12: other orgs and older periods are excluded from current', async () => {
    // Would be 108 / 58 more if leaked.
    expect(rep.current.units).toBe(8);
    const old = await report().getOrgReport(O.documentId, { now: new Date('2031-01-20T00:00:00Z') });
    expect(old.current.units).toBe(50);
  });

  it('AC13: resetsAt, freeUnits, enforced, meteringStartedAt', () => {
    expect(rep.resetsAt).toBe('2031-04-01T00:00:00.000Z');
    expect(rep.freeUnits).toBe(500);
    expect(rep.enforced).toBe(false);
    expect(rep.meteringStartedAt).toBe('2026-10-21');
    expect(rep.organization).toEqual({ documentId: O.documentId, title: O.title });
  });

  it('AC14: history is floored at the metering start and flags the partial month', async () => {
    const r = await report().getOrgReport(OH.documentId, { months: 12, now: NOW_HIST });
    expect(r.history.map((h) => h.period)).toEqual(['2027-03', '2027-02', '2027-01', '2026-12', '2026-11', '2026-10']);
    expect(r.history.filter((h) => h.partial).map((h) => h.period)).toEqual(['2026-10']);
    expect(r.history.find((h) => h.period === '2027-01')).toMatchObject({ units: 5, messages: 2 });
    expect(r.history.find((h) => h.period === '2026-10')).toMatchObject({ units: 4, messages: 1 });
    expect(r.history.find((h) => h.period === '2027-03')).toMatchObject({ units: 0, messages: 0 });

    const r3 = await report().getOrgReport(OH.documentId, { months: 3, now: NOW_HIST });
    expect(r3.history).toHaveLength(3);
  });

  it('AC15: parseMonths clamps and defaults', () => {
    const { parseMonths } = report();
    expect(parseMonths(0)).toBe(1);
    expect(parseMonths('99')).toBe(12);
    expect(parseMonths('abc')).toBe(6);
    expect(parseMonths('2.5')).toBe(6);
    expect(parseMonths(undefined)).toBe(6);
    expect(parseMonths(null)).toBe(6);
  });

  it('returns null for an unknown organization', async () => {
    expect(await report().getOrgReport('nope-' + uniq('o'))).toBeNull();
  });

  it('listForUser: an administrator sees O exactly once with matching units', async () => {
    const list = await report().listForUser({ id: -1, role: { type: 'administrator' } }, { now: NOW });
    const hits = list.filter((e) => e.documentId === O.documentId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ period: '2031-03', units: rep.current.units, freeUnits: 500, title: O.title });
  });

  it('listForUser: no user or a user with no gardens gets an empty list', async () => {
    expect(await report().listForUser(null)).toEqual([]);
    expect(await report().listForUser({ id: -2, role: { type: 'authenticated' } })).toEqual([]);
  });
});
