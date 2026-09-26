'use strict';

const crypto = require('crypto');
const { normalizePhoneNumber } = require('../../../utils/phone');

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_THROTTLE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURLY_CAP = 5;
const DAILY_CAP = 10;
const MAX_ATTEMPTS = 5;

const smsBody = (code) =>
  `Your Garden Steward login code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this text.`;
const hashCode = (userId, code) =>
  crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const codeMatches = (storedHex, userId, code) => {
  if (typeof storedHex !== 'string' || !/^[0-9a-f]{64}$/.test(storedHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(storedHex, 'hex'), Buffer.from(hashCode(userId, code), 'hex'));
};
// Returns an array of valid Date objects; tolerates null, non-arrays, JSON strings and junk entries.
const parseSendLog = (raw) => {
  let arr = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => new Date(t)).filter((d) => !Number.isNaN(d.getTime()));
};
// Raw table/column names for the statements that need SQL expressions (atomic counters).
const userColumns = (strapi) => {
  const meta = strapi.db.metadata.get(USER_UID);
  const col = (attr) => meta.attributes[attr].columnName;
  return {
    table: meta.tableName,
    HASH: col('sms_login_code_hash'),
    EXPIRES: col('sms_login_code_expires'),
    ATTEMPTS: col('sms_login_attempts'),
  };
};

