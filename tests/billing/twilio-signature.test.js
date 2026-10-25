'use strict';

const { getExpectedTwilioSignature } = require('twilio/lib/webhooks/webhooks');
const { resolveMode, evaluate } = require('../../src/utils/twilio-signature');

const URL_ = 'https://example.test/api/sms';
const TOKEN = 'tok';
const params = { Body: 'hello', From: '+15550000001' };
const good = getExpectedTwilioSignature(TOKEN, URL_, params);

describe('twilio-signature: resolveMode', () => {
  it.each([
    [undefined, { mode: 'log', unknown: false }],
    ['', { mode: 'log', unknown: false }],
    ['log', { mode: 'log', unknown: false }],
    ['enforce', { mode: 'enforce', unknown: false }],
    ['weird', { mode: 'log', unknown: true }],
  ])('%p', (raw, expected) => {
    expect(resolveMode(raw)).toEqual(expected);
  });
});

describe('twilio-signature: evaluate', () => {
  const base = { authToken: TOKEN, url: URL_, signature: good, params };

  it.each(['log', 'enforce'])('%s + valid signature allows', (mode) => {
    expect(evaluate({ ...base, mode })).toEqual({ mode, valid: true, allow: true, reason: 'ok', missing: [] });
  });

  it('log + wrong signature allows', () => {
    expect(evaluate({ ...base, mode: 'log', signature: 'bad' })).toMatchObject({ valid: false, allow: true, reason: 'invalid-signature' });
  });
  it('enforce + wrong signature denies', () => {
    expect(evaluate({ ...base, mode: 'enforce', signature: 'bad' })).toMatchObject({ valid: false, allow: false, reason: 'invalid-signature' });
  });
  it('signature for different params is invalid', () => {
    expect(evaluate({ ...base, mode: 'enforce', params: { ...params, Body: 'tampered' } })).toMatchObject({ valid: false, allow: false });
  });

  it.each([undefined, ''])('log + missing signature (%p) allows', (signature) => {
    expect(evaluate({ ...base, mode: 'log', signature })).toMatchObject({ valid: false, allow: true, reason: 'missing-signature' });
  });
  it('enforce + missing signature denies', () => {
    expect(evaluate({ ...base, mode: 'enforce', signature: undefined })).toMatchObject({ valid: false, allow: false, reason: 'missing-signature' });
  });

  it.each([
    ['url', { url: undefined }, ['TWILIO_WEBHOOK_URL']],
    ['token', { authToken: undefined }, ['TWILIO_AUTH_TOKEN']],
    ['both', { url: '', authToken: '' }, ['TWILIO_WEBHOOK_URL', 'TWILIO_AUTH_TOKEN']],
  ])('missing %s', (_n, override, missing) => {
    expect(evaluate({ ...base, ...override, mode: 'log' })).toEqual({ mode: 'log', valid: false, allow: true, reason: 'missing-config', missing });
    expect(evaluate({ ...base, ...override, mode: 'enforce' })).toEqual({ mode: 'enforce', valid: false, allow: false, reason: 'missing-config', missing });
  });

  it('missing config takes precedence over missing signature', () => {
    expect(evaluate({ ...base, url: undefined, signature: undefined, mode: 'enforce' }).reason).toBe('missing-config');
  });

  it('undefined params is treated as empty and never throws', () => {
    expect(() => evaluate({ ...base, mode: 'enforce', params: undefined })).not.toThrow();
  });

  it('validation-error path: fails closed in enforce, open in log', () => {
    const spy = jest.spyOn(require('twilio'), 'validateRequest').mockImplementation(() => { throw new Error('x'); });
    try {
      expect(evaluate({ ...base, mode: 'enforce' })).toMatchObject({ valid: false, allow: false, reason: 'validation-error' });
      expect(evaluate({ ...base, mode: 'log' })).toMatchObject({ valid: false, allow: true, reason: 'validation-error' });
    } finally {
      spy.mockRestore();
    }
  });
});
