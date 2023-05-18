'use strict';

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

  async getUserTasksByStatus(user, status) {
    const tasks = await strapi.entityService.findMany('api::garden-task.garden-task', {
      where: {
        user,
        status
      }
    });
    return tasks;

  },

  async updateGardenTask(task, status, user) {
    
    return strapi.db.query('api::garden-task.garden-task').update({
      where: {
        id: task.id
      }, 
      data: {
        status,
        volunteers: user
      },
      populate: ['volunteers']
    });
  }

}));

