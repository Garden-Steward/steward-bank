const SmsHelper = require('../../src/api/message/controllers/SmsHelper');

const userMock = {
  id: 5,
  firstName: 'Jane',
  lastName: 'Doe',
  phoneNumber: '+13031112222',
};

const baseCampaign = (overrides = {}) => ({
  id: 99,
  type: 'poll',
  createdAt: new Date().toISOString(),
  closes_at: null,
  winner: null,
  reminder_sent: false,
  poll_options: [
    { label: 'A', date: 'Jun 1', time: '10am', location: 'Main Garden' },
    { label: 'B', date: 'Jun 7', time: '9am',  location: 'East Beds'  },
    { label: 'C', date: 'Jun 14', time: '10am', location: 'Main Garden' },
  ],
  option_a: [],
  option_b: [],
  option_c: [],
  option_d: [],
  sender: { id: 42, firstName: 'Admin', phoneNumber: '+13039998888' },
  garden:  { id: 1, slug: 'my-garden' },
  ...overrides,
});

// Mock strapi.db.query for both findMany (getLatestCampaign) and findOne (closePoll)
const mockDb = (campaign) => {
  strapi.db.query = jest.fn().mockReturnValue({
    findMany: jest.fn().mockResolvedValue(campaign ? [campaign] : []),
    findOne:  jest.fn().mockResolvedValue(campaign ?? null),
    update:   jest.fn().mockResolvedValue(campaign ?? {}),
  });
};

// ─── handlePollResponse (SmsHelper) ────────────────────────────────────────

describe('handlePollResponse', function () {
  let originalRecordPollVote;

  beforeEach(() => {
    originalRecordPollVote = strapi.service('api::sms-campaign.sms-campaign').recordPollVote;
  });

  afterEach(() => {
    strapi.service('api::sms-campaign.sms-campaign').recordPollVote = originalRecordPollVote;
  });

  it('returns "must be registered" when user is null', async () => {
    const result = await SmsHelper.handlePollResponse(null, 'a');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('registered');
  });

  it('normalises "A B" to "ab" before delegating', async () => {
    strapi.service('api::sms-campaign.sms-campaign').recordPollVote =
      jest.fn().mockResolvedValue({ body: 'Added A & B.', type: 'complete' });
    await SmsHelper.handlePollResponse(userMock, 'A B');
    expect(strapi.service('api::sms-campaign.sms-campaign').recordPollVote)
      .toHaveBeenCalledWith(userMock, 'ab');
  });

  it('normalises "A,B" to "ab" before delegating', async () => {
    strapi.service('api::sms-campaign.sms-campaign').recordPollVote =
      jest.fn().mockResolvedValue({ body: 'Added A & B.', type: 'complete' });
    await SmsHelper.handlePollResponse(userMock, 'A,B');
    expect(strapi.service('api::sms-campaign.sms-campaign').recordPollVote)
      .toHaveBeenCalledWith(userMock, 'ab');
  });

  it('delegates single letter and returns its result', async () => {
    strapi.service('api::sms-campaign.sms-campaign').recordPollVote =
      jest.fn().mockResolvedValue({ body: 'Added A. Voting for: A (Jun 1 10am).', type: 'complete' });
    const result = await SmsHelper.handlePollResponse(userMock, 'a');
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('A');
  });

});

// ─── recordPollVote (service, Doodle multi-select add-only) ─────────────────

