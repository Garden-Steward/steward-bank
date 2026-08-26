const Helper = require('../../config/helpers/cron-helper');

/**
 * Regression tests for images going missing on generated garden tasks.
 *
 * Two separate causes, both visible as nulls in the tasks REST response:
 *
 * 1. buildSchedulerTask never copied primary_image off the recurring task, so
 *    no generated task has ever had an image of its own.
 * 2. Strapi v5 draft & publish stores every entry as two rows sharing one
 *    documentId. The cron reads recurring tasks off the query engine, so it saw
 *    both rows: it built a task per row, and the one built from the draft row
 *    linked draft rows the REST API cannot resolve - it comes back with a null
 *    recurring_task, garden and instruction.
 */

const GARDEN_DOC = 'taskimagegardendoc0000001';
const RECTASK_DOC = 'taskimagerectaskdoc000001';
const INSTRUCTION_DOC = 'taskimageinstrdoc00000001';

describe('garden task images (Strapi v5 draft/published split)', function () {
  let publishedGarden;
  let draftGarden;
  let publishedRecTask;
  let draftRecTask;
  let publishedInstruction;
  let draftInstruction;
  let image;

  const cronRowsForDoc = async () => {
    const rows = await strapi.service('api::recurring-task.recurring-task').getRecurringTaskGarden();
    return rows.filter(r => r.documentId === RECTASK_DOC);
  };

  const tasksForDoc = async () => strapi.db.query('api::garden-task.garden-task').findMany({
    where: { title: 'Trim the Passionflower' },
    populate: ['primary_image', 'recurring_task', 'garden', 'instruction'],
  });

  const clearTasks = async () => {
    for (const task of await tasksForDoc()) {
      await strapi.db.query('api::garden-task.garden-task').delete({ where: { id: task.id } });
    }
  };

  beforeAll(async function () {
    const now = new Date().toISOString();

    // The shape a v4 entry takes after the v5 migration: the original row
    // becomes the published version, with a draft clone alongside it.
    publishedGarden = await strapi.db.query('api::garden.garden').create({
      data: { documentId: GARDEN_DOC, title: 'Task Image Garden', sms_slug: 'task-image-garden', publishedAt: now },
    });
    draftGarden = await strapi.db.query('api::garden.garden').create({
      data: { documentId: GARDEN_DOC, title: 'Task Image Garden', sms_slug: 'task-image-garden', publishedAt: null },
    });

    publishedInstruction = await strapi.db.query('api::instruction.instruction').create({
      data: { documentId: INSTRUCTION_DOC, title: 'Passionflower care', slug: 'passionflower-care', publishedAt: now },
    });
    draftInstruction = await strapi.db.query('api::instruction.instruction').create({
      data: { documentId: INSTRUCTION_DOC, title: 'Passionflower care', slug: 'passionflower-care', publishedAt: null },
    });

    image = await strapi.db.query('plugin::upload.file').create({
      data: {
        name: 'passionflower.jpg',
        hash: 'passionflower_task_image_test',
        ext: '.jpg',
        mime: 'image/jpeg',
        size: 12.3,
        provider: 'local',
        url: 'https://storage.googleapis.com/steward_upload/uploads/passionflower.jpg',
      },
    });

    const recTaskData = {
      documentId: RECTASK_DOC,
      title: 'Trim the Passionflower',
      overview: 'Walk through the passionflower and see where it is climbing.',
      type: 'Weeding',
      scheduler_type: 'No Schedule',
      primary_image: image.id,
    };

    publishedRecTask = await strapi.db.query('api::recurring-task.recurring-task').create({
      data: { ...recTaskData, garden: publishedGarden.id, instruction: publishedInstruction.id, publishedAt: now },
    });
    draftRecTask = await strapi.db.query('api::recurring-task.recurring-task').create({
      data: { ...recTaskData, garden: draftGarden.id, instruction: draftInstruction.id, publishedAt: null },
    });
  });

  afterAll(async function () {
    await clearTasks();
  });

  beforeEach(async function () {
    await clearTasks();
  });

  it('walks one row per recurring task document, the published one', async function () {
    const rows = await cronRowsForDoc();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(publishedRecTask.id);
    expect(rows[0].publishedAt).toBeTruthy();
    expect(rows[0].primary_image?.id).toBe(image.id);
  });

  it('gives a generated task the recurring task image', async function () {
    const [recTask] = await cronRowsForDoc();
    const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);

    await Helper.buildSchedulerTask(curTask, recTask, null);

    const tasks = await tasksForDoc();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].primary_image?.id).toBe(image.id);
  });

  it('links the generated task to rows the REST API can resolve', async function () {
    const [recTask] = await cronRowsForDoc();
    const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
    await Helper.buildSchedulerTask(curTask, recTask, null);

    const [task] = await tasksForDoc();
    expect(task.recurring_task.id).toBe(publishedRecTask.id);
    expect(task.garden.id).toBe(publishedGarden.id);
    expect(task.instruction.id).toBe(publishedInstruction.id);

    // The published document read is what the front-end gets back.
    const seen = await strapi.documents('api::garden-task.garden-task').findOne({
      documentId: task.documentId,
      status: 'published',
      populate: ['primary_image', 'recurring_task', 'garden', 'instruction'],
    });
    expect(seen.primary_image?.url).toContain('passionflower.jpg');
    expect(seen.recurring_task).toBeTruthy();
    expect(seen.garden).toBeTruthy();
  });

  it('reuses a task generated against the draft rows instead of adding a second one', async function () {
    // What the cron left behind before the fix: a task hung off the draft rows.
    await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'Trim the Passionflower',
        status: 'INITIALIZED',
        type: 'Weeding',
        recurring_task: draftRecTask.id,
        garden: draftGarden.id,
        instruction: draftInstruction.id,
      },
    });

    const [recTask] = await cronRowsForDoc();
    const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
    expect(curTask).toBeTruthy();

    await Helper.buildSchedulerTask(curTask, recTask, null);

    expect(await tasksForDoc()).toHaveLength(1);
  });

  it('repairs an open task that was generated without an image', async function () {
    const legacy = await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'Trim the Passionflower',
        status: 'INITIALIZED',
        type: 'Weeding',
        recurring_task: draftRecTask.id,
        garden: draftGarden.id,
        instruction: draftInstruction.id,
      },
    });

    const [recTask] = await cronRowsForDoc();
    const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
    await Helper.buildSchedulerTask(curTask, recTask, null);

    const repaired = await strapi.db.query('api::garden-task.garden-task').findOne({
      where: { id: legacy.id },
      populate: ['primary_image', 'recurring_task', 'garden', 'instruction'],
    });
    expect(repaired.primary_image?.id).toBe(image.id);
    expect(repaired.recurring_task.id).toBe(publishedRecTask.id);
    expect(repaired.garden.id).toBe(publishedGarden.id);
    expect(repaired.instruction.id).toBe(publishedInstruction.id);
  });

  it('leaves an image a manager set on the task alone', async function () {
    const ownImage = await strapi.db.query('plugin::upload.file').create({
      data: {
        name: 'today.jpg',
        hash: 'today_task_image_test',
        ext: '.jpg',
        mime: 'image/jpeg',
        size: 4.2,
        provider: 'local',
        url: 'https://storage.googleapis.com/steward_upload/uploads/today.jpg',
      },
    });

    const task = await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'Trim the Passionflower',
        status: 'INITIALIZED',
        type: 'Weeding',
        recurring_task: publishedRecTask.id,
        garden: publishedGarden.id,
        primary_image: ownImage.id,
      },
    });

    const [recTask] = await cronRowsForDoc();
    const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
    await Helper.buildSchedulerTask(curTask, recTask, null);

    const after = await strapi.db.query('api::garden-task.garden-task').findOne({
      where: { id: task.id },
      populate: ['primary_image'],
    });
    expect(after.primary_image.id).toBe(ownImage.id);
  });
});
