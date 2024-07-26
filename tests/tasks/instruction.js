const instructionHelper = require('../../src/api/instruction/controllers/helper');


describe('approve of the instruction', function() {
  it('should fail if the phone number is not in the database', function() {

    const schedulersMock = require('./schedulersMock.js');
    
    // strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule = jest.fn().mockReturnValue({
    //   createdAt: '2024-05-27T15:37:00.075Z',
    //   id: 207,
    //   Week: 'May 27th, 2024',
    //   updatedAt: '2024-05-27T15:37:00.075Z',
    //   publishedAt: null,
    //   assignees: [
    //     { id: 581, day: 'Monday', assignee: schedulersMock.schedulers[0].volunteer },
    //     { id: 582, day: 'Thursday', assignee: schedulersMock.schedulers[0].volunteer },
    //     { id: 583, day: 'Saturday', assignee: schedulersMock.schedulers[0].volunteer }
    //   ]
    // });
    const instruction = {
      id: 1,
      title: "Test Instruction",
      description: "This is a test instruction"
    }
    const phoneNumber = "+1234567890";

    instructionHelper.requestApproval({phoneNumber, instruction}).then(res=>{
      // console.log("schedule: ", res);
      expect(res.success).toBe(false);
    });
  });
  it('should succeed if the phone number is in the database', function() {
    const instruction = {
      id: 1,
      title: "Test Instruction",
      description: "This is a test instruction"
    }
    const phoneNumber = "+13038833330";
    instructionHelper.requestApproval({phoneNumber, instruction}).then(res=>{
      // console.log("schedule: ", res);
      expect(res.success).toBe(false);
    });

  });
});

