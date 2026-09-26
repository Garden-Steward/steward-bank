'use strict';
const request = require('supertest');
const { patchService } = require('../helpers/patch');
const { grantPrivileges } = require('../helpers/strapi');

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
let seq = 0;
const nextPhoneDigits = () => { seq += 1; return `720555${String(1000 + seq).padStart(4, '0')}`; }; // e.g. '7205551001'
const e164 = (digits) => `+1${digits}`;
const svc = () => strapi.service('api::auth.sms-login');

async function makeUser({ role = 'authenticated', blocked = false, confirmed = true, extra = {} } = {}) {
  const digits = nextPhoneDigits();
  let roleId = null;
  if (role === 'authenticated') roleId = (await strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } })).id;
  else if (typeof role === 'number') roleId = role;
  const user = await strapi.db.query(USER_UID).create({ data: {
    username: `smslogin_${Date.now()}_${seq}`, email: `smslogin_${Date.now()}_${seq}@example.com`,
    provider: 'local', confirmed, blocked, phoneNumber: e164(digits), role: roleId, ...extra,
  }});
  return { user, digits };
}
const readUser = (id) => strapi.db.query(USER_UID).findOne({ where: { id }, populate: ['role'] });
const setCols = (id, data) => strapi.db.query(USER_UID).update({ where: { id }, data });
const codeFrom = (sendSms, callIndex = 0) => sendSms.mock.calls[callIndex][1].match(/\b(\d{6})\b/)[1];
const wrongCode = (code) => String((Number(code) + 1) % 1000000).padStart(6, '0');
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();

