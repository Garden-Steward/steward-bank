const userMock = require('../mocks/userMock');
const taskMock = require('../tasks/taskMock');

describe('getTask', function() {
  let instruction;
  let recurringTask;

  beforeEach(async () => {
    // Clear any existing mocks
    jest.clearAllMocks();
    // Reset the specific mock we care about
    strapi.service('api::garden-task.garden-task').getUserTasksByStatus = jest.fn().mockResolvedValue([]);

    // Clean up the specific test task we know exists
    await strapi.db.query('api::garden-task.garden-task').update({
      where: { id: 65 },
      data: {
        volunteers: null,
        status: 'FINISHED'
      }
    });

    // Clean up any other tasks
    await strapi.db.query('api::garden-task.garden-task').deleteMany({
      where: { 
        status: {
          $in: ['INITIALIZED', 'STARTED', 'PENDING']
        }
      }
    });

    // Create garden if it doesn't exist
    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { id: userMock.user.activeGarden }
    });
    
    if (!garden) {
      await strapi.db.query('api::garden.garden').create({
        data: {
          id: userMock.user.activeGarden,
          title: 'Test Garden',
          slug: 'test-garden'
        }
      });
    }

    // Verify cleanup worked
    const existingTasks = await strapi.service('api::garden-task.garden-task').getUserTasksByStatus(userMock.user, ['INITIALIZED', 'STARTED', 'PENDING']);

    // Create instruction first
    const instructionData = { ...taskMock.recurring_task.instructions };
    delete instructionData.id;  // Remove the id so it's auto-generated
    
    instruction = await strapi.db.query('api::instruction.instruction').create({
      data: instructionData
    });

    // Create recurring task with instruction relation
    const recurringTaskData = { ...taskMock.recurring_task };
    delete recurringTaskData.id;  // Remove the id so it's auto-generated
    delete recurringTaskData.instructions;  // Remove the original instructions relation
    recurringTaskData.type = 'General';
    recurringTaskData.scheduler_type = 'No Schedule';
    
    recurringTask = await strapi.db.query('api::recurring-task.recurring-task').create({
      data: {
        ...recurringTaskData,
        instruction: instruction.id
      }
    });


    // Create a new task with proper relation to recurring task
    await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'SMS Test Task',
        status: 'INITIALIZED',
        type: 'General',
        recurring_task: recurringTask.id,
        garden: userMock.user.activeGarden
      }
    });
  });

  it('should return a task', async function() {
    const task = await strapi.service('api::garden-task.garden-task').getTaskFromSMS(userMock.user);
    expect(task.type).toBe('reply');
    expect(task.task.recurring_task.instruction.id).toBe(instruction.id);
  });

  it('should return a basic task you already have', async function() {
    // Create a task without a recurring_task relation
    // Create a new task with proper relation to recurring task
    strapi.service('api::garden-task.garden-task').getUserTasksByStatus = jest.fn().mockResolvedValue([{
      title: 'SMS Test Task',
      status: 'STARTED',
      type: 'General',
      volunteers: [userMock.user.id],
      garden: userMock.user.activeGarden
    }]);

    const task = await strapi.service('api::garden-task.garden-task').getTaskFromSMS(userMock.user);
    expect(task.type).toBe('reply');
    // The task should not have a recurring_task
    expect(task.body).toContain('You already have the task of');
  });

});

describe('skipTask', function() {
  let instruction;
  let recurringTask;

  beforeEach(async () => {
    // Create instruction first
    const instructionData = { ...taskMock.recurring_task.instructions };
    delete instructionData.id;  // Remove the id so it's auto-generated
    
    instruction = await strapi.db.query('api::instruction.instruction').create({
      data: instructionData
    });

    // Create recurring task with instruction relation
    const recurringTaskData = { ...taskMock.recurring_task };
    delete recurringTaskData.id;
    delete recurringTaskData.instructions;
    recurringTaskData.type = 'General';
    recurringTaskData.scheduler_type = 'No Schedule';
    
    recurringTask = await strapi.db.query('api::recurring-task.recurring-task').create({
      data: {
        ...recurringTaskData,
        instruction: instruction.id
      }
    });

    await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'SMS Water Task',
        status: 'INITIALIZED',
        type: 'Water',
        volunteers: [userMock.user.id],
        recurring_task: recurringTask.id,
        garden: userMock.user.activeGarden
      }
    });
  });

  it('should skip task properly', async function() {
    const smsInfo = await strapi.service('api::garden-task.garden-task').skipTask(userMock.user);
    expect(smsInfo.type).toBe('complete');
    expect(smsInfo.body).toContain('Alright then! Your task has been skipped!');
  });

  it('should return a reply if no task is found', async function() {
    strapi.db.query('api::garden-task.garden-task').update = jest.fn().mockResolvedValue(null);
    const smsInfo = await strapi.service('api::garden-task.garden-task').skipTask(userMock.user);
    expect(smsInfo.type).toBe('reply');
    expect(smsInfo.body).toContain('I\'m sorry, we don\'t have an open task for you right now.');
  });

});
