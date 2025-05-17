const testTask = require('./taskMock')
const recTaskMock = require('../mocks/recTaskMock')
const cronHelper = require('../../config/helpers/cron-helper')
const { addHours } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');

describe('cronHelper', function() {
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
    // Mock the database query
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
      },
      {
        id: 2,
        status: 'STARTED',
        complete_once: false,
        title: 'Water Task 2',
        type: 'Water',
        volunteers: [{
          id: 2,
          firstName: 'Jane',
          phoneNumber: '+1987654321'
        }],
        garden: { id: 1 }
      }
    ];

    // Mock strapi.db.query
    global.strapi = {
      db: {
        query: jest.fn().mockReturnValue({
          findMany: jest.fn().mockResolvedValue(mockStartedTasks)
        })
      },
      service: jest.fn().mockReturnValue({
        handleSms: jest.fn()
      })
    };

    // Mock sendingWindow to always return true for testing
    cronHelper.sendingWindow = jest.fn().mockReturnValue(true);

    await cronHelper.handleStartedTasks();

    // Verify that handleSms was only called once (for the task with complete_once: true)
    expect(strapi.service().handleSms).toHaveBeenCalledTimes(1);
    
    // Verify the correct task was processed
    const smsCall = strapi.service().handleSms.mock.calls[0][0];
    expect(smsCall.task.id).toBe(1);
    expect(smsCall.task.complete_once).toBe(true);
  });
});