'use strict';

/**
 * recurring-task service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::recurring-task.recurring-task', ({ strapi }) =>  ({

  /**
   * 
   * @param {obj} user 
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async getRecurringTaskGarden() {
    const tasks = await strapi.entityService.findMany('api::recurring-task.recurring-task', {
      sort: {'id': 'desc'},
      populate: ["garden", "schedulers", "schedulers.volunteer", "schedulers.backup_volunteers"],
    });
    return tasks;
  },

  async getTypeRecurringTask(garden, type, limit) {
    return strapi.entityService.findMany('api::recurring-task.recurring-task', {
      where: {
        garden,
        type
      },
      limit,
      sort: {
        updatedAt: 'desc'
      },
      populate: ['schedulers']

    })
  }

}));
