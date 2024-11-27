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
    
    const tasks = await this.getUserTasksByStatus(user, ['INITIALIZED','STARTED','PENDING']);
    console.log('tasks', tasks);
    if (tasks.length) {
      const task = tasks[0];
      let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(task);
      console.log('needsInstruction', task);
      if (!needsInstruction) {
        return {body: `You already have the task of "${task.title}": ${task.overview}. \n\nRespond with YES if you can do the task. NO if want to transfer. SKIP if it isn't needed. `, type: 'reply', task};
      } else {
        let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(task.recurring_task.instruction, user);
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'PENDING');
        return {body: `"${task.title}" has already been assigned to you. First you need to agree to the instructions, then reply with YES or NO if you can manage this today.\n\n${instructionUrl}`, type: 'reply', task};
      }
    }

    let task = await strapi.service('api::garden-task.garden-task').getRandomTask(['INITIALIZED']);
    if (task) {
      task = await strapi.service('api::garden-task.garden-task').updateGardenTaskUser(task, 'PENDING', user);
      let needsInstruction = strapi.service('api::instruction.instruction').checkInstruction(task);
      if (!needsInstruction) {
        return {body: `Your new task is "${task.title}": ${task.overview}. \n\nRespond with YES if you can do the task. SKIP if you'd like a different task. `, type: 'reply', task};
      } else {
        let instructionUrl = strapi.service('api::instruction.instruction').getInstructionUrl(task.recurring_task.instruction, user);
        return {body: `We found a task for you! "${task.title}": ${task.overview}. \n\nFirst you need to agree to the instructions, then reply with YES if you can manage this today, or SKIP if you'd like a different task.\n\n${instructionUrl}`, type: 'reply', task};
      }
    } else {
     return {body: 'I\'m sorry, we don\'t have an open task for you right now.', type: 'reply'};

    }
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