describe('recordPollVote', function () {
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');

  let originalDbQuery;
  let updateSpy;

  beforeEach(() => {
    originalDbQuery = strapi.db.query;
    updateSpy = jest.spyOn(strapi.entityService, 'update').mockResolvedValue({});
  });

  afterEach(() => {
    strapi.db.query = originalDbQuery;
    updateSpy.mockRestore();
  });

  it('returns "no active poll" when no campaign found', async () => {
    mockDb(null);
    const result = await svc().recordPollVote(userMock, 'a');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('No active poll');
  });

  it('returns "already closed" when closes_at is in the past', async () => {
    mockDb(baseCampaign({ closes_at: new Date(Date.now() - 3_600_000).toISOString() }));
    const result = await svc().recordPollVote(userMock, 'a');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('closed');
  });

  it('returns "no active poll" when campaign is older than 30 days and no closes_at', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    mockDb(baseCampaign({ createdAt: old.toISOString() }));
    const result = await svc().recordPollVote(userMock, 'a');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('No active poll');
  });

  it('returns error listing valid options when letter is invalid', async () => {
    mockDb(baseCampaign());
    const result = await svc().recordPollVote(userMock, 'z');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('A');
    expect(result.body).toContain('B');
  });

  it('records a single new vote and returns confirmation with label', async () => {
    mockDb(baseCampaign());
    const result = await svc().recordPollVote(userMock, 'a');
    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign',
      99,
      expect.objectContaining({ data: expect.objectContaining({ option_a: [userMock.id] }) })
    );
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('A');
    expect(result.body).toContain('Jun 1');
  });

  it('records multi-letter vote "ab" — adds both A and B', async () => {
    mockDb(baseCampaign());
    const result = await svc().recordPollVote(userMock, 'ab');
    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign',
      99,
      expect.objectContaining({
        data: expect.objectContaining({
          option_a: [userMock.id],
          option_b: [userMock.id],
        }),
      })
    );
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('A');
    expect(result.body).toContain('B');
  });

  it('does NOT remove prior votes when adding a new one (Doodle mode)', async () => {
    // User already voted A; now votes B — A must remain
    mockDb(baseCampaign({ option_a: [{ id: userMock.id }] }));
    const result = await svc().recordPollVote(userMock, 'b');
    const callData = updateSpy.mock.calls[0][2].data;
    expect(callData.option_b).toContain(userMock.id);
    expect(callData.option_a).toBeUndefined(); // A was not touched
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('B');
    // Confirmation should list BOTH current votes
    expect(result.body).toContain('A');
  });

  it('informs user when they already voted for that option (add-only, no update)', async () => {
    mockDb(baseCampaign({ option_a: [{ id: userMock.id }] }));
    const result = await svc().recordPollVote(userMock, 'a');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.type).toEqual('reply');
    expect(result.body.toLowerCase()).toContain('already');
    expect(result.body).toContain('A');
  });

  it('handles partial overlap in multi-letter: adds B, reports A already had', async () => {
    mockDb(baseCampaign({ option_a: [{ id: userMock.id }] }));
    const result = await svc().recordPollVote(userMock, 'ab');
    expect(updateSpy).toHaveBeenCalled(); // B was added
    const callData = updateSpy.mock.calls[0][2].data;
    expect(callData.option_b).toContain(userMock.id);
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('Already had A');
    expect(result.body).toContain('B');
  });

  it('handles a DB update error gracefully', async () => {
    mockDb(baseCampaign());
    updateSpy.mockRejectedValue(new Error('DB error'));
    const result = await svc().recordPollVote(userMock, 'a');
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('issue');
  });

});

// ─── closePoll (service) ────────────────────────────────────────────────────

