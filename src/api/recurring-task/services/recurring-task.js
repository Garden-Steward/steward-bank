'use strict';

/**
 * recurring-task service
 */

const { createCoreService } = require('@strapi/strapi').factories;
const { dedupeByDocument } = require('../../../utils/documents');

module.exports = createCoreService('api::recurring-task.recurring-task', ({ strapi }) =>  ({

  /**
   * Every recurring task the daily cron builds garden tasks from.
   *
   * Runs on the query engine, which returns raw rows, so under Strapi v5 draft
   * & publish a published recurring task comes back twice - once as its draft
   * row and once as its published row. Both rows are built from, which doubles
   * up the generated tasks, and the copy built from the draft row carries draft
   * relation links: the REST API resolves published-to-published, so that task
   * shows up on the front-end with a null recurring_task, garden and
   * instruction. Collapse to one row per document, preferring the published
   * one, so the tasks we create point at rows the front-end can actually see.
   *
   * primary_image is populated so the generated task can carry the recurring
   * task's image (see buildSchedulerTask).
   *
   * @returns {arr} one recurring task per document
   */
  async getRecurringTaskGarden() {
    const tasks = await strapi.db.query('api::recurring-task.recurring-task').findMany({
      orderBy: {'id': 'desc'},
      populate: ["garden", "schedulers", "schedulers.volunteer", "schedulers.backup_volunteers", "instruction", "primary_image"],
    });
    return dedupeByDocument(tasks);
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
