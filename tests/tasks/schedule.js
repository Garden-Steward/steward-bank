const weeklyScheduleHelper = require('../../src/api/weekly-schedule/services/helper');
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
    
    strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule = jest.fn().mockReturnValue({
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
    });
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
    strapi.db.query = jest.fn().mockReturnValue({
      findMany: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        assignees: [{ id: 9, day: today, assignee }],
      }),
    });
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

