const testTask = require('./taskMock')
const recTaskMock = require('../mocks/recTaskMock')
const cronHelper = require('../../config/helpers/cron-helper')
const { addHours } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');

describe('cronHelper', function() {
  // One test below swaps global.strapi for a stub. Every behavioural module is
  // required into the same app.test.js file, so without this restore the stub
  // leaks into every suite that runs after this one.
  let realStrapi;
  const realSendingWindow = cronHelper.sendingWindow;

  beforeEach(() => { realStrapi = global.strapi; });

  afterEach(() => {
    global.strapi = realStrapi;
    cronHelper.sendingWindow = realSendingWindow;
  });

  it('should send within sending window', function() {
    const task = testTask;
    const today = new Date();
    today.setHours(18, 0, 0, 0); // Set today to 6pm
    const threeHoursAgo = addHours(today, -3);
    task.started_at = threeHoursAgo.toISOString();
    const pacificTime = utcToZonedTime(new Date(), 'America/Los_Angeles');
    let hour = pacificTime.getHours();
    const currentWindow = (hour < 8 || hour > 19) ? false : true;
    
    const result = cronHelper.sendingWindow(task)
    expect(result).toEqual(currentWindow);
  });

  it ('should create a task for a scheduler', async () => {
    const recTask = recTaskMock
    const scheduledUser = {
      id: 1,
      phone: "+1234567890"
    }
    const result = await cronHelper.buildSchedulerTask(testTask, recTask, scheduledUser);
    expect(result.message).toContain('Added volunteer');
  });

  it('should only send SMS for tasks with complete_once not false', async () => {
    // complete_once is filtered in the DB query, not in JS, so the rows the
    // helper iterates are already narrowed. Assert on the filter it asks for,
    // and that the row it gets back is messaged.
    const mockStartedTasks = [
      {
        id: 1,
        status: 'STARTED',
        complete_once: true,
        title: 'Water Task 1',
        type: 'Water',
        volunteers: [{
          id: 1,
          firstName: 'John',
          phoneNumber: '+1234567890'
        }],
        garden: { id: 1 }
      }
    ];

    const findMany = jest.fn().mockResolvedValue(mockStartedTasks);
    const handleSms = jest.fn();

    // Mock strapi.db.query
    global.strapi = {
      db: {
        query: jest.fn().mockReturnValue({ findMany })
      },
      service: jest.fn().mockReturnValue({ handleSms })
    };

    // Mock sendingWindow to always return true for testing
    cronHelper.sendingWindow = jest.fn().mockReturnValue(true);

    await cronHelper.handleStartedTasks();

    // Tasks with complete_once: false must be excluded by the query itself
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ complete_once: { $ne: false } })
      })
    );

    // Verify that handleSms was called for the task the query returned
    expect(handleSms).toHaveBeenCalledTimes(1);

    // Verify the correct task was processed
    const smsCall = handleSms.mock.calls[0][0];
    expect(smsCall.task.id).toBe(1);
    expect(smsCall.task.complete_once).toBe(true);
  });
});