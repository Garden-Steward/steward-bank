/**
 * "MORNING" — a watering volunteer moving today's task to tomorrow morning.
 *
 * Runs against the booted Strapi in app.test.js so the service writes to a real
 * row: what matters is that the task is held (deferred_until) and is no longer
 * an in-progress task overnight.
 */

const { utcToZonedTime } = require('date-fns-tz');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { patchService } = require('../helpers/patch');

const PACIFIC_TZ = 'America/Los_Angeles';

const userMock = {
  id: 1,
  firstName: 'Cameron',
  lastName: 'Smith',
  email: 'cameron@smith.com',
  activeGarden: 1
};

const makeTask = (overrides = {}) => strapi.db.query('api::garden-task.garden-task').create({
  data: {
    title: 'Water the Garden',
    type: 'Water',
    task_status: 'STARTED',
    started_at: new Date(Date.now() - 6 * 60 * 60 * 1000),
    volunteers: [userMock.id],
    ...overrides
  }
});

/** Point validateQuestion at the task the volunteer is answering about. */
const askAbout = (task) => patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue({
  id: 1,
  body: 'Can you water tomorrow morning instead?',
  type: 'question',
  garden_task: task
}));

describe('deferWaterToMorning', function() {

  it('holds the task for tomorrow morning and stops chasing it today', async () => {
    const task = await makeTask();
    askAbout(task);

    const result = await strapi.service('api::garden-task.garden-task').deferWaterToMorning(userMock);

    expect(result.body).toContain('tomorrow morning');
    expect(result.type).toEqual('complete');

    const saved = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: task.id } });
    const heldUntil = utcToZonedTime(new Date(saved.deferred_until), PACIFIC_TZ);
    const tomorrow = utcToZonedTime(new Date(Date.now() + 24 * 60 * 60 * 1000), PACIFIC_TZ);

    expect(heldUntil.getDate()).toEqual(tomorrow.getDate());
    expect(heldUntil.getHours()).toBeLessThan(8);
    // Wound back off STARTED: nothing should chase it overnight, and it must not
    // be abandoned in the morning for having been started the day before.
    expect(saved.task_status).toEqual('INITIALIZED');
    expect(saved.started_at).toBeFalsy();
  });

  it('leaves a PENDING task pending — it is still waiting on its instruction', async () => {
    const task = await makeTask({ task_status: 'PENDING', started_at: null });
    askAbout(task);

    await strapi.service('api::garden-task.garden-task').deferWaterToMorning(userMock);

    const saved = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: task.id } });
    expect(saved.task_status).toEqual('PENDING');
    expect(saved.deferred_until).toBeTruthy();
  });

  it('is only for watering', async () => {
    const task = await makeTask({ title: 'Weed the beds', type: 'Weeding' });
    askAbout(task);

    const result = await strapi.service('api::garden-task.garden-task').deferWaterToMorning(userMock);

    expect(result.body).toContain('just for watering');

    const saved = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: task.id } });
    expect(saved.deferred_until).toBeFalsy();
  });

  it('says so plainly when there is nothing waiting on them', async () => {
    patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue(false));
    patchService('api::garden-task.garden-task', 'findTaskFromUser', jest.fn().mockResolvedValue(false));

    const result = await strapi.service('api::garden-task.garden-task').deferWaterToMorning(userMock);

    expect(result.body).toContain('nothing to move to the morning');
    expect(result.type).toEqual('reply');
  });
});

describe('simplifySms MORNING', function() {

  it('reads the ways a volunteer says tomorrow morning', () => {
    expect(SmsHelper.simplifySms('morning', false)).toEqual('morning');
    expect(SmsHelper.simplifySms('morning!', false)).toEqual('morning');
    expect(SmsHelper.simplifySms('tomorrow morning', false)).toEqual('morning');
    expect(SmsHelper.simplifySms('tomorrow', false)).toEqual('morning');
    expect(SmsHelper.simplifySms('tomorrow am', false)).toEqual('morning');
  });

  it('leaves a greeting alone', () => {
    expect(SmsHelper.simplifySms('good morning', false)).toEqual('good morning');
    expect(SmsHelper.simplifySms('morning is no good for me', false)).toEqual('morning is no good for me');
  });
});
