/**
 * Unit tests for the mid-afternoon watering cutoff.
 *
 * Past WATER_CUTOFF_HOUR a garden shouldn't be watered today at all — the
 * leaves stay wet into the evening and mildew follows — so the reminder turns
 * into an offer of tomorrow morning (MORNING) or a SKIP, and a volunteer who
 * takes the morning hears nothing more until that morning.
 *
 * These run without booting Strapi: the helper is stubbed the same way
 * tests/tasks/crontest.js stubs it.
 */

const { zonedTimeToUtc, utcToZonedTime } = require('date-fns-tz');
const Helper = require('../config/helpers/cron-helper');
const Weather = require('../config/helpers/weather');

const PACIFIC_TZ = 'America/Los_Angeles';

/** A UTC instant for a given Pacific wall-clock time. */
const pacific = (isoLocal) => zonedTimeToUtc(isoLocal, PACIFIC_TZ);

const waterTask = (overrides = {}) => ({
  id: 65,
  title: 'Water the garden',
  type: 'Water',
  task_status: 'INITIALIZED',
  garden: { id: 1 },
  volunteers: [{ id: 1, firstName: 'Cameron', username: 'cameron', phoneNumber: '+13038833330' }],
  ...overrides
});

describe('pastWateringCutoff', () => {
  it('is false through the morning and early afternoon', () => {
    expect(Helper.pastWateringCutoff(pacific('2026-07-15 08:00:00'))).toBe(false);
    expect(Helper.pastWateringCutoff(pacific('2026-07-15 12:30:00'))).toBe(false);
    expect(Helper.pastWateringCutoff(pacific('2026-07-15 14:59:00'))).toBe(false);
  });

  it('is true from 3pm Pacific on', () => {
    expect(Helper.pastWateringCutoff(pacific('2026-07-15 15:00:00'))).toBe(true);
    expect(Helper.pastWateringCutoff(pacific('2026-07-15 18:45:00'))).toBe(true);
  });

  it('reads the clock in Pacific time, not the server\'s zone', () => {
    // 22:00 UTC is 3pm Pacific in July; the same UTC hour in January is 2pm.
    expect(Helper.pastWateringCutoff(new Date('2026-07-15T22:00:00Z'))).toBe(true);
    expect(Helper.pastWateringCutoff(new Date('2026-01-15T22:00:00Z'))).toBe(false);
  });
});

describe('nextWateringMorning', () => {
  it('lands on the next Pacific morning, before the first reminder run', () => {
    const morning = Helper.nextWateringMorning(pacific('2026-07-15 16:20:00'));
    const local = utcToZonedTime(morning, PACIFIC_TZ);

    expect(local.getDate()).toBe(16);
    expect(local.getHours()).toBe(Helper.WATER_MORNING_HOUR);
    // The reminder cron's first run of the day is 8am Pacific, so the hold has
    // to have expired by then or the volunteer waits until 10am to hear from us.
    expect(local.getHours()).toBeLessThan(8);
  });

  it('rolls over the end of the month', () => {
    const morning = Helper.nextWateringMorning(pacific('2026-07-31 17:00:00'));
    const local = utcToZonedTime(morning, PACIFIC_TZ);

    expect(local.getMonth()).toBe(7); // August
    expect(local.getDate()).toBe(1);
  });
});

describe('isDeferred', () => {
  const now = new Date('2026-07-15T23:00:00Z');

  it('is false for a task nobody has moved', () => {
    expect(Helper.isDeferred(waterTask(), now)).toBe(false);
  });

  it('is true while the morning they took is still ahead', () => {
    const task = waterTask({ deferred_until: pacific('2026-07-16 06:00:00').toISOString() });
    expect(Helper.isDeferred(task, now)).toBe(true);
  });

  it('is false once that morning has arrived', () => {
    const task = waterTask({ deferred_until: pacific('2026-07-15 06:00:00').toISOString() });
    expect(Helper.isDeferred(task, now)).toBe(false);
  });
});

describe('buildWaterBody', () => {
  it('asks about today before the cutoff', () => {
    const body = Helper.buildWaterBody(waterTask(), pacific('2026-07-15 08:00:00'));

    expect(body).toContain('it\'s your watering day');
    expect(body).not.toContain('MORNING');
  });

  it('offers the morning or a skip after the cutoff', () => {
    const body = Helper.buildWaterBody(waterTask(), pacific('2026-07-15 16:00:00'));

    expect(body).toContain('MORNING');
    expect(body).toContain('SKIP');
    expect(body).toContain('mildew');
    // The whole point: we are no longer asking them to water today.
    expect(body).not.toContain('water today');
  });

  it('greets the morning on a task that was moved to it', () => {
    const task = waterTask({ deferred_until: pacific('2026-07-15 06:00:00').toISOString() });
    const body = Helper.buildWaterBody(task, pacific('2026-07-15 08:00:00'));

    expect(body).toContain('Good morning');
    expect(body).toContain('this morning');
  });
});

describe('sendWaterSms', () => {
  let realStrapi;
  const realSendingWindow = Helper.sendingWindow;
  const realGetGardenWeather = Weather.getGardenWeather;
  const realPastWateringCutoff = Helper.pastWateringCutoff;
  let handleSms;

  beforeEach(() => {
    realStrapi = global.strapi;
    handleSms = jest.fn();
    global.strapi = { service: jest.fn().mockReturnValue({ handleSms }) };
    Helper.sendingWindow = jest.fn().mockReturnValue(true);
    Weather.getGardenWeather = jest.fn().mockResolvedValue({ water: true });
  });

  afterEach(() => {
    global.strapi = realStrapi;
    Helper.sendingWindow = realSendingWindow;
    Helper.pastWateringCutoff = realPastWateringCutoff;
    Weather.getGardenWeather = realGetGardenWeather;
  });

  it('says nothing to a volunteer who already took the morning', async () => {
    const task = waterTask({ deferred_until: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() });

    const result = await Helper.sendWaterSms(task);

    expect(handleSms).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(Weather.getGardenWeather).not.toHaveBeenCalled();
  });

  it('sends the reminder that fits the hour', async () => {
    const task = waterTask();
    Helper.pastWateringCutoff = jest.fn().mockReturnValue(true);

    await Helper.sendWaterSms(task);

    expect(handleSms).toHaveBeenCalledTimes(1);
    expect(handleSms.mock.calls[0][0].body).toContain('MORNING');
    expect(handleSms.mock.calls[0][0].type).toBe('question');
  });

  it('still calls off watering when it has rained, whatever the hour', async () => {
    Weather.getGardenWeather = jest.fn().mockResolvedValue({ water: false, reason: 'light rain on Tue Jul 14 2026' });
    global.strapi.db = { query: jest.fn().mockReturnValue({ update: jest.fn() }) };

    await Helper.sendWaterSms(waterTask());

    expect(handleSms).toHaveBeenCalledTimes(1);
    expect(handleSms.mock.calls[0][0].body).toContain('don\'t worry about watering today');
  });
});
