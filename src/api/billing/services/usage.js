'use strict';

/**
 * SMS ledger access: writes one row per message (record), reads per-org usage (getUsage),
 * platform totals for Twilio reconciliation (getTotals), and the Phase 2 send gate (canSend).
 */

const UID = 'api::sms-usage.sms-usage';

// Postgres returns SUM/COUNT as strings, and SUM over no rows as null.
const num = (x) => Number(x) || 0;

module.exports = ({ strapi }) => {
  // Raw table/column names for the knex aggregates (same pattern as auth/services/sms-login.js).
  const cols = () => {
    const meta = strapi.db.metadata.get(UID);
    const c = (a) => meta.attributes[a].columnName;
    return { table: meta.tableName, c };
  };

  // strapi.log is gone once the app is torn down; a lost ledger row should still be visible.
  const logError = (m) => { try { strapi.log.error(m); } catch (e) { console.error(m); } };

  return {
    /** Writes one ledger row. Never throws; resolves the created row, or null when it could not be written. */
    async record(row) {
      const sentAt = row.sent_at ? new Date(row.sent_at) : new Date();
      const data = {
        organization_document_id: row.organization_document_id ?? null,
        garden_document_id: row.garden_document_id ?? null,
        to_number: row.to_number ?? null,
        twilio_sid: row.twilio_sid ?? null,
        source: row.source ?? null,
        encoding: row.encoding ?? null,
        period: row.period ?? sentAt.toISOString().slice(0, 7),
        segments: row.segments,
        units: row.units,
        direction: row.direction,
        category: row.category,
        num_media: row.num_media ?? 0,
        sent_at: sentAt.toISOString(),
        billable: row.billable ?? true,
        blocked: row.blocked ?? false,
        simulated: row.simulated ?? false,
      };
      if (row.user != null) data.user = row.user;

      try {
        return await strapi.documents(UID).create({ data });
      } catch (err) {
        // A stale or nonexistent user id must not lose the row.
        if (data.user != null) {
          try {
            const { user, ...withoutUser } = data;
            return await strapi.documents(UID).create({ data: withoutUser });
          } catch (retryErr) {
            err = retryErr;
          }
        }
        logError('[billing.usage] record failed: ' + err.message);
        return null;
      }
    },

    /**
     * Billable usage for one org over a period or a [from, to) window.
     * `blockedCount` covers the same window but ignores the simulated filter.
     */
    async getUsage(organizationDocumentId, window = {}, { includeSimulated = false } = {}) {
      const { table, c } = cols();
      const knex = strapi.db.connection;

      let base = knex(table);
      base = organizationDocumentId == null
        ? base.whereNull(c('organization_document_id'))
        : base.where(c('organization_document_id'), organizationDocumentId);

      if (window.period) {
        base = base.where(c('period'), window.period);
      } else if (window.from && window.to) {
        base = base
          .where(c('sent_at'), '>=', new Date(window.from))
          .where(c('sent_at'), '<', new Date(window.to));
      } else {
        throw new Error('getUsage: pass {period} or {from, to}');
      }

      let billed = base.clone().where(c('billable'), true).where(c('blocked'), false);
      if (!includeSimulated) billed = billed.where(c('simulated'), false);
      const sums = await billed
        .sum({ units: c('units') })
        .sum({ segments: c('segments') })
        .first();

      const blocked = await base.clone().where(c('blocked'), true).count({ n: '*' }).first();

      return {
        units: num(sums && sums.units),
        segments: num(sums && sums.segments),
        blockedCount: num(blocked && blocked.n),
      };
    },

    /**
     * Platform-wide totals for one period, over rows that actually reached Twilio
     * (not simulated, not blocked), billable or not, since Twilio bills both.
     */
    async getTotals({ period }) {
      const { table, c } = cols();
      const knex = strapi.db.connection;

      const base = knex(table)
        .where(c('period'), period)
        .where(c('simulated'), false)
        .where(c('blocked'), false);

      const group = async (column) => {
        const rows = await base.clone()
          .select(c(column))
          .count({ rows: '*' })
          .sum({ segments: c('segments') })
          .sum({ units: c('units') })
          .groupBy(c(column));
        const out = {};
        for (const r of rows) {
          out[r[c(column)]] = { rows: num(r.rows), segments: num(r.segments), units: num(r.units) };
        }
        return out;
      };

      const bucket = async (q) => {
        const r = await q.count({ rows: '*' }).sum({ segments: c('segments') }).sum({ units: c('units') }).first();
        return { rows: num(r && r.rows), segments: num(r && r.segments), units: num(r && r.units) };
      };

      const sms = await base.clone().where(c('num_media'), 0).sum({ segments: c('segments') }).first();
      const mms = await base.clone().where(c('num_media'), '>', 0).count({ n: '*' }).first();

      return {
        period,
        smsSegments: num(sms && sms.segments),
        mmsCount: num(mms && mms.n),
        byCategory: await group('category'),
        byDirection: await group('direction'),
        attributed: await bucket(base.clone().whereNotNull(c('organization_document_id'))),
        unattributed: await bucket(base.clone().whereNull(c('organization_document_id'))),
      };
    },

    // Phase 1 stub and the Phase 2 seam: always allows. Phase 2 will decide here whether an org
    // may spend `units` more in `category` (e.g. pause broadcasts for free orgs over their cap).
    async canSend(organizationDocumentId, category, units) {
      return { allowed: true, remaining: null, reason: null };
    },

    /** Idempotent (CREATE INDEX IF NOT EXISTS); called from bootstrap. */
    async ensureIndexes() {
      const { table, c } = cols();
      const knex = strapi.db.connection;
      await knex.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (??, ??)', [
        'sms_usages_org_period_idx', table, c('organization_document_id'), c('period'),
      ]);
      await knex.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (??, ??)', [
        'sms_usages_report_idx', table, c('stripe_reported_at'), c('billable'),
      ]);
    },
  };
};
