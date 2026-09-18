const weeklyScheduleHelper = require('../../src/api/weekly-schedule/services/helper');
const { patchService } = require('../helpers/patch');
const cronHelper = require('../../config/helpers/cron-helper');


describe('getAssignees', function() {
  // it('should create a create a weekly schedule', function() {
  //   const schedulersMock = require('./schedulersMock.js');
  //   weeklyScheduleHelper.createWeeklySchedule({id:1, ...schedulersMock}).then(res=>{
  //     console.log("schedule: ", res);
  //   });
  // });
  it('should create a get assignees where paused is false', function() {

    const schedulersMock = require('./schedulersMock.js');
    
    patchService('api::weekly-schedule.weekly-schedule', 'getWeeklySchedule', jest.fn().mockReturnValue({
      createdAt: '2024-05-27T15:37:00.075Z',
      id: 207,
      Week: 'May 27th, 2024',
      updatedAt: '2024-05-27T15:37:00.075Z',
      publishedAt: null,
      assignees: [
        { id: 581, day: 'Monday', assignee: schedulersMock.schedulers[0].volunteer },
        { id: 582, day: 'Thursday', assignee: schedulersMock.schedulers[0].volunteer },
        { id: 583, day: 'Saturday', assignee: schedulersMock.schedulers[0].volunteer }
      ]
    }));
    weeklyScheduleHelper.getAssignees({id:1, ...schedulersMock}).then(res=>{
      // console.log("schedule: ", res);
      expect([3, 4]).toContain(res[0].assignee);
    });
  });
});

// Vacation must keep people off the recurring schedule itself, not just off the
// reminder texts — that is the whole point of pausing.
describe('getScheduledVolunteer respects vacation', function () {
  const today = new Date().toLocaleString('default', { weekday: 'long' });

  let realDbQuery;
  beforeAll(() => { realDbQuery = strapi.db.query.bind(strapi.db); });
  afterEach(() => { strapi.db.query = realDbQuery; });

  const mockSchedulers = (rows) => {
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue(rows),
      findOne: jest.fn().mockResolvedValue(null),
    });
  };

  const mockWeekly = (assignee) => {
    patchService('api::weekly-schedule.weekly-schedule', 'getWeeklySchedule', jest.fn().mockResolvedValue({
      id: 1,
      assignees: [{ id: 9, day: today, assignee }],
    }));
  };

  it('Daily Primary: assigns the primary when they are not on vacation', async () => {
    mockSchedulers([{ day: today, volunteer: { id: 1, firstName: 'Ana', paused: false }, backup_volunteers: [] }]);

    const result = await cronHelper.getScheduledVolunteer({ id: 1, scheduler_type: 'Daily Primary' });

    expect(result).toBeTruthy();
    expect(result.id).toBe(1);
  });

  it('Daily Primary: hands the day to an unpaused backup when the primary is on vacation', async () => {
    mockSchedulers([{
      day: today,
      volunteer: { id: 1, firstName: 'Ana', paused: true },
      backup_volunteers: [
        { id: 2, firstName: 'Bo', paused: true },
        { id: 3, firstName: 'Cy', paused: false },
      ],
    }]);

    const result = await cronHelper.getScheduledVolunteer({ id: 1, scheduler_type: 'Daily Primary' });

    expect(result).toBeTruthy();
    expect(result.id).toBe(3);
  });

  it('Daily Primary: leaves the day unassigned when primary and every backup are on vacation', async () => {
    mockSchedulers([{
      day: today,
      volunteer: { id: 1, firstName: 'Ana', paused: true },
      backup_volunteers: [{ id: 2, firstName: 'Bo', paused: true }],
    }]);

    const result = await cronHelper.getScheduledVolunteer({ id: 1, scheduler_type: 'Daily Primary' });

    expect(result).toBeFalsy();
  });

  it('Weekly Shuffle: skips an assignee who started vacation after the roster was drawn', async () => {
    mockWeekly({ id: 7, firstName: 'Dee', paused: true });

    const result = await cronHelper.getScheduledVolunteer({ id: 1, scheduler_type: 'Weekly Shuffle' });

    expect(result).toBeFalsy();
  });

  it('Weekly Shuffle: still assigns an active volunteer from the roster', async () => {
    mockWeekly({ id: 7, firstName: 'Dee', paused: false });

    const result = await cronHelper.getScheduledVolunteer({ id: 1, scheduler_type: 'Weekly Shuffle' });

    expect(result).toBeTruthy();
    expect(result.id).toBe(7);
  });
});


// The cron hands createWeeklySchedule the *published* recurring task row. The
// new (draft) schedule has to link to the draft recurring task, or the admin
// shows recurring_task as empty and publishing the schedule drops the link.
describe('weekly schedule recurring_task link', function () {
  const REC = 'api::recurring-task.recurring-task';
  const WS = 'api::weekly-schedule.weekly-schedule';
  let recDoc;
  let published;

  beforeAll(async () => {
    recDoc = await strapi.documents(REC).create({
      data: { title: 'Link Test Water', scheduler_type: 'Weekly Shuffle', type: 'Water' },
      status: 'published',
    });
    published = await strapi.db.query(REC).findOne({
      where: { documentId: recDoc.documentId, publishedAt: { $notNull: true } },
    });
  });

  afterAll(async () => {
    const schedules = await strapi.db.query(WS).findMany({
      where: { recurring_task: { documentId: recDoc.documentId } },
    });
    for (const documentId of new Set(schedules.map(s => s.documentId))) {
      await strapi.documents(WS).delete({ documentId });
    }
    await strapi.documents(REC).delete({ documentId: recDoc.documentId });
  });

  it('links the draft schedule to the draft recurring task and finds it by the published id', async () => {
    const created = await strapi.service(WS).createWeeklySchedule({ ...published, schedulers: [] });
    expect(created).toBeTruthy();

    const draft = await strapi.db.query(WS).findOne({
      where: { documentId: created.documentId, publishedAt: null },
      populate: ['recurring_task'],
    });
    expect(draft.recurring_task).toBeTruthy();
    expect(draft.recurring_task.documentId).toBe(recDoc.documentId);
    expect(draft.recurring_task.publishedAt).toBeNull();

    // Admin view of the draft: relation resolves draft -> draft.
    const viaDocs = await strapi.documents(WS).findOne({
      documentId: created.documentId,
      populate: ['recurring_task'],
    });
    expect(viaDocs.recurring_task?.documentId).toBe(recDoc.documentId);

    const found = await strapi.service(WS).getWeeklySchedule(published.id);
    expect(found?.documentId).toBe(created.documentId);
  });

  it('keeps the link when the schedule is published', async () => {
    const created = await strapi.service(WS).createWeeklySchedule({ ...published, schedulers: [] });
    await strapi.documents(WS).publish({ documentId: created.documentId });

    const pub = await strapi.documents(WS).findOne({
      documentId: created.documentId,
      status: 'published',
      populate: ['recurring_task'],
    });
    expect(pub.recurring_task?.documentId).toBe(recDoc.documentId);
  });
});