module.exports = ({ strapi }) => ({
  async resolveUser(rawPhone) {
    if (
      rawPhone === null ||
      rawPhone === undefined ||
      (typeof rawPhone !== 'string' && typeof rawPhone !== 'number') ||
      (typeof rawPhone === 'string' && rawPhone.trim() === '')
    ) {
      return { invalid: true, message: 'Phone number is required' };
    }
    const n = normalizePhoneNumber(rawPhone);
    if (!n.valid) {
      return { invalid: true, message: n.message };
    }
    const rows = await strapi.db.query(USER_UID).findMany({
      where: { phoneNumber: n.phoneNumber },
      orderBy: { id: 'asc' },
      populate: ['role'],
    });
    if (rows.length > 1) {
      strapi.log.warn(`sms-login: ${rows.length} users share a phone number; using id ${rows[0].id} (ids: ${rows.map((r) => r.id).join(',')})`);
    }
    return { invalid: false, phoneNumber: n.phoneNumber, user: rows[0] || null };
  },

  async isEligible(user) {
    const advanced = await strapi.store({ type: 'plugin', name: 'users-permissions' }).get({ key: 'advanced' });
    return !!user && !user.blocked && (!(advanced && advanced.email_confirmation) || user.confirmed === true);
  },

  async authenticatedRoleId() {
    const role = await strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } });
    return role ? role.id : null;
  },

  async requestCode(rawPhone) {
    const r = await this.resolveUser(rawPhone);
    if (r.invalid) return r;

    if (!r.user) {
      strapi.log.debug('sms-login: requestCode outcome=unknown');
      return { invalid: false, outcome: 'unknown' };
    }

    if (!(await this.isEligible(r.user))) {
      strapi.log.debug(`sms-login: requestCode outcome=ineligible user=${r.user.id}`);
      return { invalid: false, outcome: 'ineligible' };
    }

    const now = Date.now();
    if (r.user.sms_login_last_sent && now - new Date(r.user.sms_login_last_sent).getTime() < RESEND_THROTTLE_MS) {
      strapi.log.debug(`sms-login: requestCode outcome=throttled user=${r.user.id}`);
      return { invalid: false, outcome: 'throttled' };
    }

    const log = parseSendLog(r.user.sms_login_send_log);
    const hourCount = log.filter((d) => d.getTime() > now - HOUR_MS).length;
    const dayCount = log.filter((d) => d.getTime() > now - DAY_MS).length;
    if (hourCount >= HOURLY_CAP || dayCount >= DAILY_CAP) {
      strapi.log.info(`sms-login: send cap reached for user ${r.user.id}`);
      return { invalid: false, outcome: 'capped' };
    }

    const code = generateCode();
    const nowIso = new Date(now).toISOString();

    // Only one concurrent request can move sms_login_last_sent out of the throttle
    // window. A loser's stale send-log read is therefore never written, and that
    // is what makes the hourly and daily caps hold under a concurrent burst too.
    const { count } = await strapi.db.query(USER_UID).updateMany({
      where: {
        id: r.user.id,
        $or: [
          { sms_login_last_sent: { $null: true } },
          { sms_login_last_sent: { $lte: new Date(now - RESEND_THROTTLE_MS).toISOString() } },
        ],
      },
      data: {
        sms_login_code_hash: hashCode(r.user.id, code),
        sms_login_code_expires: new Date(now + CODE_TTL_MS).toISOString(),
        sms_login_attempts: 0,
        sms_login_last_sent: nowIso,
        sms_login_send_log: [
          ...log.filter((d) => d.getTime() > now - DAY_MS).sort((a, b) => a - b).map((d) => d.toISOString()),
          nowIso,
        ],
      },
    });

    if (count !== 1) {
      strapi.log.debug(`sms-login: requestCode outcome=throttled (concurrent send) user=${r.user.id}`);
      return { invalid: false, outcome: 'throttled' };
    }

    try {
      const smsService = strapi.service('api::sms.sms');
      const p = smsService.sendSms(r.phoneNumber, smsBody(code));
      if (p && typeof p.then === 'function') {
        p.catch((e) => strapi.log.error(`sms-login: sendSms failed for user ${r.user.id}: ${e && e.name}`));
      }
    } catch (err) {
      strapi.log.error(`sms-login: sendSms failed for user ${r.user.id}: ${err && err.name}`);
    }

    return { invalid: false, outcome: 'sent' };
  },

  async verifyCode(rawPhone, code) {
    const codeStr = String(code ?? '').trim();
    if (!/^\d{6}$/.test(codeStr)) {
      return { ok: false, reason: 'malformed' };
    }

    const r = await this.resolveUser(rawPhone);
    if (r.invalid) {
      return { ok: false, reason: 'invalid_phone' };
    }
    if (!r.user) {
      strapi.log.debug('sms-login: verifyCode reason=unknown');
      return { ok: false, reason: 'unknown' };
    }

    if (!(await this.isEligible(r.user))) {
      strapi.log.debug(`sms-login: verifyCode reason=ineligible user=${r.user.id}`);
      return { ok: false, reason: 'ineligible' };
    }

    if (!r.user.sms_login_code_hash) {
      strapi.log.debug(`sms-login: verifyCode reason=no_code user=${r.user.id}`);
      return { ok: false, reason: 'no_code' };
    }

    if (!r.user.sms_login_code_expires || new Date(r.user.sms_login_code_expires).getTime() <= Date.now()) {
      // Scoped to the hash we read, so this never clears a code a concurrent resend just issued.
      await strapi.db.query(USER_UID).updateMany({
        where: { id: r.user.id, sms_login_code_hash: r.user.sms_login_code_hash },
        data: { sms_login_code_hash: null, sms_login_code_expires: null },
      });
      strapi.log.debug(`sms-login: verifyCode reason=expired user=${r.user.id}`);
      return { ok: false, reason: 'expired' };
    }

    const knex = strapi.db.connection;
    const { table, HASH, EXPIRES, ATTEMPTS } = userColumns(strapi);
    const storedHash = r.user.sms_login_code_hash;

    if (!codeMatches(storedHash, r.user.id, codeStr)) {
      // One atomic statement: increment attempts, and clear the code when this failure is the 5th.
      // Scoped to the code we compared against, so a guess at a replaced code never counts against the new one.
      const bumped = await knex(table)
        .where({ id: r.user.id, [HASH]: storedHash })
        .update({
          [ATTEMPTS]: knex.raw('COALESCE(??, 0) + 1', [ATTEMPTS]),
          [HASH]: knex.raw('CASE WHEN COALESCE(??, 0) + 1 >= ? THEN NULL ELSE ?? END', [ATTEMPTS, MAX_ATTEMPTS, HASH]),
          [EXPIRES]: knex.raw('CASE WHEN COALESCE(??, 0) + 1 >= ? THEN NULL ELSE ?? END', [ATTEMPTS, MAX_ATTEMPTS, EXPIRES]),
        });
      strapi.log.debug(`sms-login: verifyCode reason=mismatch counted=${bumped === 1} user=${r.user.id}`);
      return { ok: false, reason: 'mismatch' };
    }

    let roleId = null;
    if (!r.user.role) {
      roleId = await this.authenticatedRoleId();
      if (roleId === null) {
        strapi.log.error('sms-login: authenticated role not found; refusing to log in role-less user ' + r.user.id);
        return { ok: false, reason: 'no_auth_role' };
      }
    }

    // Claim the code atomically: succeeds only if it is still the code we matched and fewer than 5 failures are recorded.
    const claimed = await knex(table)
      .where({ id: r.user.id, [HASH]: storedHash })
      .andWhere((qb) => qb.whereNull(ATTEMPTS).orWhere(ATTEMPTS, '<', MAX_ATTEMPTS))
      .update({ [HASH]: null, [EXPIRES]: null, [ATTEMPTS]: 0 });
    if (claimed !== 1) {
      strapi.log.debug(`sms-login: verifyCode reason=claim_lost user=${r.user.id}`);
      return { ok: false, reason: 'claim_lost' };
    }

    if (roleId !== null) {
      await strapi.db.query(USER_UID).update({ where: { id: r.user.id }, data: { role: roleId } });
    }

    const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: r.user.id });
    const user = await strapi.db.query(USER_UID).findOne({ where: { id: r.user.id }, populate: ['role'] });

    return { ok: true, user, jwt };
  },
});
