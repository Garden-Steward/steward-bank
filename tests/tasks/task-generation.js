/**
 * The daily cron that generates each day's task from a recurring task.
 *
 * Two ways it stopped producing anything, both live since the Strapi v5
 * upgrade:
 *
 * 1. v5 keeps a draft row and a published row per recurring task. The cron
 *    iterates the published row; a schedule attached in the admin lands on the
 *    draft. Matching schedulers by the row id in hand found no schedule, so the
 *    day's task was generated with nobody on it.
 * 2. A task with no volunteers is invisible to every reminder cron (they all
 *    filter on volunteers), so nothing ever moves it out of INITIALIZED — and
 *    while it sits there, every later day is skipped as "already have one".
 *
 * Together: one empty task and the garden goes months without another.
 */

const { addDays } = require('date-fns');
const Helper = require('../../config/helpers/cron-helper');

const ROWS = 'api::recurring-task.recurring-task';

let volunteer;
let garden;

/** A recurring task as the admin leaves it: a draft row and a published row. */
const makeRecurringTask = async (overrides = {}) => {
  const doc = await strapi.documents(ROWS).create({
    data: {
      title: 'Water the Garden',
      type: 'Water',
      scheduler_type: 'Daily Primary',
      garden: garden.documentId,
      ...overrides
    },
    status: 'published'
  });
  const rows = await strapi.db.query(ROWS).findMany({ where: { documentId: doc.documentId } });
  return {
    draft: rows.find(r => !r.publishedAt),
    published: rows.find(r => r.publishedAt)
  };
};

/** The row the cron actually iterates, populated the way the cron populates it. */
const asCronSeesIt = async (documentId) => {
  const all = await strapi.service('api::recurring-task.recurring-task').getRecurringTaskGarden();
  return all.find(r => r.documentId === documentId);
};

const runDay = async (recTask) => {
  const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
  const scheduledUser = await Helper.getScheduledVolunteer(recTask);
  return Helper.buildSchedulerTask(curTask, recTask, scheduledUser);
};

const tasksFor = (recTaskIds) => strapi.db.query('api::garden-task.garden-task').findMany({
  where: { recurring_task: { id: { $in: recTaskIds } } },
  populate: ['volunteers']
});

describe('daily task generation', function() {

  beforeEach(async () => {
    await strapi.db.query('api::garden-task.garden-task').deleteMany({});
    await strapi.db.query('api::scheduler.scheduler').deleteMany({});

    volunteer = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { phoneNumber: '+15558889999' } });
    if (!volunteer) {
      volunteer = await strapi.db.query('plugin::users-permissions.user').create({
        data: { username: 'generator', email: 'generator@garden.com', provider: 'local', phoneNumber: '+15558889999', firstName: 'Sam' }
      });
    }
    garden = await strapi.documents('api::garden.garden').create({
      data: { title: `Gen Garden ${Date.now()}`, slug: `gen-garden-${Date.now()}`, sms_slug: `gen${Date.now()}` },
      status: 'published'
    });
  });

  it('finds the volunteer when the schedule is attached to the document\'s other row', async () => {
    const { draft, published } = await makeRecurringTask();
    const today = new Date().toLocaleString('default', { weekday: 'long' });
    // The admin edits the draft, so this is where the relation lands...
    await strapi.db.query('api::scheduler.scheduler').create({
      data: { day: today, volunteer: volunteer.id, recurring_task: draft.id }
    });

    // ...while the cron iterates the published row.
    const recTask = await asCronSeesIt(draft.documentId);
    expect(recTask.id).toEqual(published.id);

    const scheduled = await Helper.getScheduledVolunteer(recTask);
    expect(scheduled?.id).toEqual(volunteer.id);

    await runDay(recTask);
    const [task] = await tasksFor([draft.id, published.id]);
    expect(task.volunteers).toHaveLength(1);
  });

  it('retires a task nobody ever took instead of blocking every later day', async () => {
    const { draft, published } = await makeRecurringTask();
    // Nobody is scheduled today, so the task is generated empty — as it was
    // every day this went unnoticed.
    const stuck = await strapi.db.query('api::garden-task.garden-task').create({
      data: { title: 'Water the Garden', type: 'Water', task_status: 'INITIALIZED', recurring_task: published.id, garden: garden.id }
    });
    await strapi.db.connection('garden_tasks').where({ id: stuck.id })
      .update({ created_at: addDays(new Date(), -80), updated_at: addDays(new Date(), -80) });

    const recTask = await asCronSeesIt(draft.documentId);
    const result = await runDay(recTask);

    expect(result.message).toContain('Created Task');
    expect((await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: stuck.id } })).task_status).toEqual('SKIPPED');
    expect(await tasksFor([draft.id, published.id])).toHaveLength(2);
  });

  it('does not generate a second task on the same day', async () => {
    const { draft, published } = await makeRecurringTask();
    const today = new Date().toLocaleString('default', { weekday: 'long' });
    await strapi.db.query('api::scheduler.scheduler').create({
      data: { day: today, volunteer: volunteer.id, recurring_task: draft.id }
    });

    const recTask = await asCronSeesIt(draft.documentId);
    await runDay(recTask);
    await runDay(recTask);

    expect(await tasksFor([draft.id, published.id])).toHaveLength(1);
  });

  it('leaves an unclaimed task on an unscheduled recurring task alone — that is the open pool', async () => {
    const { draft, published } = await makeRecurringTask({ scheduler_type: 'No Schedule' });
    const pooled = await strapi.db.query('api::garden-task.garden-task').create({
      data: { title: 'Weed the beds', type: 'Weeding', task_status: 'INITIALIZED', recurring_task: published.id, garden: garden.id }
    });
    await strapi.db.connection('garden_tasks').where({ id: pooled.id })
      .update({ created_at: addDays(new Date(), -30), updated_at: addDays(new Date(), -30) });

    const recTask = await asCronSeesIt(draft.documentId);
    await runDay(recTask);

    expect((await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: pooled.id } })).task_status).toEqual('INITIALIZED');
    expect(await tasksFor([draft.id, published.id])).toHaveLength(1);
  });

  it('draws a weekly roster from the schedulers on either row', async () => {
    const { draft, published } = await makeRecurringTask({ scheduler_type: 'Weekly Shuffle' });
    await strapi.db.query('api::scheduler.scheduler').create({
      data: { day: 'Tuesday', volunteer: volunteer.id, backup_volunteers: [volunteer.id], recurring_task: draft.id }
    });

    const recTask = await asCronSeesIt(draft.documentId);
    expect(recTask.id).toEqual(published.id);

    const schedulers = await Helper.getRecurringTaskSchedulers(recTask);
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0].day).toEqual('Tuesday');
  });
});
