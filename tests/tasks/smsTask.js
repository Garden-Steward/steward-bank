const userMock = require('../mocks/userMock');
const taskMock = require('../tasks/taskMock');
describe('getTask', function() {
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
    console.log('Existing tasks after cleanup:', existingTasks);

    // Create instruction first
    const instructionData = { ...taskMock.recurring_task.instructions };
    delete instructionData.id;  // Remove the id so it's auto-generated
    
    const instruction = await strapi.db.query('api::instruction.instruction').create({
      data: instructionData
    });

    // Create recurring task with instruction relation
    const recurringTaskData = { ...taskMock.recurring_task };
    delete recurringTaskData.id;  // Remove the id so it's auto-generated
    delete recurringTaskData.instructions;  // Remove the original instructions relation
    recurringTaskData.type = 'General';
    recurringTaskData.scheduler_type = 'No Schedule';
    
    const recurringTask = await strapi.db.query('api::recurring-task.recurring-task').create({
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
});

// 1. Get a task from SMS
// - a. Update the task status to STARTED and assign it to the user
// 2. If no task is found, create a new task from a recurring task
// - a. 

// Q: Should we create all the tasks from recurring tasks and have them ready to be assigned?
// - this way we have control over which Recurring Tasks are available to be assigned

// If there is a No Schedule recurring task, we should create a task for it - when?
// no schedule tasks should be added to a volunteer day.