const testTask = require('./taskMock')
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
    const currentWindow = hour > 19 ? true : false;
    
    const result = cronHelper.sendingWindow(task)
    // console.log("currentWindow: ", currentWindow, hour, result)
    // console.log("result: ", result)
    expect(result).toEqual(currentWindow);
  });
});