describe('sms-login service', () => {
  let sendSms;
  let handleSms;

  beforeEach(() => {
    sendSms = patchService('api::sms.sms', 'sendSms', jest.fn());
    handleSms = patchService('api::sms.sms', 'handleSms', jest.fn());
  });

  it('B2/B19: requestCode sends a fresh code, hashed, with correct metadata', async () => {
    const { user, digits } = await makeUser();
    const before = Date.now();
    const result = await svc().requestCode(digits);
    expect(result).toEqual({ invalid: false, outcome: 'sent' });

    const code = codeFrom(sendSms);
    const row = await readUser(user.id);

    expect(row.sms_login_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.sms_login_code_hash).not.toBe(code);

    const expiresAt = new Date(row.sms_login_code_expires).getTime();
    expect(Math.abs(expiresAt - (before + 10 * 60 * 1000))).toBeLessThan(30000);

    expect(row.sms_login_attempts).toBe(0);
    const lastSentAt = new Date(row.sms_login_last_sent).getTime();
    expect(Math.abs(lastSentAt - before)).toBeLessThan(30000);

    const log = Array.isArray(row.sms_login_send_log) ? row.sms_login_send_log : JSON.parse(row.sms_login_send_log);
    expect(Array.isArray(log)).toBe(true);
    const lastLogAt = new Date(log[log.length - 1]).getTime();
    expect(Math.abs(lastLogAt - before)).toBeLessThan(30000);

    for (const v of Object.values(row)) {
      expect(String(v)).not.toContain(code);
    }

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith(e164(digits), expect.stringMatching(/\d{6}/));
    expect(handleSms).not.toHaveBeenCalled();
  });

  it('B19 pruning: send_log keeps only entries from the last 24h', async () => {
    const { user, digits } = await makeUser();
    await setCols(user.id, { sms_login_send_log: [agoIso(25 * 60 * 60 * 1000), agoIso(30 * 60 * 60 * 1000)] });

    await svc().requestCode(digits);

    const row = await readUser(user.id);
    const log = Array.isArray(row.sms_login_send_log) ? row.sms_login_send_log : JSON.parse(row.sms_login_send_log);
    expect(log.length).toBe(1);
  });

  it('B3 service-level: unregistered number gives unknown, blocked user gives ineligible', async () => {
    const digits = nextPhoneDigits();
    const unregistered = await svc().requestCode(digits);
    expect(unregistered).toEqual({ invalid: false, outcome: 'unknown' });
    expect(sendSms).not.toHaveBeenCalled();

    const { user, digits: blockedDigits } = await makeUser({ blocked: true });
    const before = await readUser(user.id);
    const result = await svc().requestCode(blockedDigits);
    expect(result).toEqual({ invalid: false, outcome: 'ineligible' });
    expect(sendSms).not.toHaveBeenCalled();

    const after = await readUser(user.id);
    for (const key of Object.keys(after)) {
      if (key.startsWith('sms_login_')) {
        expect(after[key]).toEqual(before[key]);
      }
    }
  });

  it('B4: a second requestCode right away is throttled', async () => {
    const { user, digits } = await makeUser();
    const first = await svc().requestCode(digits);
    expect(first.outcome).toBe('sent');
    const code = codeFrom(sendSms);
    const before = await readUser(user.id);

    const second = await svc().requestCode(digits);
    expect(second).toEqual({ invalid: false, outcome: 'throttled' });
    expect(sendSms).toHaveBeenCalledTimes(1);

    const after = await readUser(user.id);
    expect(after.sms_login_code_hash).toBe(before.sms_login_code_hash);
    expect(new Date(after.sms_login_code_expires).getTime()).toBe(new Date(before.sms_login_code_expires).getTime());
    expect(new Date(after.sms_login_last_sent).getTime()).toBe(new Date(before.sms_login_last_sent).getTime());

    const verifyResult = await svc().verifyCode(digits, code);
    expect(verifyResult.ok).toBe(true);
  });

  it('B5: after the resend window, requestCode succeeds and issues a new code', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const oldCode = codeFrom(sendSms);

    await setCols(user.id, { sms_login_last_sent: agoIso(61 * 1000) });

    const before = await readUser(user.id);
    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');
    const newCode = codeFrom(sendSms, 1);

    const after = await readUser(user.id);
    expect(after.sms_login_code_hash).not.toBe(before.sms_login_code_hash);
    expect(after.sms_login_attempts).toBe(0);

    const oldResult = await svc().verifyCode(digits, oldCode);
    expect(oldResult.ok).toBe(false);

    const newResult = await svc().verifyCode(digits, newCode);
    expect(newResult.ok).toBe(true);
  });

  it('B9: after a successful verify, hash/expires are null and re-verify fails', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);
    const beforeVerify = await readUser(user.id);

    const result = await svc().verifyCode(digits, code);
    expect(result.ok).toBe(true);

    const after = await readUser(user.id);
    expect(after.sms_login_code_hash).toBeNull();
    expect(after.sms_login_code_expires).toBeNull();
    expect(after.sms_login_attempts).toBe(0);
    expect(new Date(after.sms_login_last_sent).getTime()).toBe(new Date(beforeVerify.sms_login_last_sent).getTime());

    const again = await svc().verifyCode(digits, code);
    expect(again.ok).toBe(false);
  });

  it('B10: a wrong code fails and bumps attempts', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);

    const result = await svc().verifyCode(digits, wrongCode(code));
    expect(result.ok).toBe(false);

    const row = await readUser(user.id);
    expect(row.sms_login_attempts).toBe(1);
  });

  it('B11: 4 wrong codes then the right one succeeds', async () => {
    const { digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);

    for (let i = 0; i < 4; i += 1) {
      const r = await svc().verifyCode(digits, wrongCode(code));
      expect(r.ok).toBe(false);
    }
    const result = await svc().verifyCode(digits, code);
    expect(result.ok).toBe(true);
  });

  it('B12: 5 wrong codes exhaust the code, and the correct code then fails', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);

    for (let i = 0; i < 5; i += 1) {
      const r = await svc().verifyCode(digits, wrongCode(code));
      expect(r.ok).toBe(false);
    }

    const row = await readUser(user.id);
    expect(row.sms_login_code_hash).toBeNull();
    expect(row.sms_login_code_expires).toBeNull();

    const sixth = await svc().verifyCode(digits, code);
    expect(sixth.ok).toBe(false);
  });

  it('B13: an expired code fails and the hash is cleared', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);
    await setCols(user.id, { sms_login_code_expires: agoIso(1000) });

    const result = await svc().verifyCode(digits, code);
    expect(result.ok).toBe(false);

    const row = await readUser(user.id);
    expect(row.sms_login_code_hash).toBeNull();
  });

  it('B14: a blocked user with the correct code fails without a jwt', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);
    await setCols(user.id, { blocked: true });

    const result = await svc().verifyCode(digits, code);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('jwt');
  });

  it('B15 service-level: malformed input fails without touching attempts', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);
    const before = await readUser(user.id);

    const cases = [
      svc().verifyCode(digits, '12345'),
      svc().verifyCode(digits, 'abcdef'),
      svc().verifyCode(digits, undefined),
      svc().verifyCode('123', code),
      svc().verifyCode(nextPhoneDigits(), code),
    ];
    const results = await Promise.all(cases);
    for (const r of results) {
      expect(r.ok).toBe(false);
    }

    const after = await readUser(user.id);
    expect(after.sms_login_attempts).toBe(before.sms_login_attempts);
  });

  it('B20 hourly cap: 5 sends within the hour blocks a new request', async () => {
    const { user, digits } = await makeUser();
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);

    await setCols(user.id, {
      sms_login_last_sent: agoIso(5 * 60 * 1000),
      sms_login_send_log: [
        agoIso(5 * 60 * 1000),
        agoIso(15 * 60 * 1000),
        agoIso(25 * 60 * 1000),
        agoIso(40 * 60 * 1000),
        agoIso(55 * 60 * 1000),
      ],
    });

    const before = await readUser(user.id);
    const result = await svc().requestCode(digits);
    expect(result).toEqual({ invalid: false, outcome: 'capped' });
    expect(sendSms).toHaveBeenCalledTimes(1);

    const after = await readUser(user.id);
    expect(after.sms_login_code_hash).toEqual(before.sms_login_code_hash);
    expect(after.sms_login_code_expires).toEqual(before.sms_login_code_expires);
    expect(after.sms_login_attempts).toEqual(before.sms_login_attempts);
    expect(after.sms_login_last_sent).toEqual(before.sms_login_last_sent);
    expect(after.sms_login_send_log).toEqual(before.sms_login_send_log);

    const verifyResult = await svc().verifyCode(digits, code);
    expect(verifyResult.ok).toBe(true);
  });

  it('B21: 4 entries in the last hour still allows a send', async () => {
    const { user, digits } = await makeUser();
    await setCols(user.id, {
      sms_login_last_sent: agoIso(5 * 60 * 1000),
      sms_login_send_log: [
        agoIso(5 * 60 * 1000),
        agoIso(15 * 60 * 1000),
        agoIso(25 * 60 * 1000),
        agoIso(40 * 60 * 1000),
      ],
    });
    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');
  });

  it('B21: 5 entries all older than an hour still allows a send', async () => {
    const { user, digits } = await makeUser();
    await setCols(user.id, {
      sms_login_last_sent: agoIso(5 * 60 * 1000),
      sms_login_send_log: [
        agoIso(61 * 60 * 1000),
        agoIso(75 * 60 * 1000),
        agoIso(90 * 60 * 1000),
        agoIso(105 * 60 * 1000),
        agoIso(119 * 60 * 1000),
      ],
    });
    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');
  });

  it('B22 daily cap: 10 entries within 24h blocks a new request', async () => {
    const { user, digits } = await makeUser();
    const log = [];
    for (let i = 0; i < 10; i += 1) {
      const minutesAgo = 120 + i * ((23 * 60 - 120) / 9);
      log.push(agoIso(minutesAgo * 60 * 1000));
    }
    await setCols(user.id, { sms_login_last_sent: agoIso(2 * 60 * 60 * 1000), sms_login_send_log: log });

    const before = await readUser(user.id);
    const result = await svc().requestCode(digits);
    expect(result).toEqual({ invalid: false, outcome: 'capped' });

    const after = await readUser(user.id);
    expect(after.sms_login_code_hash).toEqual(before.sms_login_code_hash);
    expect(after.sms_login_code_expires).toEqual(before.sms_login_code_expires);
    expect(after.sms_login_attempts).toEqual(before.sms_login_attempts);
    expect(after.sms_login_last_sent).toEqual(before.sms_login_last_sent);
    expect(after.sms_login_send_log).toEqual(before.sms_login_send_log);
  });

  it('B23: 9 entries within 2-23h allows a send', async () => {
    const { user, digits } = await makeUser();
    const log = [];
    for (let i = 0; i < 9; i += 1) {
      const minutesAgo = 120 + i * ((23 * 60 - 120) / 8);
      log.push(agoIso(minutesAgo * 60 * 1000));
    }
    await setCols(user.id, { sms_login_last_sent: agoIso(2 * 60 * 60 * 1000), sms_login_send_log: log });

    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');
  });

  it('B23: 10 entries older than 24h allow a send and prune the log', async () => {
    const { user, digits } = await makeUser();
    const log = [];
    const startMin = 24 * 60 + 1;
    const endMin = 30 * 60;
    for (let i = 0; i < 10; i += 1) {
      const minutesAgo = startMin + i * ((endMin - startMin) / 9);
      log.push(agoIso(minutesAgo * 60 * 1000));
    }
    await setCols(user.id, { sms_login_last_sent: agoIso(startMin * 60 * 1000), sms_login_send_log: log });

    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');

    const row = await readUser(user.id);
    const finalLog = Array.isArray(row.sms_login_send_log) ? row.sms_login_send_log : JSON.parse(row.sms_login_send_log);
    expect(finalLog.length).toBe(1);
  });

  it('B24: role-less user can request a code', async () => {
    const { user, digits } = await makeUser({ role: null });
    const result = await svc().requestCode(digits);
    expect(result.outcome).toBe('sent');
    expect(sendSms).toHaveBeenCalledTimes(1);

    const row = await readUser(user.id);
    expect(row.sms_login_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.role).toBeNull();
  });

  it('B25: role-less user verify assigns the authenticated role', async () => {
    const { user, digits } = await makeUser({ role: null });
    await svc().requestCode(digits);
    const code = codeFrom(sendSms);

    const wrongResult = await svc().verifyCode(digits, wrongCode(code));
    expect(wrongResult.ok).toBe(false);
    const midRow = await readUser(user.id);
    expect(midRow.role).toBeNull();

    const result = await svc().verifyCode(digits, code);
    expect(result.ok).toBe(true);
    expect(result.user.role.type).toBe('authenticated');
    expect(typeof result.jwt).toBe('string');

    const row = await readUser(user.id);
    expect(row.role.id).toBe(await svc().authenticatedRoleId());
  });

  describe('B26 custom role', () => {
    let customRoleId;

    beforeAll(async () => {
      let role = await strapi.db.query(ROLE_UID).findOne({ where: { type: 'sms-login-test-manager' } });
      if (!role) {
        role = await strapi.db.query(ROLE_UID).create({
          data: { name: 'SMS Login Test Manager', description: 'test', type: 'sms-login-test-manager' },
        });
      }
      customRoleId = role.id;
    });

    it('preserves a custom role on verify', async () => {
      const { user, digits } = await makeUser({ role: customRoleId });
      await svc().requestCode(digits);
      const code = codeFrom(sendSms);

      const result = await svc().verifyCode(digits, code);
      expect(result.ok).toBe(true);
      expect(result.user.role.type).toBe('sms-login-test-manager');

      const row = await readUser(user.id);
      expect(row.role.id).toBe(customRoleId);
    });

    it('preserves an authenticated role on verify', async () => {
      const { user, digits } = await makeUser({ role: 'authenticated' });
      await svc().requestCode(digits);
      const code = codeFrom(sendSms);
      const before = await readUser(user.id);

      const result = await svc().verifyCode(digits, code);
      expect(result.ok).toBe(true);

      const row = await readUser(user.id);
      expect(row.role.id).toBe(before.role.id);
    });
  });

  describe('B27 eligibility with email confirmation', () => {
    it('blocks a role-less blocked user without touching role', async () => {
      const { user, digits } = await makeUser({ role: null, blocked: true });
      const result = await svc().requestCode(digits);
      expect(result).toEqual({ invalid: false, outcome: 'ineligible' });
      expect(sendSms).not.toHaveBeenCalled();

      const row = await readUser(user.id);
      expect(row.role).toBeNull();
    });

    it('blocks an unconfirmed role-less user when email_confirmation is required', async () => {
      const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
      const adv = await store.get({ key: 'advanced' });
      try {
        await store.set({ key: 'advanced', value: { ...adv, email_confirmation: true } });

        const { user, digits } = await makeUser({ role: null, confirmed: false });
        const result = await svc().requestCode(digits);
        expect(result).toEqual({ invalid: false, outcome: 'ineligible' });
        expect(sendSms).not.toHaveBeenCalled();

        const row = await readUser(user.id);
        expect(row.role).toBeNull();
      } finally {
        await store.set({ key: 'advanced', value: adv });
      }
    });
  });

  it("resolveUser picks the lowest id when a phone number is shared", async () => {
    const first = await makeUser();
    const second = await makeUser();
    await setCols(second.user.id, { phoneNumber: e164(first.digits) });

    const result = await svc().resolveUser(first.digits);
    expect(result.user.id).toBe(first.user.id);
  });
});

