'use strict';

/**
 * Twilio signature middleware on POST /api/sms. Covers AC46-AC50.
 * Shares the global `strapi` booted for tests/app.test.js.
 */

const { getExpectedTwilioSignature } = require('twilio/lib/webhooks/webhooks');
const { patch } = require('../helpers/patch');
const { grantPrivileges } = require('../helpers/strapi');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const {
  makeOrg, makeGarden, makeUser, http, ledgerFind, ledgerCount, setEnv, stubTransport, clearResolver,
} = require('./helpers');

const URL = 'https://example.test/api/sms';
const SMILES_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You\'re cute, but I\'m just a bot ;)</Message></Response>';

describe('billing: signature', () => {
  let org;
  let g;
  let u;
  let params;
  let sig;
  let restore;

  const post = (headers = {}) => {
    let req = http().post('/api/sms').type('form');
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return req.send(params);
  };
  const env = (vars) => { restore = setEnv(vars); };
  const warnCalls = (spy) => spy.mock.calls.map((c) => String(c[0]));

  beforeAll(async () => {
    await grantPrivileges(2, 'api::message.message', ['fetchSms']);
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
  });

  beforeEach(async () => {
    clearResolver();
    u = await makeUser({ activeGarden: g.published.id, gardens: [g.published.id] });
    params = { From: u.phoneNumber, Body: 'smiles' };
    sig = getExpectedTwilioSignature('tok', URL, params);
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
    clearResolver();
  });

  it('AC46: log mode with no signature still answers and logs valid=false', async () => {
    env({ TWILIO_SIGNATURE_MODE: undefined, TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: 'tok' });
    const warn = patch(strapi.log, 'warn', jest.fn());

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.text).toBe(SMILES_TWIML);
    expect(await ledgerFind({ to_number: u.phoneNumber, source: 'webhook.reply' })).toHaveLength(1);
    const lines = warnCalls(warn).filter((l) => l.includes('twilio-signature') && l.includes('valid=false'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).not.toContain(u.phoneNumber);
      expect(l).not.toContain('smiles');
    }
  });

  it('AC47: enforce with a valid signature passes', async () => {
    env({ TWILIO_SIGNATURE_MODE: 'enforce', TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: 'tok' });

    const res = await post({ 'X-Twilio-Signature': sig });

    expect(res.status).toBe(200);
    expect(res.text).toBe(SMILES_TWIML);
  });

  it('AC48: enforce rejects a wrong or missing signature with an empty 403 and no side effects', async () => {
    env({ TWILIO_SIGNATURE_MODE: 'enforce', TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: 'tok' });
    const transport = stubTransport();
    const getUser = patch(SmsHelper, 'getUser', jest.fn());
    const count = async () => [
      await strapi.db.query('plugin::users-permissions.user').count(),
      await strapi.db.query('api::message.message').count(),
      await ledgerCount(),
    ];
    const before = await count();

    for (const headers of [{ 'X-Twilio-Signature': 'wrong' }, {}]) {
      const res = await post(headers);
      expect(res.status).toBe(403);
      expect(res.text).toBe('');
    }

    expect(await count()).toEqual(before);
    expect(transport).toHaveBeenCalledTimes(0);
    expect(getUser).toHaveBeenCalledTimes(0);
  });

  describe('AC49: missing config', () => {
    it('enforce without TWILIO_WEBHOOK_URL returns 403 and logs the var', async () => {
      env({ TWILIO_SIGNATURE_MODE: 'enforce', TWILIO_WEBHOOK_URL: undefined, TWILIO_AUTH_TOKEN: 'tok' });
      const error = patch(strapi.log, 'error', jest.fn());

      const res = await post({ 'X-Twilio-Signature': sig });

      expect(res.status).toBe(403);
      expect(warnCalls(error).some((l) => l.includes('TWILIO_WEBHOOK_URL'))).toBe(true);
    });

    it('enforce without TWILIO_AUTH_TOKEN returns 403 and logs the var', async () => {
      env({ TWILIO_SIGNATURE_MODE: 'enforce', TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: undefined });
      const error = patch(strapi.log, 'error', jest.fn());

      const res = await post({ 'X-Twilio-Signature': sig });

      expect(res.status).toBe(403);
      expect(warnCalls(error).some((l) => l.includes('TWILIO_AUTH_TOKEN'))).toBe(true);
    });

    it('log without TWILIO_WEBHOOK_URL passes and warns "skipped"', async () => {
      env({ TWILIO_SIGNATURE_MODE: 'log', TWILIO_WEBHOOK_URL: undefined, TWILIO_AUTH_TOKEN: 'tok' });
      const warn = patch(strapi.log, 'warn', jest.fn());

      const res = await post();

      expect(res.status).toBe(200);
      expect(warnCalls(warn).some((l) => l.includes('skipped'))).toBe(true);
    });
  });

  it('AC50: the mode is read per request', async () => {
    env({ TWILIO_SIGNATURE_MODE: 'enforce', TWILIO_WEBHOOK_URL: URL, TWILIO_AUTH_TOKEN: 'tok' });
    expect((await post()).status).toBe(403);

    process.env.TWILIO_SIGNATURE_MODE = 'log';
    expect((await post()).status).toBe(200);
  });
});