describe('closePoll', function () {
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');

  let originalDbQuery;
  let updateSpy;

  beforeEach(() => {
    originalDbQuery = strapi.db.query;
    updateSpy = jest.spyOn(strapi.entityService, 'update').mockResolvedValue({});
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    strapi.db.query = originalDbQuery;
    updateSpy.mockRestore();
  });

  it('throws when campaign is not found', async () => {
    mockDb(null);
    await expect(svc().closePoll(999)).rejects.toThrow('not found');
  });

  it('throws when campaign type is not poll', async () => {
    mockDb(baseCampaign({ type: 'rsvp' }));
    await expect(svc().closePoll(99)).rejects.toThrow('not a poll');
  });

  it('returns alreadyClosed when winner is already set', async () => {
    mockDb(baseCampaign({ winner: 'A' }));
    const result = await svc().closePoll(99);
    expect(result.alreadyClosed).toBe(true);
    expect(result.winner).toEqual('A');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('picks the option with the most votes as winner', async () => {
    mockDb(baseCampaign({
      option_a: [{ id: 1 }, { id: 2 }],
      option_b: [{ id: 3 }],
    }));
    const result = await svc().closePoll(99);
    expect(result.winner).toEqual('A');
    expect(result.totalVotes).toEqual(3);
    expect(result.tally).toEqual({ a: 2, b: 1, c: 0, d: 0 });
    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign', 99,
      expect.objectContaining({ data: expect.objectContaining({ winner: 'A' }) })
    );
  });

  it('breaks a tie by picking the earliest letter', async () => {
    mockDb(baseCampaign({
      option_a: [{ id: 1 }],
      option_b: [{ id: 2 }],
    }));
    const result = await svc().closePoll(99);
    expect(result.winner).toEqual('A');
  });

  it('still texts the sender even when zero votes', async () => {
    mockDb(baseCampaign());
    const result = await svc().closePoll(99);
    expect(result.winner).toBeNull();
    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalled();
    const body = strapi.service('api::sms.sms').handleSms.mock.calls[0][0].body;
    expect(body.toLowerCase()).toContain('no votes');
    expect(body).toContain('steward.garden/manage/gardens/my-garden');
  });

  it('sends SMS to sender with vote count, tally, and manage link', async () => {
    mockDb(baseCampaign({
      option_a: [{ id: 1 }, { id: 2 }, { id: 3 }],
      option_b: [{ id: 4 }],
    }));
    await svc().closePoll(99);
    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalled();
    const smsSent = strapi.service('api::sms.sms').handleSms.mock.calls[0][0];
    expect(smsSent.body).toContain('A');
    expect(smsSent.body).toContain('4');
    expect(smsSent.body).toContain('3');
    expect(smsSent.body).toContain('steward.garden/manage/gardens/my-garden');
    expect(smsSent.user).toMatchObject({ id: 42 });
  });

});

// ─── sendPollReminders (service) ────────────────────────────────────────────

describe('sendPollReminders', function () {
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');

  let originalDbQuery;
  let updateSpy;

  beforeEach(() => {
    originalDbQuery = strapi.db.query;
    updateSpy = jest.spyOn(strapi.entityService, 'update').mockResolvedValue({});
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    strapi.db.query = originalDbQuery;
    updateSpy.mockRestore();
  });

  it('sends reminder only to non-voters and stamps reminder_sent', async () => {
    const closer = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const campaign = baseCampaign({
      closes_at: closer,
      reminder_sent: false,
      sent: [
        { id: 1, firstName: 'Alice', phoneNumber: '+13030001111' },
        { id: 2, firstName: 'Bob',   phoneNumber: '+13030002222' },
        { id: 3, firstName: 'Carol', phoneNumber: '+13030003333' },
      ],
      option_a: [{ id: 1 }], // Alice already voted
    });

    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
    });

    await svc().sendPollReminders();

    // Only Bob and Carol should get the reminder (Alice already voted)
    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalledTimes(2);
    const recipients = strapi.service('api::sms.sms').handleSms.mock.calls.map(c => c[0].user.id);
    expect(recipients).toContain(2);
    expect(recipients).toContain(3);
    expect(recipients).not.toContain(1);

    // reminder_sent should be stamped true
    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign', 99,
      expect.objectContaining({ data: { reminder_sent: true } })
    );
  });

  it('reminder SMS includes option labels and "1 day left" language', async () => {
    const campaign = baseCampaign({
      closes_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      sent: [{ id: 2, firstName: 'Bob', phoneNumber: '+13030002222' }],
    });

    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
    });

    await svc().sendPollReminders();

    const body = strapi.service('api::sms.sms').handleSms.mock.calls[0][0].body;
    expect(body).toContain('1 day');
    expect(body).toContain('A:');
    expect(body).toContain('B:');
  });

  it('skips campaigns where reminder_sent is already true', async () => {
    // Simulated by the DB query returning nothing (cron filters on reminder_sent: false)
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([]),
    });

    const result = await svc().sendPollReminders();
    expect(result.remindersProcessed).toEqual(0);
    expect(strapi.service('api::sms.sms').handleSms).not.toHaveBeenCalled();
  });

  it('skips campaigns where send_reminder is false (cron does not return them)', async () => {
    // The DB query filters out send_reminder: false at the query level.
    // Simulate this by returning an empty array (as the DB would).
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([]),
    });

    const result = await svc().sendPollReminders();
    expect(result.remindersProcessed).toEqual(0);
    expect(strapi.service('api::sms.sms').handleSms).not.toHaveBeenCalled();
  });

  it('does not SMS users with no phone number', async () => {
    const campaign = baseCampaign({
      closes_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      sent: [
        { id: 1, firstName: 'Alice', phoneNumber: null },
        { id: 2, firstName: 'Bob',   phoneNumber: '+13030002222' },
      ],
    });

    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
    });

    await svc().sendPollReminders();
    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalledTimes(1);
    expect(strapi.service('api::sms.sms').handleSms.mock.calls[0][0].user.id).toBe(2);
  });

});

// ─── autoCloseExpiredPolls (service) ────────────────────────────────────────

