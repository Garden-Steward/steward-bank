const userMock = require('../mocks/userMock');
const { patchService } = require('../helpers/patch');

describe('Garden Task Publishing', function() {
  let garden;
  let recurringTask;
  let gardenTask;
  let testUser;

  beforeEach(async () => {
    // userMock is a plain fixture, not a DB row. The SmsHelper paths below look
    // volunteers up by phone number and link them by id, so a real user has to
    // exist — otherwise the volunteer link hits a FK error and finishTask finds
    // nothing to finish.
    testUser = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email: userMock.user.email }
    });

    if (!testUser) {
      testUser = await strapi.db.query('plugin::users-permissions.user').create({
        data: {
          username: userMock.user.username,
          email: userMock.user.email,
          provider: userMock.user.provider,
          password: userMock.user.password,
          confirmed: userMock.user.confirmed,
          blocked: userMock.user.blocked,
          paused: userMock.user.paused,
          phoneNumber: userMock.user.phoneNumber,
          firstName: userMock.user.firstName,
          lastName: userMock.user.lastName,
        }
      });
    }

    // Get or create garden - use the same pattern as smsTask.js
    garden = await strapi.db.query('api::garden.garden').findOne({
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
      garden = await strapi.db.query('api::garden.garden').findOne({
        where: { id: userMock.user.activeGarden }
      });
    }

    // Create recurring task using the same pattern as smsTask.js
    const recurringTaskData = {
      title: 'Test Recurring Task',
      type: 'General',
      scheduler_type: 'No Schedule',
      garden: garden.id
    };
    
    recurringTask = await strapi.db.query('api::recurring-task.recurring-task').create({
      data: recurringTaskData
    });

    // Create a garden task with INITIALIZED status (not published)
    gardenTask = await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title: 'Test Task',
        status: 'INITIALIZED',
        type: 'General',
        recurring_task: recurringTask.id,
        garden: garden.id,
        publishedAt: null
      }
    });
  });

  describe('updateTaskStatus', function() {
    it('should publish task when status changes from INITIALIZED to STARTED', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'STARTED');
      
      expect(updatedTask.status).toBe('STARTED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should publish task when status changes from INITIALIZED to FINISHED', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'FINISHED');
      
      expect(updatedTask.status).toBe('FINISHED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should publish task when status changes from INITIALIZED to SKIPPED', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'SKIPPED');
      
      expect(updatedTask.status).toBe('SKIPPED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should publish task when status changes from INITIALIZED to ABANDONED', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'ABANDONED');
      
      expect(updatedTask.status).toBe('ABANDONED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should NOT publish task when status changes from INITIALIZED to PENDING', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'PENDING');
      
      expect(updatedTask.status).toBe('PENDING');
      expect(updatedTask.publishedAt).toBeNull();
    });

    it('should NOT publish task when status changes from STARTED to FINISHED (not from INITIALIZED)', async function() {
      // First update to STARTED (this will publish it)
      await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'STARTED');
      
      // Get the task again to check publishedAt was set
      const startedTask = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: gardenTask.id } });
      expect(startedTask.publishedAt).toBeDefined();
      const originalPublishedAt = startedTask.publishedAt;
      
      // Update to FINISHED - publishedAt should remain the same
      const finishedTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(startedTask, 'FINISHED');
      
      expect(finishedTask.status).toBe('FINISHED');
      // publishedAt should remain unchanged (not republished)
      expect(finishedTask.publishedAt).toEqual(originalPublishedAt);
    });
  });

  describe('updateGardenTaskUser', function() {
    it('should publish task when status changes from INITIALIZED to STARTED', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateGardenTaskUser(
        gardenTask,
        'STARTED',
        testUser.id
      );
      
      expect(updatedTask.status).toBe('STARTED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should NOT publish task when status changes from INITIALIZED to PENDING', async function() {
      const updatedTask = await strapi.service('api::garden-task.garden-task').updateGardenTaskUser(
        gardenTask,
        'PENDING',
        testUser.id
      );
      
      expect(updatedTask.status).toBe('PENDING');
      expect(updatedTask.publishedAt).toBeNull();
    });
  });

  describe('SmsHelper.handleGardenTask', function() {
    it('should publish task when status changes from INITIALIZED to STARTED via SMS', async function() {
      const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
      
      // Create a message with the garden task
      const message = await strapi.db.query('api::message.message').create({
        data: {
          body: 'Test question',
          type: 'question',
          user: testUser.id,
          garden_task: gardenTask.id
        }
      });

      // Mock validateQuestion to return the message
      patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue({
        id: message.id,
        body: 'Test question',
        type: 'question',
        garden_task: gardenTask
      }));

      // handleGardenTask reads gardenTask.volunteers, so hand it a populated task
      const populatedTask = await strapi.db.query('api::garden-task.garden-task').findOne({
        where: { id: gardenTask.id },
        populate: ['volunteers']
      });

      await SmsHelper.handleGardenTask('yes', testUser, {
        id: message.id,
        garden_task: populatedTask
      });

      // Check that the task was published
      const updatedTask = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: gardenTask.id } });
      expect(updatedTask.status).toBe('STARTED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });
  });

  describe('SmsHelper.finishTask', function() {
    it('should publish task when status changes from INITIALIZED to FINISHED', async function() {
      const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
      
      // Add user as volunteer
      await strapi.service('api::garden-task.garden-task').addUserToTask(gardenTask, testUser);
      
      // Update task to have complete_once = true
      await strapi.db.query('api::garden-task.garden-task').update({
        where: { id: gardenTask.id },
        data: { complete_once: true }
      });

      const result = await SmsHelper.finishTask(testUser);

      // Check that the task was published
      const updatedTask = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: gardenTask.id } });
      expect(updatedTask.status).toBe('FINISHED');
      expect(updatedTask.publishedAt).toBeDefined();
      expect(updatedTask.publishedAt).not.toBeNull();
    });

    it('should NOT publish task when status changes from STARTED to FINISHED (not from INITIALIZED)', async function() {
      const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
      
      // First update to STARTED (this will publish it)
      await strapi.service('api::garden-task.garden-task').updateTaskStatus(gardenTask, 'STARTED');
      await strapi.service('api::garden-task.garden-task').addUserToTask(gardenTask, testUser);
      
      // Update task to have complete_once = true
      await strapi.db.query('api::garden-task.garden-task').update({
        where: { id: gardenTask.id },
        data: { complete_once: true }
      });

      // Get the task to check publishedAt was set
      const startedTask = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: gardenTask.id } });
      expect(startedTask.publishedAt).toBeDefined();
      const originalPublishedAt = startedTask.publishedAt;

      const result = await SmsHelper.finishTask(testUser);

      // Check that publishedAt remains the same (not republished)
      const finishedTask = await strapi.db.query('api::garden-task.garden-task').findOne({ where: { id: gardenTask.id } });
      expect(finishedTask.status).toBe('FINISHED');
      expect(finishedTask.publishedAt).toEqual(originalPublishedAt);
    });
  });
});

