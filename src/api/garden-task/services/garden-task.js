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
      populate: ['volunteers']
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
      populate: ['recurring_task','recurring_task.instruction','volunteers']
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
    if (smartTask) {
      if ((smartTask.status === 'INITIALIZED' && !smartTask.complete_once)) {
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(smartTask, 'STARTED');
        // TODO: add the user ont the volunteers array
        await strapi.service('api::garden-task.garden-task').addUserToTask(smartTask, user);

      } else if (smartTask.status === 'INITIALIZED') {
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(smartTask, 'PENDING');
      }
      let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(smartTask);
      if (!needsInstruction && !smartTask.complete_once && smartTask.volunteers.length > 1) {
        return {body: `You are being added to the task of "${smartTask.title}"${smartTask.overview ? `: ${smartTask.overview}` : ''}. \n\nRespond with TASK once you're ready for the next`, type: 'reply', task: smartTask};
      } else if (!needsInstruction) {
        return {body: `Okay ${user.firstName}, your new task is "${smartTask.title}"${smartTask.overview ? `: ${smartTask.overview}` : ''}. \n\nRespond with YES if you can do the task. SKIP if you'd like a different task. `, type: 'question', task: smartTask};
      } else {
        let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(smartTask.recurring_task.instruction, user);
        return {body: `We found a task for you! "${smartTask.title}"${smartTask.overview ? `: ${smartTask.overview}` : ''}. \n\nFirst you need to agree to the instructions, then reply with YES if you can manage this today, or SKIP if you'd like a different task.\n\n${instructionUrl}`, type: 'question', task: smartTask};
      }
      // TODO: check PENDING and STARTED tasks that may not have enough volunteers
      
    } else {
     return {body: 'I\'m sorry, we don\'t have an open task for you right now.', type: 'reply'};

    }
  },

  async getSmartTask(user, statusArr = ['STARTED','INITIALIZED', 'PENDING']) {
    // First get all tasks for the user's active garden
    console.log('user.activeGarden: ', user.activeGarden);
    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
      where: {
        garden: user.activeGarden?.id,
        status: {
          $in: statusArr
        }
      },
      populate: ['volunteers','recurring_task', 'recurring_task.instruction']
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
      populate: ['volunteers','recurring_task', 'recurring_task.instruction']
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
      populate: ['volunteers','volunteers.instructions','recurring_task','recurring_task.instruction']
    });
  },

  async getTaskByRecurringUndone(recTask) {

    return strapi.db.query('api::garden-task.garden-task').findOne({
      where: {
        status:{$notIn: ['FINISHED', 'SKIPPED', 'ABANDONED']}, //$notIn: ['Hello', 'Hola', 'Bonjour']
        recurring_task: recTask.id, 
        garden:recTask.garden
      },
      populate: { recurring_task: true, volunteers:true }
    });

  },

  async skipTask(user) {
    try {
      // First try to find and update tasks with scheduler_type that isn't "No Schedule"
      const scheduledTask = await strapi.db.query('api::garden-task.garden-task').update({
        where: {
          volunteers: user.id,
          status: {$in: ['INITIALIZED', 'STARTED', 'PENDING']},
          recurring_task: {
            $not: null
          }
        },
        data: {
          status: 'SKIPPED',
          completed_at: new Date()
        }
      });

      if (scheduledTask) {
        return {
          body: 'Alright then! Your task has been skipped!',
          type: 'complete',
          task: scheduledTask
        };
      }

      // If no scheduled task found, reset any other tasks back to INITIALIZED
      const unscheduledTask = await strapi.db.query('api::garden-task.garden-task').update({
        where: {
          volunteers: user.id,
          status: {$in: ['INITIALIZED', 'STARTED', 'PENDING']}
        },
        data: {
          volunteers: null,
          status: 'INITIALIZED'
        }
      });

      if (unscheduledTask) {
        return {
          body: 'Okay, you\'re no longer assigned to that task. Respond with TASK to get another.',
          type: 'complete',
          task: unscheduledTask
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
      populate: ['volunteers']
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

