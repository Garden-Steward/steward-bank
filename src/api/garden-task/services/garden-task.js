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

