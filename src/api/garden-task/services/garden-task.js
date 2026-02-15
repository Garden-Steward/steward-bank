'use strict';
const Helper = require('../../../../config/helpers/cron-helper.js');

/**
 * garden-task service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::garden-task.garden-task', ({ strapi }) =>  ({

  /**
   * 
   * @param {obj} user 
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async updateTaskStatus(task, status) {
    // Get current task to check if status is INITIALIZED
    const currentTask = await strapi.documents('api::garden-task.garden-task').findOne({
      documentId: "__TODO__"
    });
    
    // Prepare update data
    const updateData = { status };
    
    // If status is changing from INITIALIZED to anything else (except PENDING), publish the task
    if (currentTask.status === 'INITIALIZED' && status !== 'INITIALIZED' && status !== 'PENDING') {
      updateData.publishedAt = new Date();
    }
    
    const tasks = await strapi.documents('api::garden-task.garden-task').update({
      documentId: "__TODO__",
      data: updateData
    });
    return tasks;
  },

  async addUserToTask(task, user) {
    // First get the current task to access existing volunteers
    const currentTask = await strapi.documents('api::garden-task.garden-task').findOne({
      documentId: "__TODO__",
      populate: ['volunteers', 'primary_image']
    });
    
    // Create array of existing volunteer IDs plus the new user
    const volunteerIds = [
      ...(currentTask.volunteers?.map(v => v.id) || []),
      user.id
    ];

    // Update the task with the combined volunteer array
    const tasks = await strapi.documents('api::garden-task.garden-task').update({
      documentId: "__TODO__",

      data: {
        volunteers: volunteerIds
      }
    });
    return tasks;
  },
  /**
   * Find a task for a user, checking their current tasks first
   * @param {object} user - The user to find a task for
   * @returns {object} SMS response object with task info
   */
  async findTaskFromUser(user) {
    const tasks = await this.getUserTasksByStatus(user, ['INITIALIZED', 'STARTED', 'PENDING']);
    if (!tasks.length) {
      return false;
    }

    // Check tasks in priority order: Pending, Started, Initialized
    const statusOrder = ['PENDING', 'STARTED', 'INITIALIZED'];
    
    // Find first task matching priority order
    for (const status of statusOrder) {
      const filteredTask = tasks.find(t => t.status === status && t.complete_once === true);
      if (filteredTask) {
        return filteredTask;
      }
    }
    return false;
  },

  async getUserTasksByStatus(user, statusArr) {
    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      where: {
        volunteers: user.id,
        status: {
          $in: statusArr
        }
      },
      populate: ['recurring_task','recurring_task.instruction','volunteers', 'primary_image']
    });
    return tasks;

  },

  async getTasksByStatusAndRecurringTask(statusArr, recurringTask) {
    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      where: {
        status: { $in: statusArr },
        recurring_task: recurringTask.id
      }
    });
    return tasks;
  },

  // Called from main switch Message Controller: "task"
  async getTaskFromSMS(user) {
    // Get user's active garden to build the tasks URL
    let activeGarden = user.activeGarden;
    
    // If no active garden, check gardens array
    if (!activeGarden && user.gardens?.length) {
      activeGarden = user.gardens[0];
    }
    
    // Build the tasks URL for the garden
    if (activeGarden?.slug) {
      const tasksUrl = `https://steward.garden/gardens/${activeGarden.slug}/tasks`;
      return {
        body: `Here's the link to your garden tasks:\n\n${tasksUrl}`,
        type: 'reply'
      };
    }
    
    // No garden found, return helpful message
    return {
      body: "I couldn't find your active garden. Please join a garden first by texting its name.",
      type: 'reply'
    };
  },

  async getSmartTask(user, statusArr = ['STARTED','INITIALIZED', 'PENDING']) {
    // First get all tasks for the user's active garden
    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      where: {
        garden: user.activeGarden?.id,
        status: {
          $in: statusArr
        }
      },
      populate: ['volunteers','recurring_task', 'recurring_task.instruction', 'primary_image']
    });

    // Filter out tasks where user is already a volunteer
    const availableTasks = tasks.filter(task => {
      const isUserVolunteer = task.volunteers?.some(volunteer => volunteer.id === user.id);
      const maxVolunteers = task.max_volunteers || 1; // Default to 1 if not specified
      const currentVolunteers = task.volunteers?.length || 0;
      return !isUserVolunteer && currentVolunteers < maxVolunteers;
    });

    if (availableTasks.length === 0) {
      return null;
    }
    return availableTasks[Math.floor(Math.random() * availableTasks.length)];
  },

  async getRandomTask(statusArr) {
    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      where: {
        volunteers: {
          $null: true
        },
        status: {
          $in: statusArr
        }
      },
      populate: ['volunteers','recurring_task', 'recurring_task.instruction', 'primary_image']
    });
    return tasks[Math.floor(Math.random() * tasks.length)];
  },

  async updateGardenTaskUser(task, status, user) {
    // Get current task to check if status is INITIALIZED
    const currentTask = await strapi.db.query('api::garden-task.garden-task').findOne({
      where: { id: task.id }
    });
    
    // Prepare update data
    const updateData = {
      status,
      volunteers: user
    };
    
    // If status is changing from INITIALIZED to anything else (except PENDING), publish the task
    if (currentTask.status === 'INITIALIZED' && status !== 'INITIALIZED' && status !== 'PENDING') {
      updateData.publishedAt = new Date();
    }
    
    return strapi.db.query('api::garden-task.garden-task').update({
      where: {
        id: task.id
      }, 
      data: updateData,
      populate: ['volunteers','volunteers.instructions','recurring_task','recurring_task.instruction', 'primary_image']
    });
  },

  async getTaskByRecurringUndone(recTask) {

    return strapi.db.query('api::garden-task.garden-task').findOne({
      where: {
        status:{$notIn: ['FINISHED', 'SKIPPED', 'ABANDONED']}, //$notIn: ['Hello', 'Hola', 'Bonjour']
        recurring_task: recTask.id, 
        garden:recTask.garden
      },
      populate: { recurring_task: true, volunteers:true, primary_image: true }
    });

  },

  async skipTask(user) {
    const latestQuestion = await strapi.service('api::message.message').validateQuestion(user);
    let task;
    if (!latestQuestion ) {
      task = await strapi.service('api::garden-task.garden-task').findTaskFromUser(user);
    } else {
      task = latestQuestion.garden_task;
    }  
    try {
      // First try to find and update tasks with scheduler_type that isn't "No Schedule"
      if (task.recurring_task.scheduler_type !== 'No Schedule') {
        const scheduledTask = await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'SKIPPED');
        if (scheduledTask) {
          return {
            body: 'Alright then! Your task has been skipped!',
            type: 'complete',
            task: scheduledTask
          };
        }
      } else if (task) {
        return {
          body: 'Easy peasy! Just respond with TASK to get a new task.',
          type: 'complete',
          task: task
        };
      }

      return {
        body: 'I\'m sorry, we don\'t have an open task for you right now.',
        type: 'reply'
      };

    } catch (err) {
      console.error('skip error: ', err);
      return {
        body: 'Problem updating the task!',
        type: 'complete'
      };
    }
  },

  getTypeTasks(garden, type, limit) {
    return strapi.documents('api::garden-task.garden-task').findMany({
      where: {
        garden,
        type
      },
      limit,
      sort: {
        updatedAt: 'desc'
      },
      populate: ['volunteers', 'primary_image']
    });

  },

  sendTask(task) {

    if (!skipWindow && !Helper.sendingWindow(task)) { return }
    strapi.service('api::sms.sms').handleSms({
      task: task, 
      body: `Hi ${task.volunteers[0].firstName}, your task ${task.title} is ready to be done today! Are you able to do it? You have some OPTIONS.`, 
      type: 'question'
    }
    );
    return {success: true, message: 'Sent task reminder for ' + task.volunteers[0].username, task: task};

  }

}));

