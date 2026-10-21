'use strict';

/**
 * api::billing.usage: ledger writes (record), per-org usage (getUsage), platform totals (getTotals),
 * the canSend stub, and the bootstrap indexes. Covers AC9, AC30, AC31 and the AC20 stub bullet.
 *
 * Seeded rows use far-future periods ('2031-01', '2031-03') so platform-wide totals stay isolated
 * from whatever other billing tests write.
 */

const { uniq, makeUser, ledgerFind } = require('./helpers');

const usage = () => strapi.service('api::billing.usage');

const baseRow = (overrides = {}) => ({
  organization_document_id: null,
  garden_document_id: null,
  to_number: '+14155550100',
  source: 'usage-test',
  segments: 1,
  units: 1,
  direction: 'api',
  category: 'broadcast',
  num_media: 0,
  sent_at: '2031-01-15T12:00:00Z',
  ...overrides,
});

describe('billing: usage', () => {
  describe('record', () => {
    it('fills defaults: period from sent_at (UTC), billable true, blocked/simulated false, num_media 0', async () => {
      const source = uniq('usage-defaults');
      const saved = await usage().record({
        source, segments: 2, units: 2, direction: 'api', category: 'reminder', sent_at: '2031-05-31T23:30:00Z',
      });
      expect(saved).toBeTruthy();

      const [row] = await ledgerFind({ source });
      expect(row).toMatchObject({
        period: '2031-05',
        billable: true,
        blocked: false,
        simulated: false,
        num_media: 0,
        organization_document_id: null,
        twilio_sid: null,
        user: null,
      });
    });

    it('stores a real user on the row', async () => {
      const source = uniq('usage-user');
      const u = await makeUser();
      const saved = await usage().record(baseRow({ source, user: u.id }));
      expect(saved).toBeTruthy();

      const [row] = await ledgerFind({ source });
      expect(row.user).toBeTruthy();
      expect(row.user.id).toBe(u.id);
    });

    it('retries without the user when the user id is stale, and still returns the row', async () => {
      const source = uniq('usage-stale-user');
      const saved = await usage().record(baseRow({ source, user: 999999 }));
      expect(saved).toBeTruthy();

      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0].user).toBeNull();
    });
  });

  describe('AC30: getUsage', () => {
    const COMBOS = [];
    for (const billable of [true, false]) {
      for (const blocked of [false, true]) {
        for (const simulated of [false, true]) COMBOS.push({ billable, blocked, simulated });
      }
    }

    let X;
    let Y;
    let W;
    let expectedFor;

    beforeAll(async () => {
      X = uniq('org-usage-x');
      Y = uniq('org-usage-y');
      W = uniq('org-usage-w');

      // Eight rows for X in 2031-01, one per (billable, blocked, simulated), units 1, 2, 4, ... 128.
      expectedFor = {};
      for (let i = 0; i < COMBOS.length; i += 1) {
        const units = 2 ** i;
        const combo = COMBOS[i];
        expectedFor[`${combo.billable}/${combo.blocked}/${combo.simulated}`] = { units, segments: units * 10 };
        await usage().record(baseRow({
          organization_document_id: X, period: '2031-01', units, segments: units * 10, ...combo,
        }));
      }
      // Another org, same period; same org, another period.
      await usage().record(baseRow({ organization_document_id: Y, period: '2031-01', units: 1000, segments: 1000 }));
      await usage().record(baseRow({
        organization_document_id: X, period: '2031-02', sent_at: '2031-02-15T12:00:00Z', units: 2000, segments: 2000,
      }));

      // Boundary rows for the {from, to} window, under a third org.
      for (const [day, units] of [['05', 1], ['10', 2], ['20', 4]]) {
        await usage().record(baseRow({
          organization_document_id: W, period: '2031-01', sent_at: `2031-01-${day}T00:00:00Z`, units, segments: units,
        }));
      }
    });

    it('sums only billable, unblocked, non-simulated rows for the org and period', async () => {
      const want = expectedFor['true/false/false'];
      const got = await usage().getUsage(X, { period: '2031-01' });
      expect(got).toEqual({ units: want.units, segments: want.segments, blockedCount: 4 });
    });

    it('adds the simulated billable row with includeSimulated', async () => {
      const a = expectedFor['true/false/false'];
      const b = expectedFor['true/false/true'];
      const got = await usage().getUsage(X, { period: '2031-01' }, { includeSimulated: true });
      expect(got).toEqual({ units: a.units + b.units, segments: a.segments + b.segments, blockedCount: 4 });
    });

    it('returns zeros for an org with no rows', async () => {
      await expect(usage().getUsage(uniq('org-usage-none'), { period: '2031-01' }))
        .resolves.toEqual({ units: 0, segments: 0, blockedCount: 0 });
    });

    it('filters on sent_at for {from, to}: from inclusive, to exclusive', async () => {
      const got = await usage().getUsage(W, { from: '2031-01-10T00:00:00Z', to: '2031-01-20T00:00:00Z' });
      expect(got).toEqual({ units: 2, segments: 2, blockedCount: 0 });

      const wider = await usage().getUsage(W, { from: '2031-01-10T00:00:00Z', to: '2031-01-20T00:00:01Z' });
      expect(wider.units).toBe(6);
    });

    it('applies the {from, to} window to blockedCount too', async () => {
      const want = expectedFor['true/false/false'];
      const inside = await usage().getUsage(X, { from: '2031-01-10T00:00:00Z', to: '2031-01-20T00:00:00Z' });
      expect(inside).toEqual({ units: want.units, segments: want.segments, blockedCount: 4 });

      const outside = await usage().getUsage(X, { from: '2031-01-16T00:00:00Z', to: '2031-01-20T00:00:00Z' });
      expect(outside).toEqual({ units: 0, segments: 0, blockedCount: 0 });
    });

    it('requires a window', async () => {
      await expect(usage().getUsage(X, {})).rejects.toThrow('getUsage: pass {period} or {from, to}');
    });

    it('returns JS numbers', async () => {
      const got = await usage().getUsage(X, { period: '2031-01' }, { includeSimulated: true });
      expect(typeof got.units).toBe('number');
      expect(typeof got.segments).toBe('number');
      expect(typeof got.blockedCount).toBe('number');

      const empty = await usage().getUsage(uniq('org-usage-none'), { period: '2031-01' });
      expect(typeof empty.units).toBe('number');
      expect(typeof empty.segments).toBe('number');
      expect(typeof empty.blockedCount).toBe('number');
    });
  });

  describe('AC31: getTotals', () => {
    const A = uniq('org-totals-a');
    const B = uniq('org-totals-b');

    beforeAll(async () => {
      const row = (overrides) => baseRow({ period: '2031-03', sent_at: '2031-03-10T00:00:00Z', ...overrides });
      const rows = [
        // Counted.
        row({ organization_document_id: A, category: 'broadcast', segments: 2, units: 2 }),
        row({ organization_document_id: A, category: 'broadcast', segments: 3, units: 3 }),
        row({ organization_document_id: B, category: 'reminder', segments: 1, units: 1 }),
        row({ category: 'transactional', direction: 'twiml_reply', segments: 1, units: 1 }),
        row({ category: 'system', segments: 4, units: 4, billable: false }),
        row({ organization_document_id: A, category: 'broadcast', segments: 1, units: 3, num_media: 1 }),
        row({ category: 'transactional', direction: 'twiml_reply', segments: 1, units: 3, num_media: 2 }),
        // Excluded: simulated and blocked, SMS and MMS.
        row({ organization_document_id: A, segments: 50, units: 50, simulated: true }),
        row({ organization_document_id: A, segments: 51, units: 51, simulated: true, num_media: 1 }),
        row({ organization_document_id: A, segments: 60, units: 60, blocked: true, billable: false }),
        row({ organization_document_id: A, segments: 61, units: 61, blocked: true, billable: false, num_media: 1 }),
        // Excluded: another period.
        row({ organization_document_id: A, period: '2031-04', sent_at: '2031-04-10T00:00:00Z', segments: 70, units: 70 }),
      ];
      for (const r of rows) await usage().record(r);
    });

    it('reports exact platform totals, excluding simulated and blocked rows', async () => {
      await expect(usage().getTotals({ period: '2031-03' })).resolves.toEqual({
        period: '2031-03',
        smsSegments: 11,
        mmsCount: 2,
        byCategory: {
          broadcast: { rows: 3, segments: 6, units: 8 },
          reminder: { rows: 1, segments: 1, units: 1 },
          transactional: { rows: 2, segments: 2, units: 4 },
          system: { rows: 1, segments: 4, units: 4 },
        },
        byDirection: {
          api: { rows: 5, segments: 11, units: 13 },
          twiml_reply: { rows: 2, segments: 2, units: 4 },
        },
        attributed: { rows: 4, segments: 7, units: 9 },
        unattributed: { rows: 3, segments: 6, units: 8 },
      });
    });

    it('reports zeros and empty breakdowns for a period with no rows', async () => {
      await expect(usage().getTotals({ period: '2031-12' })).resolves.toEqual({
        period: '2031-12',
        smsSegments: 0,
        mmsCount: 0,
        byCategory: {},
        byDirection: {},
        attributed: { rows: 0, segments: 0, units: 0 },
        unattributed: { rows: 0, segments: 0, units: 0 },
      });
    });
  });

  describe('AC9: bootstrap indexes (sqlite)', () => {
    const indexColumns = async (name) => {
      const info = await strapi.db.connection.raw(`PRAGMA index_info('${name}')`);
      return [...info].sort((a, b) => a.seqno - b.seqno).map((r) => r.name);
    };

    it('creates both indexes with the right columns in order', async () => {
      const list = await strapi.db.connection.raw("PRAGMA index_list('sms_usages')");
      const names = [...list].map((r) => r.name);
      expect(names).toEqual(expect.arrayContaining(['sms_usages_org_period_idx', 'sms_usages_report_idx']));

      await expect(indexColumns('sms_usages_org_period_idx')).resolves.toEqual(['organization_document_id', 'period']);
      await expect(indexColumns('sms_usages_report_idx')).resolves.toEqual(['stripe_reported_at', 'billable']);
    });

    it('can run a second time without throwing', async () => {
      await expect(usage().ensureIndexes()).resolves.not.toThrow();
    });
  });

  describe('AC20: canSend stub', () => {
    it.each(['broadcast', 'reminder', 'transactional', 'system'])('always allows %s', async (category) => {
      await expect(usage().canSend('x', category, 5)).resolves.toEqual({
        allowed: true, remaining: null, reason: null,
      });
    });
  });
});
