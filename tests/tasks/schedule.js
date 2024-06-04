const weeklyScheduleHelper = require('../../src/api/weekly-schedule/services/helper');


describe('getAssignees', function() {
  it('should create a create a weekly schedule', function() {
    const schedulersMock = require('./schedulersMock.js');
    weeklyScheduleHelper.createWeeklySchedule({id:1, ...schedulersMock}).then(res=>{
      console.log("schedule: ", res);
    });
  });
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