const formatted = (digits) => `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
const REQUEST_OK_BODY = {
  ok: true,
  message: 'If that number belongs to a Garden Steward account, a login code has been sent.',
  resendAfterSeconds: 60,
  expiresInSeconds: 600,
};
const WRONG_CODE_BODY = { data: null, error: { status: 400, name: 'BadRequestError', message: 'Invalid or expired code', details: {} } };
const http = () => request(strapi.server.httpServer);

describe('sms-login HTTP', () => {
  let sendSms;
  let handleSms;

  beforeAll(async () => {
    const authRole = await strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } });
    try {
      await grantPrivileges(authRole.id, 'plugin::users-permissions.user', ['me']);
    } catch (e) {
      // v5 default Authenticated role already allows user.me; confirmed by the B8/B25 tests below.
    }
  });

  beforeEach(() => {
    sendSms = patchService('api::sms.sms', 'sendSms', jest.fn());
    handleSms = patchService('api::sms.sms', 'handleSms', jest.fn());
  });

  it('B1: request for an eligible user returns the generic body and sends a code', async () => {
    const { digits } = await makeUser();

    const res = await http()
      .post('/api/auth/sms-login/request')
      .send({ phoneNumber: formatted(digits) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(REQUEST_OK_BODY);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith(e164(digits), expect.stringMatching(/\d{6}/));
    expect(handleSms).not.toHaveBeenCalled();
  });

  it('B3: request for an unregistered number and a blocked user both look like a send', async () => {
    const unregisteredDigits = nextPhoneDigits();
    const resUnregistered = await http()
      .post('/api/auth/sms-login/request')
      .send({ phoneNumber: formatted(unregisteredDigits) });
    expect(resUnregistered.status).toBe(200);
    expect(resUnregistered.body).toEqual(REQUEST_OK_BODY);

    const { user, digits: blockedDigits } = await makeUser({ blocked: true });
    const before = await readUser(user.id);
    const resBlocked = await http()
      .post('/api/auth/sms-login/request')
      .send({ phoneNumber: formatted(blockedDigits) });
    expect(resBlocked.status).toBe(200);
    expect(resBlocked.body).toEqual(REQUEST_OK_BODY);

    expect(sendSms).not.toHaveBeenCalled();

    const after = await readUser(user.id);
    for (const key of Object.keys(after)) {
      if (key.startsWith('sms_login_')) {
        expect(after[key]).toEqual(before[key]);
      }
    }
  });

  it('B6: missing or invalid phoneNumber gives 400 and never sends', async () => {
    const resMissing = await http().post('/api/auth/sms-login/request').send({});
    expect(resMissing.status).toBe(400);
    expect(resMissing.body.error.message).toBe('Phone number is required');

    const resInvalid = await http().post('/api/auth/sms-login/request').send({ phoneNumber: '123' });
    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.error.message).toBe(
      'Invalid US phone number format. Please provide a 10-digit number with or without the country code.'
    );

    expect(sendSms).not.toHaveBeenCalled();
  });

  it('B7/B8: verify with the correct code returns a jwt and sanitized user, which works on /users/me', async () => {
    const { digits } = await makeUser();
    await http().post('/api/auth/sms-login/request').send({ phoneNumber: formatted(digits) });
    const code = codeFrom(sendSms);

    const res = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: String(code) });

    expect(res.status).toBe(200);
    expect(typeof res.body.jwt).toBe('string');
    expect(typeof res.body.user.id).toBe('number');
    expect(typeof res.body.user.documentId).toBe('string');
    expect(res.body.user.role.type).toBe('authenticated');

    const forbiddenKeys = [
      'password', 'resetPasswordToken', 'confirmationToken',
      'email_verification_token', 'email_verification_expires',
      'sms_login_code_hash', 'sms_login_code_expires', 'sms_login_attempts',
      'sms_login_last_sent', 'sms_login_send_log',
    ];
    for (const key of forbiddenKeys) {
      expect(res.body.user).not.toHaveProperty(key);
    }

    const meRes = await http()
      .get('/api/users/me')
      .set('Authorization', `Bearer ${res.body.jwt}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(res.body.user.id);
    for (const key of Object.keys(meRes.body)) {
      expect(key.startsWith('sms_login_')).toBe(false);
    }
  });

  it('B10/B15: wrong or malformed verify attempts all give the same generic 400 body', async () => {
    const { user, digits } = await makeUser();
    await http().post('/api/auth/sms-login/request').send({ phoneNumber: formatted(digits) });
    const code = codeFrom(sendSms);
    const before = await readUser(user.id);

    const resWrong = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: wrongCode(code) });
    expect(resWrong.status).toBe(400);
    expect(resWrong.body).toEqual(WRONG_CODE_BODY);

    const resUnregistered = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(nextPhoneDigits()), code });
    expect(resUnregistered.status).toBe(400);
    expect(resUnregistered.body).toEqual(WRONG_CODE_BODY);

    const resInvalidPhone = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: '123', code });
    expect(resInvalidPhone.status).toBe(400);
    expect(resInvalidPhone.body).toEqual(WRONG_CODE_BODY);

    const resShortCode = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: '12345' });
    expect(resShortCode.status).toBe(400);
    expect(resShortCode.body).toEqual(WRONG_CODE_BODY);

    const resAlphaCode = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: 'abcdef' });
    expect(resAlphaCode.status).toBe(400);
    expect(resAlphaCode.body).toEqual(WRONG_CODE_BODY);

    const resNoCode = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits) });
    expect(resNoCode.status).toBe(400);
    expect(resNoCode.body).toEqual(WRONG_CODE_BODY);

    // Malformed calls (short/alpha/missing code) never touch attempts.
    const after = await readUser(user.id);
    expect(after.sms_login_attempts).toBe(before.sms_login_attempts + 1);
  });

  it('B25 (HTTP): a role-less user verifies and gets the authenticated role', async () => {
    const { user, digits } = await makeUser({ role: null });
    await http().post('/api/auth/sms-login/request').send({ phoneNumber: formatted(digits) });
    const code = codeFrom(sendSms);

    const res = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: String(code) });

    expect(res.status).toBe(200);
    expect(res.body.user.role.type).toBe('authenticated');

    const meRes = await http()
      .get('/api/users/me')
      .set('Authorization', `Bearer ${res.body.jwt}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(user.id);
  });

  it('B26 (HTTP): a custom-role user keeps their role id and type through verify', async () => {
    let role = await strapi.db.query(ROLE_UID).findOne({ where: { type: 'sms-login-test-manager' } });
    if (!role) {
      role = await strapi.db.query(ROLE_UID).create({
        data: { name: 'SMS Login Test Manager', description: 'test', type: 'sms-login-test-manager' },
      });
    }
    const { user, digits } = await makeUser({ role: role.id });
    await http().post('/api/auth/sms-login/request').send({ phoneNumber: formatted(digits) });
    const code = codeFrom(sendSms);

    const res = await http()
      .post('/api/auth/sms-login/verify')
      .send({ phoneNumber: formatted(digits), code: String(code) });

    expect(res.status).toBe(200);
    expect(res.body.user.role.type).toBe('sms-login-test-manager');

    const row = await readUser(user.id);
    expect(row.role.id).toBe(role.id);
  });
});
