const cronTasks = require('../../config/cron-tasks');
const { subDays } = require('date-fns');

const userQuery = () => strapi.db.query('plugin::users-permissions.user');
const gardenQuery = () => strapi.db.query('api::garden.garden');

const PREFIX = 'vacreminder';
let userCounter = 0;

const seedPausedUser = async ({ pausedDaysAgo, lastCheckDaysAgo, count, gardenIds }) => {
  userCounter++;
  const suffix = `${Date.now()}${userCounter}`;
  const user = await userQuery().create({
    data: {
      username: `${PREFIX}${suffix}`,
      email: `${PREFIX}${suffix}@strapi.com`,
      firstName: 'Vera',
      lastName: 'Vacationer',
      provider: 'local',
      phoneNumber: `+1303880${String(suffix).slice(-4)}`,
      paused: true,
      paused_at: subDays(new Date(), pausedDaysAgo),
      last_vacation_check_sent: lastCheckDaysAgo == null ? null : subDays(new Date(), lastCheckDaysAgo),
      vacation_reminder_count: count,
      gardens: gardenIds || []
    }
  });
  return user;
};

describe('sendVacationCheckIns (service)', () => {
  const createdUserIds = [];
  const createdGardenIds = [];

  const trackUser = (user) => {
    createdUserIds.push(user.id);
    return user;
  };

  const trackGarden = (garden) => {
    createdGardenIds.push(garden.id);
    return garden;
  };

  beforeEach(() => {
    strapi.service('api::sms.sms').sendSms = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (createdUserIds.length) {
      await userQuery().deleteMany({ where: { id: { $in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    if (createdGardenIds.length) {
      await gardenQuery().deleteMany({ where: { id: { $in: createdGardenIds } } });
      createdGardenIds.length = 0;
    }
  });

  it('AC1: sends to a user paused 15 days ago with no prior check-in', async () => {
    const user = trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    expect(strapi.service('api::sms.sms').sendSms).toHaveBeenCalledTimes(1);
    const row = await userQuery().findOne({
      where: { id: user.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });
    expect(row.vacation_reminder_count).toBe(1);
    expect(row.last_vacation_check_sent).not.toBeNull();
    const sentAt = new Date(row.last_vacation_check_sent).getTime();
    expect(Math.abs(Date.now() - sentAt)).toBeLessThan(10000);
  });

  it('AC1: addresses the reminder to the user\'s real phone number', async () => {
    const user = trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    const [phone] = strapi.service('api::sms.sms').sendSms.mock.calls[0];
    expect(phone).toBe(user.phoneNumber);
    expect(phone).toBeTruthy();
  });

  it('AC2: does not send to a user paused only 10 days ago', async () => {
    const user = trackUser(await seedPausedUser({ pausedDaysAgo: 10, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    expect(strapi.service('api::sms.sms').sendSms).not.toHaveBeenCalled();
    const row = await userQuery().findOne({
      where: { id: user.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });
    expect(row.vacation_reminder_count).toBe(0);
    expect(row.last_vacation_check_sent).toBeNull();
  });

  it('AC2: the cadence boundary is exclusive — 14 days paused sends nothing, 15 days sends', async () => {
    trackUser(await seedPausedUser({ pausedDaysAgo: 14, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();
    expect(strapi.service('api::sms.sms').sendSms).not.toHaveBeenCalled();

    trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();
    expect(strapi.service('api::sms.sms').sendSms).toHaveBeenCalledTimes(1);
  });

  it('AC3: does not send when last check-in was only 3 days ago', async () => {
    const user = trackUser(await seedPausedUser({ pausedDaysAgo: 20, lastCheckDaysAgo: 3, count: 1 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    expect(strapi.service('api::sms.sms').sendSms).not.toHaveBeenCalled();
    const row = await userQuery().findOne({
      where: { id: user.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });
    expect(row.vacation_reminder_count).toBe(1);
  });

  it('AC4: sends and increments count by exactly 1 when last check-in was 7 days ago', async () => {
    const user = trackUser(await seedPausedUser({ pausedDaysAgo: 20, lastCheckDaysAgo: 7, count: 1 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    expect(strapi.service('api::sms.sms').sendSms).toHaveBeenCalledTimes(1);
    const row = await userQuery().findOne({
      where: { id: user.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });
    expect(row.vacation_reminder_count).toBe(2);
  });

  it('AC5: body has no escalation sentence when prior count is 0', async () => {
    trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    const body = strapi.service('api::sms.sms').sendSms.mock.calls[0][1];
    expect(body).not.toContain('feigning vacation');
  });

  it('AC6: body has the exact escalation sentence when prior count is 1', async () => {
    trackUser(await seedPausedUser({ pausedDaysAgo: 20, lastCheckDaysAgo: 7, count: 1 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    const body = strapi.service('api::sms.sms').sendSms.mock.calls[0][1];
    expect(body).toContain('If you no longer want the responsibility of being in this task please let a Garden Manager know so you can be quickly removed, instead of feigning vacation :)');
  });

  it('AC7: body includes garden titles and firstName for a user with two gardens', async () => {
    const suffix = Date.now();
    const gardenA = trackGarden(await gardenQuery().create({
      data: { title: 'Alpha Garden', sms_slug: `${PREFIX}alpha${suffix}`, publishedAt: new Date() }
    }));
    const gardenB = trackGarden(await gardenQuery().create({
      data: { title: 'Beta Garden', sms_slug: `${PREFIX}beta${suffix}`, publishedAt: new Date() }
    }));

    const user = trackUser(await seedPausedUser({
      pausedDaysAgo: 15,
      lastCheckDaysAgo: null,
      count: 0,
      gardenIds: [gardenA.id, gardenB.id]
    }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    const body = strapi.service('api::sms.sms').sendSms.mock.calls[0][1];
    expect(body).toContain('Alpha Garden');
    expect(body).toContain('Beta Garden');
    expect(body).toContain(user.firstName);
  });

  it('AC8: idempotent — a second run in the same window does not send again', async () => {
    trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();
    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    expect(strapi.service('api::sms.sms').sendSms).toHaveBeenCalledTimes(1);
  });

  it('AC13: a failed send does not advance the counter/timestamp, the other user still gets sent', async () => {
    const userA = trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));
    const userB = trackUser(await seedPausedUser({ pausedDaysAgo: 15, lastCheckDaysAgo: null, count: 0 }));

    strapi.service('api::sms.sms').sendSms = jest.fn()
      .mockImplementationOnce(() => { throw new Error('twilio down'); })
      .mockResolvedValue(undefined);

    await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

    const rowA = await userQuery().findOne({
      where: { id: userA.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });
    const rowB = await userQuery().findOne({
      where: { id: userB.id },
      select: ['last_vacation_check_sent', 'vacation_reminder_count', 'paused']
    });

    const rows = [rowA, rowB];
    const unchanged = rows.filter(r => r.vacation_reminder_count === 0 && r.last_vacation_check_sent === null);
    const advanced = rows.filter(r => r.vacation_reminder_count === 1 && r.last_vacation_check_sent !== null);

    // exactly one user's send threw (unchanged) and the other advanced
    expect(unchanged.length).toBe(1);
    expect(advanced.length).toBe(1);
  });

  it('AC9: the cron delegates to the service and does not run inline logic', async () => {
    const svc = strapi.service('api::message.vacation-checkin');
    const spy = jest.spyOn(svc, 'sendVacationCheckIns').mockResolvedValue({});
    await cronTasks.weeklyVacationCheckIn.task({ strapi });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
