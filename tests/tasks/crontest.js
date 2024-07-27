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
});