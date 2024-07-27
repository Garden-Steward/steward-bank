'use strict';
const Helper = require('../../../../config/helpers/cron-helper');

/**
 * instruction service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::instruction.instruction', ({ strapi }) =>  ({

  /**
   * 
   * @param {obj} user 
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async InstructionAssignTask(instruction, user) {
    const tasks = await strapi.service('api::garden-task.garden-task').getUserTasksByStatus(user, ['PENDING']);
    // if any tasks are pending, send them the initial Text of "Youve been assigned..."
    for (let task of tasks) {
      if (task.recurring_task && task.recurring_task.instruction == instruction.id) {
        if (task.type === 'Water') {
          return Helper.sendWaterSms(task, true);
        }
      }
      // TODO: Handle non water tasks of assigning
    }
    return false

  }
}));
