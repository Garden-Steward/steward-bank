'use strict';

// Standalone (no Strapi): api::sms.transport is a plain object.
const transport = require('../../src/api/sms/services/transport');

const ENV_KEYS = ['SMS_DRY_RUN', 'ENVIRONMENT', 'NODE_ENV', 'TWILIONUM'];

describe('billing: transport', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; });
  });

  afterEach(() => {
    // Restore env first, then drop the injected factory / memoized client.
    ENV_KEYS.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
    transport._setClientFactory(null);
    jest.restoreAllMocks();
  });

  // Sets the three dry-run inputs; undefined deletes the variable.
  const setEnv = ({ SMS_DRY_RUN, ENVIRONMENT, NODE_ENV }) => {
    Object.entries({ SMS_DRY_RUN, ENVIRONMENT, NODE_ENV }).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  };

  describe('AC10: isDryRun', () => {
    it.each([
      ['SMS_DRY_RUN=true', { SMS_DRY_RUN: 'true', ENVIRONMENT: 'prod', NODE_ENV: 'production' }],
      ['SMS_DRY_RUN=1', { SMS_DRY_RUN: '1', ENVIRONMENT: 'prod', NODE_ENV: 'production' }],
      ['ENVIRONMENT=test', { SMS_DRY_RUN: undefined, ENVIRONMENT: 'test', NODE_ENV: 'production' }],
      ['NODE_ENV=test', { SMS_DRY_RUN: undefined, ENVIRONMENT: 'prod', NODE_ENV: 'test' }],
    ])('is true for %s alone', (_label, env) => {
      setEnv(env);
      expect(transport.isDryRun()).toBe(true);
    });

    it('is false with SMS_DRY_RUN deleted, ENVIRONMENT=stg, NODE_ENV=production', () => {
      setEnv({ SMS_DRY_RUN: undefined, ENVIRONMENT: 'stg', NODE_ENV: 'production' });
      expect(transport.isDryRun()).toBe(false);
    });

    it('is false with all three unset', () => {
      setEnv({ SMS_DRY_RUN: undefined, ENVIRONMENT: undefined, NODE_ENV: undefined });
      expect(transport.isDryRun()).toBe(false);
    });

    it('is false for SMS_DRY_RUN values other than true/1', () => {
      setEnv({ SMS_DRY_RUN: 'false', ENVIRONMENT: 'prod', NODE_ENV: 'production' });
      expect(transport.isDryRun()).toBe(false);
      process.env.SMS_DRY_RUN = '0';
      expect(transport.isDryRun()).toBe(false);
    });

    it('reads process.env on every call (flipping SMS_DRY_RUN changes the result)', () => {
      setEnv({ SMS_DRY_RUN: undefined, ENVIRONMENT: 'prod', NODE_ENV: 'production' });
      expect(transport.isDryRun()).toBe(false);
      process.env.SMS_DRY_RUN = 'true';
      expect(transport.isDryRun()).toBe(true);
      process.env.SMS_DRY_RUN = '1';
      expect(transport.isDryRun()).toBe(true);
      delete process.env.SMS_DRY_RUN;
      expect(transport.isDryRun()).toBe(false);
    });
  });

  describe('AC11: dry-run never reaches Twilio', () => {
    const expected = { sid: null, numSegments: null, numMedia: null, simulated: true };

    it('resolves the simulated result and makes no client or HTTP call (injected factory)', async () => {
      setEnv({ SMS_DRY_RUN: 'true', ENVIRONMENT: 'prod', NODE_ENV: 'production' });
      const factory = jest.fn();
      transport._setClientFactory(factory);
      const requestSpy = jest.spyOn(require('twilio/lib/base/RequestClient').prototype, 'request');

      const result = await transport.create({ to: '+15550000001', body: 'hi' });

      expect(result).toEqual(expected);
      expect(factory).toHaveBeenCalledTimes(0);
      expect(requestSpy).toHaveBeenCalledTimes(0);
      requestSpy.mockRestore();
    });

    it('also makes no HTTP call with the default factory', async () => {
      setEnv({ SMS_DRY_RUN: 'true', ENVIRONMENT: 'prod', NODE_ENV: 'production' });
      transport._setClientFactory(null);
      const requestSpy = jest.spyOn(require('twilio/lib/base/RequestClient').prototype, 'request');

      const result = await transport.create({ to: '+15550000001', body: 'hi', mediaUrl: 'https://x.test/a.jpg' });

      expect(result).toEqual(expected);
      expect(requestSpy).toHaveBeenCalledTimes(0);
      requestSpy.mockRestore();
    });

    it('is also dry-run under NODE_ENV=test with no explicit flag', async () => {
      setEnv({ SMS_DRY_RUN: undefined, ENVIRONMENT: undefined, NODE_ENV: 'test' });
      const factory = jest.fn();
      transport._setClientFactory(factory);

      await expect(transport.create({ to: '+15550000001', body: 'hi' })).resolves.toEqual(expected);
      expect(factory).toHaveBeenCalledTimes(0);
    });
  });

  describe('AC12: outside dry-run, create calls messages.create', () => {
    const to = '+15550000002';
    const body = 'hello garden';
    let fakeCreate;
    let factory;

    beforeEach(() => {
      // Install the fake factory BEFORE flipping env out of dry-run.
      fakeCreate = jest.fn().mockResolvedValue({ sid: 'SM1', numSegments: '1', numMedia: '0' });
      factory = jest.fn(() => ({ messages: { create: fakeCreate } }));
      transport._setClientFactory(factory);
      setEnv({ SMS_DRY_RUN: undefined, ENVIRONMENT: 'prod', NODE_ENV: 'production' });
      process.env.TWILIONUM = '+15550009999';
    });

    it('calls messages.create once with exactly { body, from, to } and no mediaUrl key', async () => {
      await transport.create({ to, body });

      expect(fakeCreate).toHaveBeenCalledTimes(1);
      const arg = fakeCreate.mock.calls[0][0];
      expect(arg).toStrictEqual({ body, from: '+15550009999', to });
      expect(Object.keys(arg)).not.toContain('mediaUrl');
    });

    it('includes mediaUrl when one is provided', async () => {
      await transport.create({ to, body, mediaUrl: 'https://x.test/a.jpg' });

      expect(fakeCreate).toHaveBeenCalledTimes(1);
      expect(fakeCreate.mock.calls[0][0]).toStrictEqual({
        body, from: '+15550009999', to, mediaUrl: 'https://x.test/a.jpg',
      });
    });

    it('memoizes the client: two creates call the factory once', async () => {
      await transport.create({ to, body });
      await transport.create({ to, body });

      expect(fakeCreate).toHaveBeenCalledTimes(2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('passes the account credentials from env to the factory', async () => {
      const savedSid = process.env.TWILIO_ACCOUNT_SID;
      const savedToken = process.env.TWILIO_AUTH_TOKEN;
      process.env.TWILIO_ACCOUNT_SID = 'ACtest';
      process.env.TWILIO_AUTH_TOKEN = 'tok';
      try {
        await transport.create({ to, body });
        expect(factory).toHaveBeenCalledWith('ACtest', 'tok');
      } finally {
        if (savedSid === undefined) delete process.env.TWILIO_ACCOUNT_SID; else process.env.TWILIO_ACCOUNT_SID = savedSid;
        if (savedToken === undefined) delete process.env.TWILIO_AUTH_TOKEN; else process.env.TWILIO_AUTH_TOKEN = savedToken;
      }
    });

    it('propagates the exact Twilio rejection (code preserved)', async () => {
      const err = Object.assign(new Error('unsub'), { code: 21610 });
      fakeCreate.mockRejectedValueOnce(err);

      await expect(transport.create({ to, body })).rejects.toBe(err);
    });

    it('resolves { sid, numSegments, numMedia, simulated: false }', async () => {
      await expect(transport.create({ to, body })).resolves.toEqual({
        sid: 'SM1', numSegments: '1', numMedia: '0', simulated: false,
      });
    });
  });
});
