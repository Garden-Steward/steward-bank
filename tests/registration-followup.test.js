// Unit tests for the stalled SMS sign-up follow-up. No Strapi boot needed.
const Followup = require('../src/api/message/services/registration-followup');
const SmsHelper = require('../src/api/message/controllers/SmsHelper');

describe('sendRegistrationFollowUps', () => {
  let findMany, update, handleSms;

  beforeEach(() => {
    findMany = jest.fn();
    update = jest.fn().mockResolvedValue({});
    handleSms = jest.fn().mockResolvedValue();
    global.strapi = {
      db: { query: jest.fn(() => ({ findMany, update })) },
      service: jest.fn(() => ({ handleSms })),
      log: { info: jest.fn(), error: jest.fn() },
    };
  });

  afterEach(() => {
    delete global.strapi;
  });

  it('only looks for placeholder-email users, 30 min to 24 h old, not yet nudged or opted out', async () => {
    findMany.mockResolvedValue([]);
    const before = Date.now();
    await Followup.sendRegistrationFollowUps();
    const { where } = findMany.mock.calls[0][0];
    expect(where.email).toBe('test@test.com');
    expect(where.registration_followup_sent_at).toEqual({ $null: true });
    expect(where.sms_opted_out_at).toEqual({ $null: true });
    const minutesAgo = (d) => (before - d.getTime()) / 60000;
    expect(Math.round(minutesAgo(where.createdAt.$lte))).toBe(30);
    expect(Math.round(minutesAgo(where.createdAt.$gte))).toBe(24 * 60);
  });

  it('marks each user and texts them the email ask', async () => {
    const user = { id: 4, phoneNumber: '+15555550100', activeGarden: { id: 1 } };
    findMany.mockResolvedValue([user]);
    const result = await Followup.sendRegistrationFollowUps();

    expect(update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { registration_followup_sent_at: expect.any(Date) },
    });
    expect(handleSms).toHaveBeenCalledWith(expect.objectContaining({
      user,
      body: Followup.FOLLOWUP_BODY,
      type: 'registration',
    }));
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(handleSms.mock.invocationCallOrder[0]);
    expect(result).toEqual({ found: 1, sent: 1 });
  });

  it('keeps going when one send fails', async () => {
    findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    handleSms.mockRejectedValueOnce(new Error('twilio down'));
    const result = await Followup.sendRegistrationFollowUps();
    expect(handleSms).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ found: 2, sent: 1 });
  });
});

describe('email replies', () => {
  it.each([
    ['jo@example.com', 'jo@example.com'],
    ["sure! it's Jo.Smith+garden@Mail.Berkeley.edu 😊", 'jo.smith+garden@mail.berkeley.edu'],
    ['hello there', null],
    ['', null],
  ])('extracts the address from %p', (text, expected) => {
    expect(SmsHelper.extractEmail(text)).toBe(expected);
  });

  it('only treats a reply as an email for unfinished sign-ups', () => {
    expect(SmsHelper.checkEmail({ email: 'test@test.com' }, 'my email is jo@example.com')).toBe(true);
    expect(SmsHelper.checkEmail({ email: 'jo@example.com' }, 'new@example.com')).toBe(false);
    expect(SmsHelper.checkEmail({ email: 'test@test.com' }, 'jo smith')).toBe(false);
    expect(SmsHelper.checkEmail(null, 'jo@example.com')).toBe(false);
  });

  describe('saveVolunteerEmail', () => {
    let update, sendContactCard;

    beforeEach(() => {
      update = jest.fn().mockResolvedValue({});
      sendContactCard = jest.fn().mockResolvedValue();
      global.strapi = {
        db: { query: jest.fn(() => ({ update })) },
        service: jest.fn(() => ({ sendContactCard })),
      };
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      delete global.strapi;
      console.log.mockRestore();
    });

    it('saves just the address and asks for a name when we lack one', async () => {
      const user = { id: 9, email: 'test@test.com', phoneNumber: '+15555550100', username: '+15555550100' };
      const res = await SmsHelper.saveVolunteerEmail(user, 'here you go: jo@example.com!');
      expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { email: 'jo@example.com' } });
      expect(res.body).toMatch(/full name/);
      expect(sendContactCard).not.toHaveBeenCalled();
    });

    it('finishes sign-up when the name is already on file', async () => {
      const user = { id: 9, email: 'test@test.com', phoneNumber: '+15555550100', username: 'Jo Smith', firstName: 'Jo' };
      const res = await SmsHelper.saveVolunteerEmail(user, 'jo@example.com');
      expect(res.type).toBe('complete');
      expect(res.body).toMatch(/Thank you Jo! You're all signed up/);
      expect(sendContactCard).toHaveBeenCalledWith('+15555550100');
    });
  });
});