describe('autoCloseExpiredPolls', function () {
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');

  let originalDbQuery;
  let updateSpy;

  // A campaign whose closes_at is in the past and has votes
  const expiredCampaign = (overrides = {}) => baseCampaign({
    closes_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    winner: null,
    option_a: [{ id: 1 }, { id: 2 }],
    option_b: [{ id: 3 }],
    ...overrides,
  });

  beforeEach(() => {
    originalDbQuery = strapi.db.query;
    updateSpy = jest.spyOn(strapi.entityService, 'update').mockResolvedValue({});
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    strapi.db.query = originalDbQuery;
    updateSpy.mockRestore();
  });

  it('closes expired polls and returns count', async () => {
    const campaign = expiredCampaign();
    // findMany for autoClose (list), findOne for closePoll (detail)
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
      findOne:  jest.fn().mockResolvedValue(campaign),
    });

    const result = await svc().autoCloseExpiredPolls();

    expect(result.closed).toEqual(1);
    // closePoll should have stamped the winner
    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign',
      99,
      expect.objectContaining({ data: expect.objectContaining({ winner: 'A' }) })
    );
  });

  it('stamps the correct winner based on vote counts', async () => {
    // B has more votes than A
    const campaign = expiredCampaign({
      option_a: [{ id: 1 }],
      option_b: [{ id: 2 }, { id: 3 }, { id: 4 }],
    });
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
      findOne:  jest.fn().mockResolvedValue(campaign),
    });

    await svc().autoCloseExpiredPolls();

    expect(updateSpy).toHaveBeenCalledWith(
      'api::sms-campaign.sms-campaign',
      99,
      expect.objectContaining({ data: expect.objectContaining({ winner: 'B' }) })
    );
  });

  it('notifies the sender when auto-closing', async () => {
    const campaign = expiredCampaign();
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
      findOne:  jest.fn().mockResolvedValue(campaign),
    });

    await svc().autoCloseExpiredPolls();

    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalled();
    const msg = strapi.service('api::sms.sms').handleSms.mock.calls[0][0];
    expect(msg.user).toMatchObject({ id: 42 });
    expect(msg.body).toContain('Winner');
    expect(msg.body).toContain('steward.garden/manage/gardens/my-garden');
  });

  it('notifies the sender with "no votes" when poll expires with zero votes', async () => {
    const campaign = expiredCampaign({ option_a: [], option_b: [], option_c: [], option_d: [] });
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([campaign]),
      findOne:  jest.fn().mockResolvedValue(campaign),
    });

    await svc().autoCloseExpiredPolls();

    const body = strapi.service('api::sms.sms').handleSms.mock.calls[0][0].body;
    expect(body.toLowerCase()).toContain('no votes');
  });

  it('skips polls that are already closed (winner already set)', async () => {
    // The DB query filters on winner: null, so this returns nothing
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([]),
      findOne:  jest.fn().mockResolvedValue(null),
    });

    const result = await svc().autoCloseExpiredPolls();
    expect(result.closed).toEqual(0);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(strapi.service('api::sms.sms').handleSms).not.toHaveBeenCalled();
  });

  it('processes multiple expired polls in one run', async () => {
    const campA = expiredCampaign({ id: 101, option_a: [{ id: 1 }] });
    const campB = expiredCampaign({ id: 102, option_b: [{ id: 2 }, { id: 3 }] });

    strapi.db.query = jest.fn()
      .mockReturnValueOnce({
        findMany: jest.fn().mockResolvedValue([campA, campB]),
        findOne:  jest.fn().mockResolvedValue(campA),
      })
      .mockReturnValueOnce({
        findMany: jest.fn(),
        findOne:  jest.fn().mockResolvedValue(campA),
      })
      .mockReturnValueOnce({
        findMany: jest.fn(),
        findOne:  jest.fn().mockResolvedValue(campB),
      });

    const result = await svc().autoCloseExpiredPolls();
    expect(result.closed).toEqual(2);
  });

  it('continues processing remaining polls if one fails', async () => {
    const campA = expiredCampaign({ id: 101 });
    const campB = expiredCampaign({ id: 102, option_b: [{ id: 2 }] });

    let callCount = 0;
    strapi.db.query = jest.fn().mockImplementation(() => ({
      findMany: jest.fn().mockResolvedValue([campA, campB]),
      findOne: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('DB timeout');
        return Promise.resolve(campB);
      }),
    }));

    const result = await svc().autoCloseExpiredPolls();
    // campA threw, campB succeeded — still closed 1
    expect(result.closed).toEqual(1);
  });

});
