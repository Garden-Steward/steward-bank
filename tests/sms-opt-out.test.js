// Unit tests for SMS opt-out handling. No Strapi boot needed: the db query is mocked.
const SmsOptOut = require('../src/utils/sms-opt-out');

describe('SMS opt-out keywords', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'cancel', 'END', 'quit', 'revoke', 'opt out', 'Opt-Out', 'optout', 'unsubscribe', 'stopall', 'Stop all'])(
    'treats %p as an opt-out',
    (text) => {
      expect(SmsOptOut.isOptOutKeyword(text)).toBe(true);
    }
  );

  it.each(['yes', 'no', 'stopped by the garden', 'end of the day works', 'please cancel my rsvp', ''])(
    'does not treat %p as an opt-out',
    (text) => {
      expect(SmsOptOut.isOptOutKeyword(text)).toBe(false);
    }
  );

  it('recognizes opt-in keywords', () => {
    expect(SmsOptOut.isOptInKeyword('START')).toBe(true);
    expect(SmsOptOut.isOptInKeyword('unstop')).toBe(true);
    expect(SmsOptOut.isOptInKeyword('started')).toBe(false);
  });
});

describe('SMS opt-out state', () => {
  let update;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({});
    global.strapi = { db: { query: jest.fn(() => ({ update })) } };
  });

  afterEach(() => {
    delete global.strapi;
  });

  it('isOptedOut reads sms_opted_out_at', () => {
    expect(SmsOptOut.isOptedOut({ sms_opted_out_at: '2026-10-13T00:00:00Z' })).toBe(true);
    expect(SmsOptOut.isOptedOut({ sms_opted_out_at: null })).toBe(false);
    expect(SmsOptOut.isOptedOut(null)).toBe(false);
  });

  it('markOptedOut sets only the timestamp, never gardens', async () => {
    await SmsOptOut.markOptedOut({ id: 7 });
    const { where, data } = update.mock.calls[0][0];
    expect(where).toEqual({ id: 7 });
    expect(Object.keys(data)).toEqual(['sms_opted_out_at']);
    expect(data.sms_opted_out_at).toBeInstanceOf(Date);
  });

  it('markOptedIn clears the timestamp', async () => {
    await SmsOptOut.markOptedIn({ id: 7 });
    expect(update.mock.calls[0][0].data).toEqual({ sms_opted_out_at: null });
  });

  it('does nothing for an unknown user', async () => {
    await SmsOptOut.markOptedOut(null);
    expect(update).not.toHaveBeenCalled();
  });

  it('records an opt-out on Twilio 21610', async () => {
    await SmsOptOut.handleSendError({ id: 3 }, { code: 21610 });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('leaves the user alone on other send errors', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await SmsOptOut.handleSendError({ id: 3 }, { code: 20429, message: 'Too Many Requests' });
    await SmsOptOut.handleSendError({ id: 3 }, new Error('network down'));
    expect(update).not.toHaveBeenCalled();
    console.log.mockRestore();
  });
});
