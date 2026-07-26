const userMock = require('../mocks/userMock');
const taskMock = require('../tasks/taskMock');
const { setupStrapi, cleanupStrapi } = require('../helpers/strapi');
const { patchService } = require('../helpers/patch');

let strapi;

beforeAll(async () => {
  strapi = await setupStrapi();
});

afterAll(async () => {
  await cleanupStrapi();
});

describe('getTask', function() {
  let instruction;
  let recurringTask;

  beforeEach(async () => {
    // Clear any existing mocks
    jest.clearAllMocks();
    // Reset the specific mock we care about
    patchService('api::garden-task.garden-task', 'getUserTasksByStatus', jest.fn().mockResolvedValue([]));

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

  // getTaskFromSMS no longer hands back a task object — it replies with a link to
  // the garden's tasks page, keyed off the populated activeGarden relation.
  it('should reply with a link to the garden tasks page', async function() {
    const task = await strapi.service('api::garden-task.garden-task').getTaskFromSMS({
      ...userMock.user,
      activeGarden: { id: userMock.user.activeGarden, slug: 'test-garden' }
    });
    expect(task.type).toBe('reply');
    expect(task.body).toContain('https://steward.garden/gardens/test-garden/tasks');
  });

  it('should ask the user to join a garden when there is no active garden', async function() {
    const task = await strapi.service('api::garden-task.garden-task').getTaskFromSMS({
      ...userMock.user,
      activeGarden: null,
      gardens: []
    });
    expect(task.type).toBe('reply');
    expect(task.body).toContain("I couldn't find your active garden");
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
    // skipTask only marks a task SKIPPED when it is on a real schedule; a
    // 'No Schedule' task takes the "just text TASK again" branch instead.
    recurringTaskData.scheduler_type = 'Weekly Shuffle';

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

  // skipTask reaches its "no open task" reply when it has a scheduled task but
  // the status update comes back empty. (It does NOT reach it when no task is
  // found at all — that path currently dereferences null; see skipTask().)
  it('should return a reply when the task cannot be skipped', async function() {
    patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue(null));
    patchService('api::garden-task.garden-task', 'findTaskFromUser', jest.fn().mockResolvedValue({
      id: 1,
      title: 'SMS Water Task',
      recurring_task: { id: 1, scheduler_type: 'Weekly Shuffle' }
    }));
    patchService('api::garden-task.garden-task', 'updateTaskStatus', jest.fn().mockResolvedValue(null));

    const smsInfo = await strapi.service('api::garden-task.garden-task').skipTask(userMock.user);
    expect(smsInfo.type).toBe('reply');
    expect(smsInfo.body).toContain('I\'m sorry, we don\'t have an open task for you right now.');
  });
});
