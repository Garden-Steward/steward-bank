const testTask = require('./taskMock')
const cronHelper = require('../../config/helpers/cron-helper')
const { addHours } = require('date-fns');

describe('cronHelper', function() {
  it('should send within sending window', function() {
    const task = testTask;
    const today = new Date();
    const threeHoursAgo = addHours(today, -3);
    task.started_at = threeHoursAgo.toISOString();

    const result = cronHelper.sendingWindow(task)
    console.log("result: ", result)
    expect(result).toEqual(true);
  });
});