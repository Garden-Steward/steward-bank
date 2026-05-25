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
    // Create the garden task first
    const gardenTask = await setupTask();
    
    // Create the message
    const message = await strapi.db.query('api::message.message').create({
      data: {
        ...messageMock,
        garden_task: gardenTask.id
      }
    });

    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      id: message.id,
      body: 'Do you "Approve" of this instruction?',
      type: 'question',
      previous: 'yes',
      createdAt: '2024-06-16T03:46:01.476Z',
      updatedAt: '2024-06-16T03:48:06.526Z',
      publishedAt: null,
      garden_task: gardenTask,
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

  it("returns PASS/PICK/SKIP prompt when backups exist", async () => {
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

    SmsHelper.getSchedulerFromTask = jest.fn().mockResolvedValue({
      day: 'Tuesday',
      backup_volunteers: [
        { id: 2, firstName: 'John', lastName: 'Doe', paused: false },
        { id: 3, firstName: 'Jane', lastName: 'Goodall', paused: false },
      ]
    });

    const data = await SmsHelper.findBackupUsers(userMock);
    expect(data.body).toContain('PASS');
    expect(data.body).toContain('PICK');
    expect(data.body).toContain('SKIP');
    expect(data.type).toEqual('question');
    expect(data.task.title).toEqual("Water the Garden");
  });

  it('should fail if no recurring task', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockReturnValue({
      body: "Will you do the watering?",
      type: 'question',
      garden_task: {
        title: 'Water the Garden',
        id: 1,
        user: 1,
      },
    });

    const result = await SmsHelper.findBackupUsers(userMock);
    expect(result.success).toEqual(false);
    expect(result.body).toContain('Only Scheduled Tasks can');
  });

});

describe('passToNextVolunteer', function() {
  const backupList = [
    { id: 1, firstName: 'Cameron', lastName: 'Smith', paused: false },
    { id: 2, firstName: 'John',    lastName: 'Doe',   paused: false },
    { id: 3, firstName: 'Jane',    lastName: 'Goodall', paused: false },
    { id: 4, firstName: 'Alice',   lastName: 'Wong',  paused: false },
    { id: 5, firstName: 'Bob',     lastName: 'Lee',   paused: false },
  ];

  beforeEach(() => {
    SmsHelper.getSchedulerFromTask = jest.fn().mockResolvedValue({
      day: 'Tuesday',
      backup_volunteers: backupList,
    });
    strapi.service('api::sms.sms').handleSms = jest.fn().mockResolvedValue(true);
    strapi.service('api::garden-task.garden-task').updateGardenTaskUser = jest.fn().mockResolvedValue({
      id: 1, title: 'Water the Garden', recurring_task: { id: 1, instruction: null }
    });
    strapi.service('api::instruction.instruction').checkInstruction = jest.fn().mockReturnValue(false);
  });

  it('passes to the next person in circular order', async () => {
    // current user is id:1 (index 0), next should be id:2 (John)
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      body: 'Should we PASS?',
      type: 'question',
      garden_task: {
        id: 1,
        title: 'Water the Garden',
        recurring_task: { id: 1 }
      }
    });

    const result = await SmsHelper.passToNextVolunteer({ id: 1, firstName: 'Cameron', paused: false });
    expect(strapi.service('api::garden-task.garden-task').updateGardenTaskUser).toHaveBeenCalled();
    expect(strapi.service('api::sms.sms').handleSms).toHaveBeenCalled();
    expect(result.body).toContain('John');
    expect(result.type).toEqual('complete');
  });

  it('wraps around correctly from last person to first', async () => {
    // current user is id:5 (index 4), next should be id:1 (Cameron) — but that's the user making the request?
    // Use id:5 as current, expect wrap to id:1... but id:1 is not in this call's user arg.
    // Simulate: user is person 5 (Bob), next should be person 1 (Cameron).
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      body: 'Should we PASS?',
      type: 'question',
      garden_task: {
        id: 1,
        title: 'Water the Garden',
        recurring_task: { id: 1 }
      }
    });
    const result = await SmsHelper.passToNextVolunteer({ id: 5, firstName: 'Bob', paused: false });
    expect(result.type).toEqual('complete');
    expect(result.body).toContain('Cameron');
  });

  it('skips paused volunteers in rotation', async () => {
    // Person at index 1 (John, id:2) is paused — should skip to Jane (id:3)
    SmsHelper.getSchedulerFromTask = jest.fn().mockResolvedValue({
      day: 'Tuesday',
      backup_volunteers: [
        { id: 1, firstName: 'Cameron', lastName: 'Smith', paused: false },
        { id: 2, firstName: 'John',    lastName: 'Doe',   paused: true },
        { id: 3, firstName: 'Jane',    lastName: 'Goodall', paused: false },
      ]
    });
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      body: 'Should we PASS?',
      type: 'question',
      garden_task: { id: 1, title: 'Water the Garden', recurring_task: { id: 1 } }
    });
    const result = await SmsHelper.passToNextVolunteer({ id: 1, firstName: 'Cameron', paused: false });
    expect(result.body).toContain('Jane');
  });

  it('returns error when no task is found', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue(null);
    strapi.service('api::garden-task.garden-task').findTaskFromUser = jest.fn().mockResolvedValue(null);
    const result = await SmsHelper.passToNextVolunteer({ id: 1, firstName: 'Cameron' });
    expect(result.type).toEqual('reply');
    expect(result.body).toContain('No task');
  });
});

describe('pickVolunteer', function() {
  it('shows numbered list of available backup volunteers', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue({
      body: 'Should we PASS?',
      type: 'question',
      garden_task: { id: 1, title: 'Water the Garden', recurring_task: { id: 1 } }
    });
    SmsHelper.getSchedulerFromTask = jest.fn().mockResolvedValue({
      day: 'Tuesday',
      backup_volunteers: [
        { id: 1, firstName: 'Cameron', paused: false },
        { id: 2, firstName: 'John',    paused: false },
        { id: 3, firstName: 'Jane',    paused: false },
      ]
    });

    const result = await SmsHelper.pickVolunteer({ id: 1, firstName: 'Cameron', paused: false });
    expect(result.type).toEqual('followup');
    expect(result.body).toContain('1 for John');
    expect(result.body).toContain('2 for Jane');
    // current user (Cameron) should not appear
    expect(result.body).not.toContain('Cameron');
  });

  it('returns error when no schedulable task', async () => {
    strapi.service('api::message.message').validateQuestion = jest.fn().mockResolvedValue(null);
    strapi.service('api::garden-task.garden-task').findTaskFromUser = jest.fn().mockResolvedValue(null);
    const result = await SmsHelper.pickVolunteer({ id: 1, firstName: 'Cameron' });
    expect(result.type).toEqual('reply');
  });
});
