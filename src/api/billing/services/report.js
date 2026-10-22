'use strict';

/**
 * Read-side reporting for the organization usage page: which orgs a user can see,
 * a per-org list for the current month, and the full per-org report.
 */

const UID = 'api::sms-usage.sms-usage';
const ORG = 'api::organization.organization';
const GARDEN = 'api::garden.garden';
const CATEGORIES = ['broadcast', 'reminder', 'transactional'];

// Postgres returns SUM/COUNT as strings, and SUM over no rows as null.
const num = (x) => Number(x) || 0;

const parseMonths = (raw) => {
  if (raw === undefined || raw === null || !/^-?\d+$/.test(String(raw))) return 6;
  return Math.min(12, Math.max(1, parseInt(raw, 10)));
};

const periodOf = (date) => date.toISOString().slice(0, 7);

// Case-insensitive title compare, nulls last.
const cmpTitle = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
};

// Collapses draft + published rows to one entry per documentId, published title first.
const dedupe = (rows) => {
  const byId = new Map();
  for (const r of rows) {
    const cur = byId.get(r.documentId);
    if (!cur || (r.publishedAt && !cur.publishedAt)) byId.set(r.documentId, r);
  }
  return [...byId.values()];
};

module.exports = ({ strapi }) => {
  const cols = () => {
    const meta = strapi.db.metadata.get(UID);
    const c = (a) => meta.attributes[a].columnName;
    return { table: meta.tableName, c };
  };

  const service = {
    parseMonths,
    periodOf,

    /** 'all' for administrators, otherwise the organization documentIds of gardens the user manages. */
    async visibleOrgDocumentIds(user) {
      if (!user) return [];
      if (user.role?.type === 'administrator') return 'all';
      const gardens = await strapi.db.query(GARDEN).findMany({
        where: { managers: { id: user.id } },
        select: ['id'],
        populate: { organization: { select: ['documentId'] } },
      });
      return [...new Set(gardens.map((g) => g.organization?.documentId).filter(Boolean))];
    },

    async listForUser(user, { now = new Date() } = {}) {
      const visible = await service.visibleOrgDocumentIds(user);
      if (Array.isArray(visible) && visible.length === 0) return [];

      const rows = await strapi.db.query(ORG).findMany({
        select: ['documentId', 'title', 'publishedAt'],
        ...(visible !== 'all' && { where: { documentId: { $in: visible } } }),
      });
      const orgs = dedupe(rows);
      const ids = orgs.map((o) => o.documentId);
      if (ids.length === 0) return [];

      const { table, c } = cols();
      const knex = strapi.db.connection;
      let q = knex(table)
        .where(c('period'), periodOf(now))
        .where(c('billable'), true)
        .where(c('blocked'), false)
        .where(c('simulated'), false);
      if (visible !== 'all') q = q.whereIn(c('organization_document_id'), ids);
      const sums = await q
        .select(c('organization_document_id'))
        .sum({ units: c('units') })
        .groupBy(c('organization_document_id'));
      const unitsById = new Map(sums.map((r) => [r[c('organization_document_id')], num(r.units)]));

      const period = periodOf(now);
      const freeUnits = strapi.config.get('billing.FREE_UNITS', 500);
      return orgs
        .map((o) => ({
          documentId: o.documentId,
          title: o.title ?? null,
          period,
          units: unitsById.get(o.documentId) || 0,
          freeUnits,
        }))
        .sort((a, b) => cmpTitle(a.title, b.title) || a.documentId.localeCompare(b.documentId));
    },

    async getOrgReport(orgDocumentId, { months = 6, now = new Date() } = {}) {
      const orgRows = await strapi.db.query(ORG).findMany({
        where: { documentId: orgDocumentId },
        select: ['documentId', 'title', 'publishedAt'],
      });
      if (!orgRows.length) return null;
      const org = dedupe(orgRows)[0];

      const period = periodOf(now);
      const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
      const meteringStartedAt = strapi.config.get('billing.METERING_STARTED_AT');
      const startPeriod = meteringStartedAt.slice(0, 7);

      const { table, c } = cols();
      const knex = strapi.db.connection;
      const orgCol = c('organization_document_id');
      const base = (billable) => knex(table)
        .where(orgCol, orgDocumentId)
        .where(c('billable'), billable)
        .where(c('blocked'), false)
        .where(c('simulated'), false);
      const agg = (q) => q.sum({ units: c('units') }).count({ messages: '*' });

      // a. current period by category
      const catRows = await agg(base(true).where(c('period'), period).select(c('category')))
        .groupBy(c('category'));
      const byCategory = {};
      for (const k of CATEGORIES) byCategory[k] = { units: 0, messages: 0 };
      let totalUnits = 0;
      let totalMessages = 0;
      for (const r of catRows) {
        totalUnits += num(r.units);
        totalMessages += num(r.messages);
        const k = r[c('category')];
        if (CATEGORIES.includes(k)) byCategory[k] = { units: num(r.units), messages: num(r.messages) };
      }

      // b. current period by garden
      const gardenRows = await agg(base(true).where(c('period'), period).select(c('garden_document_id')))
        .groupBy(c('garden_document_id'));

      // c. non-billable
      const nb = await agg(base(false).where(c('period'), period)).first();
      const nonBillable = { units: num(nb && nb.units), messages: num(nb && nb.messages) };

      // d. history
      const periods = [];
      for (let i = 0; i < months; i += 1) {
        const p = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
        if (p < startPeriod) break;
        periods.push(p);
      }
      const histRows = periods.length
        ? await agg(base(true).whereIn(c('period'), periods).select(c('period'))).groupBy(c('period'))
        : [];
      const histByPeriod = new Map(histRows.map((r) => [r[c('period')], r]));
      const history = periods.map((p) => {
        const r = histByPeriod.get(p);
        return { period: p, units: num(r && r.units), messages: num(r && r.messages), partial: p === startPeriod };
      });

      // byGarden
      const gardens = dedupe(await strapi.db.query(GARDEN).findMany({
        where: { organization: { documentId: orgDocumentId } },
        select: ['documentId', 'title', 'publishedAt'],
      }));
      const statsById = new Map();
      let nullStats = null;
      for (const r of gardenRows) {
        const id = r[c('garden_document_id')];
        const s = { units: num(r.units), messages: num(r.messages) };
        if (id == null) nullStats = s; else statsById.set(id, s);
      }
      const known = new Set(gardens.map((g) => g.documentId));
      const strays = [...statsById.keys()].filter((id) => !known.has(id));
      const strayTitles = new Map();
      if (strays.length) {
        const found = dedupe(await strapi.db.query(GARDEN).findMany({
          where: { documentId: { $in: strays } },
          select: ['documentId', 'title', 'publishedAt'],
        }));
        for (const g of found) strayTitles.set(g.documentId, g.title ?? null);
      }
      const byGarden = [
        ...gardens.map((g) => ({
          gardenDocumentId: g.documentId,
          title: g.title ?? null,
          units: statsById.get(g.documentId)?.units || 0,
          messages: statsById.get(g.documentId)?.messages || 0,
        })),
        ...strays.map((id) => ({
          gardenDocumentId: id,
          title: strayTitles.get(id) ?? null,
          units: statsById.get(id).units,
          messages: statsById.get(id).messages,
        })),
        ...(nullStats ? [{ gardenDocumentId: null, title: null, units: nullStats.units, messages: nullStats.messages }] : []),
      ].sort((a, b) => b.units - a.units || cmpTitle(a.title, b.title));

      return {
        organization: { documentId: org.documentId, title: org.title ?? null },
        period,
        resetsAt,
        freeUnits: strapi.config.get('billing.FREE_UNITS', 500),
        enforced: false,
        meteringStartedAt,
        current: { units: totalUnits, messages: totalMessages, byCategory, nonBillable, byGarden },
        history,
      };
    },
  };

  return service;
};
