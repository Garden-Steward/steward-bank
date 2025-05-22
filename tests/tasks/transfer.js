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
const setupTask = async (addInst) => {
  const instruction = addInst ? await strapi.service('api::instruction.instruction').create({
    data: {
      title: 'Watering Instructions',
      slug: 'watering-instructions',
    }
  }) : null;
  // console.log('made instruction: ', instruction)

  const recurringTask = await strapi.service('api::recurring-task.recurring-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water',
      instruction: instruction ? instruction.id : null
    },
    populate: ['instruction']
  });

  await strapi.service('api::scheduler.scheduler').create({
    data: {
      day: 'Tuesday',
      backup_volunteers: [1],
      recurring_task: recurringTask.id
    }
  });

  return strapi.service('api::garden-task.garden-task').create({
    data: {
      title: 'Water the Garden',
      type: 'Water',
      status: 'INITIALIZED',
      user: 1,
      recurring_task: recurringTask.id
    },
    populate: ['recurring_task']
  });
}
describe('transferTask', function() {

  it("should deny if user has no task to transfer", async () => {
    const message = await strapi.db.query('api::message.message').create({
      data: {
      ...messageMock,
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
      },
      {
        id: 3,
        firstName: 'Jane',
        lastName: 'Goodall',
        phone: '1234567890',
        email: 'jane@goodall.com',
        role: 'volunteer',
        activeGarden: 1,
        gardens: [1, 2, 3]
      }]
    });


  
    await SmsHelper.transferTask({firstName:"Cameron", lastName:"Smith", id:1}, 1)
      .then((data) => {
        // console.log('trasnfer: ', data)
        expect(data.body).toEqual("You don't have a task to transfer right now");
      });
  });
  
  it("should transfer task", async () => {
    await setupTask();
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      id: 1,
      body: 'Do you "Approve" of this instruction?',
      type: 'question',
      previous: 'yes',
      createdAt: '2024-06-16T03:46:01.476Z',
      updatedAt: '2024-06-16T03:48:06.526Z',
      publishedAt: null,
      garden_task: {
        id: 1,
        title: 'Water the Garden',
        status: 'INITIALIZED',
        user: 1,
        recurring_task: 1
      },
    });
  
    const entry = await strapi.db.query('api::message.message').update({
      where: { id: 1 },
      data: {
        garden_task: 1
      },
    });
    
    await SmsHelper.transferTask({firstName:"Cameron", lastName:"Smith", id:1}, 1)
      .then((data) => {
        expect(data.body).toContain("Okay we've transferred to John.");
      });
  });

  it("should transfer task with instruction", async () => {
    let garden_task = await setupTask(true);
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      id: 1,
      body: 'Do you "Approve" of this instruction?',
      type: 'question',
      previous: 'yes',
      createdAt: '2024-06-16T03:46:01.476Z',
      updatedAt: '2024-06-16T03:48:06.526Z',
      publishedAt: null,
      garden_task,
    });

    await SmsHelper.transferTask({firstName:"Cameron", lastName:"Smith", id:1}, 1)
      .then((data) => {
        expect(data.body).toContain("need to agree to the instructions");
      });
  });
  
});

describe('handleGardenTask', function() {
  it("should transfer task", async () => {
    // await SmsHelper.handleGardenTask({id:1}, 1);
  });
});


describe('findBackupUsers - SMS Helper No Response', function() {
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

    await SmsHelper.findBackupUsers(userMock).then((data) => {
      expect(data.body).toContain("Once you do we will transfer the task to them");

      expect(data.type).toEqual('followup');

      expect(data.task.title).toEqual("Water the Garden");
    });
  });

  it("manage with no question", async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockReturnValue(false);
    await SmsHelper.findBackupUsers(userMock).then((data) => {
      expect(data.body).toContain("Once you do we will transfer the task to them");
      expect(data.type).toEqual('followup');
    });

  });

  it ('should fail if no recurring task', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockReturnValue({
      body: "Will you do the watering?",
      type: 'question',
      garden_task: {
        title: 'Water the Garden',
        id: 1,
        user: 1,
      },
    });

    const result = await SmsHelper.findBackupUsers(userMock)
    expect(result.success).toEqual(false);
    expect(result.body).toContain('Only Scheduled Tasks can');
  });

});
