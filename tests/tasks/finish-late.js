/**
 * DONE, the following day.
 *
 * The cron abandons an open task 24 hours after its last activity, without a
 * word to anyone. A volunteer told in the evening to "let me know you're
 * FINISHED", who waters the next morning and texts DONE, was being answered
 * with "We found nothing to finish!" — the reminder and the lookup disagreed
 * about whether the task still existed.
 */

const { addHours, addDays } = require('date-fns');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');

const PHONE = '+15550001111';

let volunteer;

const makeTask = (overrides = {}) => strapi.db.query('api::garden-task.garden-task').create({
  data: {
    title: 'Water the Garden',
    type: 'Water',
    task_status: 'STARTED',
    started_at: addHours(new Date(), -26),
    volunteers: [volunteer.id],
    ...overrides
  }
});

const reload = (task) => strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: task.id } });

describe('finishTask the day after', function() {

  beforeEach(async () => {
    volunteer = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { phoneNumber: PHONE } });
    if (!volunteer) {
      volunteer = await strapi.db.query('plugin::users-permissions.user').create({
        data: {
          username: 'late-finisher',
          email: 'late@finisher.com',
          provider: 'local',
          phoneNumber: PHONE,
          firstName: 'Robin'
        }
      });
    }
    // Each case owns the volunteer's board.
    await strapi.db.query('api::garden-task.garden-task').deleteMany({ where: { volunteers: volunteer.id } });
  });

  it('finishes a task the cron abandoned yesterday', async () => {
    const task = await makeTask({ task_status: 'ABANDONED', complete_once: true });

    const result = await SmsHelper.finishTask(volunteer);

    expect(result.type).toEqual('complete');
    expect(result.body).not.toContain('nothing to finish');
    expect((await reload(task)).task_status).toEqual('FINISHED');
  });

  it('publishes a revived task that never got published', async () => {
    const task = await makeTask({ task_status: 'ABANDONED', complete_once: true, publishedAt: null });

    await SmsHelper.finishTask(volunteer);

    expect((await reload(task)).publishedAt).toBeTruthy();
  });

  it('finishes a task whose complete_once was never set', async () => {
    // Rows predating the column: SQL drops nulls from both `= true` and
    // `!= false`, so these used to fall through every branch of the lookup.
    const task = await makeTask({ task_status: 'STARTED', complete_once: null });

    const result = await SmsHelper.finishTask(volunteer);

    expect(result.body).not.toContain('nothing to finish');
    expect((await reload(task)).task_status).toEqual('FINISHED');
  });

  it('still prefers an open task over an abandoned one', async () => {
    const abandoned = await makeTask({ title: 'Last week\'s water', task_status: 'ABANDONED', complete_once: true });
    const open = await makeTask({ title: 'Today\'s water', task_status: 'STARTED', complete_once: true });

    await SmsHelper.finishTask(volunteer);

    expect((await reload(open)).task_status).toEqual('FINISHED');
    expect((await reload(abandoned)).task_status).toEqual('ABANDONED');
  });

  it('leaves a long-abandoned task alone — that DONE is about something else', async () => {
    const task = await makeTask({ task_status: 'ABANDONED', complete_once: true });
    // Push it outside the two-day window the way time would.
    await strapi.db.connection('garden_tasks')
      .where({ id: task.id })
      .update({ updated_at: addDays(new Date(), -5) });

    const result = await SmsHelper.finishTask(volunteer);

    expect(result.body).toContain('nothing to finish');
    expect((await reload(task)).task_status).toEqual('ABANDONED');
  });
});
