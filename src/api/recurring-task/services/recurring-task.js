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
    const tasks = await strapi.db.query('api::recurring-task.recurring-task').findMany({
      orderBy: {'id': 'desc'},
      populate: ["garden", "schedulers", "schedulers.volunteer", "schedulers.backup_volunteers"],
    });
    return tasks;
  },

  async getTypeRecurringTask(garden, type, limit) {
    return strapi.db.query('api::recurring-task.recurring-task').findMany({
      where: {
        garden: garden.id,
        type: type
      },
      limit,
      orderBy: {
        updatedAt: 'desc'
      },
      populate: ['schedulers']

    })
  },

  async getRecurringTaskBySchedulerType(garden, scheduler_type) {
    // TODO: Verify that the recurring task does not have any existing STARTED tasks
    let tasks = await strapi.service('api::garden-task.garden-task').getTasksByStatusAndRecurringTask(['STARTED'], recurringTask);
    let recurringTasks = await strapi.db.query('api::recurring-task.recurring-task').findMany({
      where: {
        garden: garden.id,
        scheduler_type: scheduler_type
      }
    })
  }

}));
