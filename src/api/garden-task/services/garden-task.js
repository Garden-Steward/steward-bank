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
    const tasks = await strapi.entityService.update('api::garden-task.garden-task', task.id, {
      data: {status}
    });
    return tasks;
  },

  async addUserToTask(task, user) {
    // First get the current task to access existing volunteers
    const currentTask = await strapi.entityService.findOne('api::garden-task.garden-task', task.id, {
      populate: ['volunteers', 'primary_image']
    });
    
    // Create array of existing volunteer IDs plus the new user
    const volunteerIds = [
      ...(currentTask.volunteers?.map(v => v.id) || []),
      user.id
    ];

    // Update the task with the combined volunteer array
    const tasks = await strapi.entityService.update('api::garden-task.garden-task', task.id, {
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
    let task = await strapi.service('api::garden-task.garden-task').findTaskFromUser(user);

    if (task) { // they have one already
      let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(task);
      if (!needsInstruction) {
        return {body: `You already have the task of "${task.title}": ${task.overview}. \n\nRespond with YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `, type: 'question', task};
      } else {
        let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(task.recurring_task.instruction, user);
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'PENDING');
        return {body: `"${task.title}" has already been assigned to you. First you need to agree to the instructions, then reply with YES or NO if you can manage this today.\n\n${instructionUrl}`, type: 'question', task};
      }
    }
    // User has no tasks, get a random task
    let smartTask = await strapi.service('api::garden-task.garden-task').getSmartTask(user);

    if (!smartTask) {
      return {body: 'I\'m sorry, there are no tasks available for you right now.', type: 'reply'};
    }

    let noComplete = smartTask.complete_once === false;
    
    if (smartTask.status === 'INITIALIZED') {
      const status = noComplete ? 'STARTED' : 'PENDING';
      await strapi.service('api::garden-task.garden-task').updateTaskStatus(smartTask, status);
      if (!smartTask.volunteers.some(v => v.id === user.id)) {
        await strapi.service('api::garden-task.garden-task').addUserToTask(smartTask, user);
      }
    } else if (noComplete && !smartTask.volunteers.some(v => v.id === user.id)) { // default the user to starting upon assignment.
      await strapi.service('api::garden-task.garden-task').addUserToTask(smartTask, user);
    }
    let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(smartTask);
    if (!needsInstruction && noComplete) {
      return {body: `You are being added to the task of "${smartTask.title}"${smartTask.overview ? `: ${smartTask.overview}` : ''}. \n\nRespond with TASK once you're ready for the next`, type: 'reply', task: smartTask};
    } else if (!needsInstruction && !noComplete) {
      return {body: `Okay ${user.firstName}, your new task is "${smartTask.title}"${smartTask.overview ? `\n\n${smartTask.overview}` : ''}. \n\nRespond with YES if you can do the task. SKIP if you'd like a different task.`, type: 'question', task: smartTask};
    } else {
      let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(smartTask.recurring_task.instruction, user);
      return {body: `We found a task for you! "${smartTask.title}"${smartTask.overview ? `\n\n${smartTask.overview}` : ''}. \n\nFirst you need to agree to the instructions, then reply with YES if you can manage this today, or SKIP if you'd like a different task.\n\n${instructionUrl}`, type: 'question', task: smartTask};
    }
  
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
    
    return strapi.db.query('api::garden-task.garden-task').update({
      where: {
        id: task.id
      }, 
      data: {
        status,
        volunteers: user
      },
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
    return strapi.entityService.findMany('api::garden-task.garden-task', {
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

