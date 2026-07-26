'use strict';

const RequestClient = require('twilio/lib/base/RequestClient');
// installed twilio is v3.84.1; this path + prototype.request are stable there

const PREFIX = `smsvac${Date.now()}`;
let seq = 0;
const nextSuffix = () => `${PREFIX}-${seq++}`;

// Earlier modules in app.test.js swap strapi.db.query for a mock and do not always
// put it back, so reading it at call time can hand us their stub. Bind the real one
// once, in a root-level hook that runs before any test does.
let realDbQuery;
beforeAll(() => { realDbQuery = strapi.db.query.bind(strapi.db); });

const userQuery = () => realDbQuery('plugin::users-permissions.user');
const gardenQuery = () => realDbQuery('api::garden.garden');
const campaignQuery = () => realDbQuery('api::sms-campaign.sms-campaign');
const interestQuery = () => realDbQuery('api::interest.interest');
const ugiQuery = () => realDbQuery('api::user-garden-interest.user-garden-interest');

const createdUserIds = [];
const createdGardenIds = [];
const createdCampaignIds = [];
const createdInterestIds = [];
const createdUgiIds = [];

const createUser = async (overrides = {}) => {
  const suffix = nextSuffix();
  const user = await userQuery().create({
    data: {
      username: `smsvac-user-${suffix}`,
      email: `smsvac-user-${suffix}@strapi.com`,
      firstName: overrides.firstName || 'Vac',
      lastName: 'Tester',
      provider: 'local',
      password: 'testpass123',
      confirmed: true,
      phoneNumber: `+1303555${String(seq).padStart(4, '0')}`,
      paused: false,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const createGarden = async (overrides = {}) => {
  const suffix = nextSuffix();
  const garden = await gardenQuery().create({
    data: {
      title: `SMS Vac Garden ${suffix}`,
      sms_slug: `smsvac-slug-${suffix}`,
      publishedAt: new Date(),
      ...overrides,
    },
  });
  createdGardenIds.push(garden.id);
  return garden;
};

// Stub Twilio at the transport layer: sendGroupMsg builds its client at module load,
// so there is no injectable seam, and a real request would fail and trigger
// unsubscribeUser. Scoped per describe so the rest of the suite is untouched.
let twilioSpy;
const stubTwilio = () => {
  beforeEach(() => {
    twilioSpy = jest.spyOn(RequestClient.prototype, 'request')
      .mockResolvedValue({ statusCode: 201, body: { sid: 'SMtest123', status: 'queued' } });
  });
  afterEach(() => { if (twilioSpy) twilioSpy.mockRestore(); });
};

afterAll(async () => {
  // app.test.js registers its cleanupStrapi afterAll before this module is required,
  // so Strapi may already be torn down by the time we get here.
  if (typeof strapi === 'undefined' || !strapi.db) return;
  if (createdCampaignIds.length) {
    await campaignQuery().deleteMany({ where: { id: { $in: createdCampaignIds } } });
  }
  if (createdUgiIds.length) {
    await ugiQuery().deleteMany({ where: { id: { $in: createdUgiIds } } });
  }
  if (createdInterestIds.length) {
    await interestQuery().deleteMany({ where: { id: { $in: createdInterestIds } } });
  }
  if (createdGardenIds.length) {
    await gardenQuery().deleteMany({ where: { id: { $in: createdGardenIds } } });
  }
  if (createdUserIds.length) {
    await userQuery().deleteMany({ where: { id: { $in: createdUserIds } } });
  }
});

describe('sms-campaign vacation exclusion: sendGroupMsg', () => {
  stubTwilio();
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');

  it('AC14/AC15: excludes a paused user from the send and the persisted sent relation', async () => {
    const pausedUser = await createUser({ paused: true, firstName: 'Paula' });
    const activeUser = await createUser({ paused: false, firstName: 'Alan' });
    const garden = await createGarden();
    const copy = `Test copy AC14-15 ${nextSuffix()}`;

    const sentInfo = await svc().sendGroupMsg(
      [pausedUser, activeUser],
      copy,
      garden,
      { type: 'alert', sender: activeUser.id, alert: false }
    );

    expect(sentInfo).toEqual([activeUser.phoneNumber]);
    expect(twilioSpy).toHaveBeenCalledTimes(1);

    const campaign = await campaignQuery().findOne({
      where: { body: copy, garden: garden.id },
      orderBy: { id: 'desc' },
      populate: { sent: true },
    });
    createdCampaignIds.push(campaign.id);
    expect(campaign.sent.map(u => u.id)).toEqual([activeUser.id]);
  });

  it('AC16: an all-paused group sends nothing and persists an empty sent relation', async () => {
    const pausedA = await createUser({ paused: true, firstName: 'PausedA' });
    const pausedB = await createUser({ paused: true, firstName: 'PausedB' });
    const garden = await createGarden();
    const copy = `Test copy AC16 ${nextSuffix()}`;

    const sentInfo = await svc().sendGroupMsg(
      [pausedA, pausedB],
      copy,
      garden,
      { type: 'alert', sender: pausedA.id, alert: false }
    );

    expect(sentInfo).toEqual([]);
    expect(twilioSpy).not.toHaveBeenCalled();

    const campaign = await campaignQuery().findOne({
      where: { body: copy, garden: garden.id },
      orderBy: { id: 'desc' },
      populate: { sent: true },
    });
    createdCampaignIds.push(campaign.id);
    expect(campaign.sent.length).toBe(0);
  });

  it('AC17: excludes a paused volunteer via the "Everyone" getUsersOfInterest branch', async () => {
    const pausedUser = await createUser({ paused: true, firstName: 'PauseEveryone' });
    const activeUser = await createUser({ paused: false, firstName: 'ActiveEveryone' });
    const garden = await createGarden({ volunteers: [pausedUser.id, activeUser.id] });

    const gardenWithVolunteers = await gardenQuery().findOne({
      where: { id: garden.id },
      populate: ['volunteers'],
    });

    const vg = await strapi.service('api::user-garden-interest.user-garden-interest')
      .getUsersOfInterest(gardenWithVolunteers, 'Everyone');

    const copy = `Test copy AC17-everyone ${nextSuffix()}`;
    const sentInfo = await svc().sendGroupMsg(vg, copy, garden, { type: 'alert', sender: activeUser.id, alert: false });

    expect(sentInfo).toEqual([activeUser.phoneNumber]);

    const campaign = await campaignQuery().findOne({
      where: { body: copy, garden: garden.id },
      orderBy: { id: 'desc' },
      populate: { sent: true },
    });
    createdCampaignIds.push(campaign.id);
    expect(campaign.sent.map(u => u.id)).toEqual([activeUser.id]);
  });

  it('AC17: excludes a paused volunteer via the tagged-interest getUsersOfInterest branch', async () => {
    const pausedUser = await createUser({ paused: true, firstName: 'PauseWeeding' });
    const activeUser = await createUser({ paused: false, firstName: 'ActiveWeeding' });
    const garden = await createGarden();

    const interest = await interestQuery().create({ data: { tag: 'Weeding', publishedAt: new Date() } });
    createdInterestIds.push(interest.id);

    const ugi1 = await ugiQuery().create({
      data: { user: pausedUser.id, garden: garden.id, interest: interest.id, publishedAt: new Date() },
    });
    const ugi2 = await ugiQuery().create({
      data: { user: activeUser.id, garden: garden.id, interest: interest.id, publishedAt: new Date() },
    });
    createdUgiIds.push(ugi1.id, ugi2.id);

    const vg = await strapi.service('api::user-garden-interest.user-garden-interest')
      .getUsersOfInterest(garden, 'Weeding');

    const copy = `Test copy AC17-weeding ${nextSuffix()}`;
    const sentInfo = await svc().sendGroupMsg(vg, copy, garden, { type: 'alert', sender: activeUser.id, alert: false });

    expect(sentInfo).toEqual([activeUser.phoneNumber]);

    const campaign = await campaignQuery().findOne({
      where: { body: copy, garden: garden.id },
      orderBy: { id: 'desc' },
      populate: { sent: true },
    });
    createdCampaignIds.push(campaign.id);
    expect(campaign.sent.map(u => u.id)).toEqual([activeUser.id]);
  });
});

describe('sms-campaign vacation exclusion: sendPollReminders', () => {
  stubTwilio();
  let originalHandleSms;

  beforeEach(() => {
    originalHandleSms = strapi.service('api::sms.sms').handleSms;
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    strapi.service('api::sms.sms').handleSms = originalHandleSms;
  });

  it('AC18/AC19: skips a paused non-voter but still reminds the active non-voter', async () => {
    const pausedNonVoter = await createUser({ paused: true, firstName: 'PausedNonVoter' });
    const activeNonVoter = await createUser({ paused: false, firstName: 'ActiveNonVoter' });
    const voter = await createUser({ paused: false, firstName: 'Voter' });
    const garden = await createGarden();

    const campaign = await campaignQuery().create({
      data: {
        publishedAt: null,
        type: 'poll',
        send_reminder: true,
        reminder_sent: null,
        closes_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        garden: garden.id,
        body: `Test poll body ${nextSuffix()}`,
        sent: [pausedNonVoter.id, activeNonVoter.id, voter.id],
        option_a: [voter.id],
      },
    });
    createdCampaignIds.push(campaign.id);

    await strapi.service('api::sms-campaign.sms-campaign').sendPollReminders();

    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalledTimes(1);
    expect(strapi.service('api::sms.sms').handleSms.mock.calls[0][0].user.id).toBe(activeNonVoter.id);

    const updatedCampaign = await campaignQuery().findOne({ where: { id: campaign.id } });
    expect(updatedCampaign.reminder_sent).toBe(true);
  });
});
