const request = require('supertest');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
// user mock data

const messageMock = {
  body: "Can you water?",
  type: "question",
  user: 1,
};
const userMock = {
  id: 1,
  firstName: 'Cameron',
  lastName: 'Smith',
  phone: '1234567890',
  email: 'cameron@smith.com',
  paused: false,
  role: 'volunteer',
  activeGarden: 1,
  gardens: [1, 2, 3]
}
const setupTask = async () => {

  await strapi.service('api::recurring-task.recurring-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water'
    }
  });
  await strapi.service('api::scheduler.scheduler').create({
    data: {
      day: 'Tuesday',
      backup_volunteers: [1],
      recurring_task: 1
    }
  });

  await strapi.service('api::garden-task.garden-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water',
      status: 'INITIALIZED',
      user: 1,
      recurring_task: 1
    }
  });
}
describe('transferTask', function() {

  it("should deny if user has no task to transfer", async () => {
    const message = await strapi.db.query('api::message.message').create({
      data: {
      ...messageMock,
      },
    });
  
    await SmsHelper.transferTask({id:1}, 1)
      .then((data) => {
        // console.log('trasnfer: ', data)
        expect(data.body).toEqual("You don't have a task to transfer right now");
      });
  });
  
  // it("should transfer task", async () => {
  //   await setupTask();
  
  //   const entry = await strapi.db.query('api::message.message').update({
  //     where: { id: 1 },
  //     data: {
  //       garden_task: 1
  //     },
  //   });
  //   console.log(entry)
    
  //   await SmsHelper.transferTask({id:1}, 1)
  //     .then((data) => {
  //       console.log('trasnfer: ', data)
  //       expect(data.body).toEqual("Okay we've transferred to Cameron");
  //     });
  // });
  
});

describe('handleGardenTask', function() {
  it("should transfer task", async () => {
    // await SmsHelper.handleGardenTask({id:1}, 1);
  });
});

describe('findBackupUsers', function() {
  // let strapi
    
  it("send back full response smsInfo", async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockReturnValue({
      body: "Will you do the watering?",
      type: 'question',
      garden_task: {
        title: 'Water the Garden',
        id: 1,
        user: 1,
        recurring_task: {
          backup_volunteers: [1]
        }
      },
    });

    SmsHelper.getSchedulerFromTask = jest.fn().mockReturnValue({
      day: 'Tuesday',
      backup_volunteers: [{
        id: 1,
        firstName: 'Cameron',
        lastName: 'Smith',
        phone: '1234567890',
        email: 'cameron@smith.com',
        role: 'volunteer',
        activeGarden: 1,
        gardens: [1, 2, 3]
      },
      {
        id: 2,
        firstName: 'John',
        lastName: 'Doe',
        phone: '1234567890',
        email: 'john@doe.com',
        role: 'volunteer',
        activeGarden: 1,
        gardens: [1, 2, 3]
      }]
    });

    await SmsHelper.findBackupUsers(userMock).then((data) => {
      expect(data.body).toContain("Once you do we will transfer the task to them");

      expect(data.type).toEqual('followup');

      expect(data.task.title).toEqual("Water the Garden");
    });
  });
});
