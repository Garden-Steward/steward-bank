'use strict';
const Helper = require('../../../../config/helpers/cron-helper');

/**
 * instruction service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::instruction.instruction', ({ strapi }) =>  ({

  /**
   * InstructionAssignTask
   * After someone has been approved for a task, we need to send them the final text of "Youve been assigned..."
   * 
   * @param {obj} user 
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async InstructionAssignTask(instruction, user) {
    const tasks = await strapi.service('api::garden-task.garden-task').getUserTasksByStatus(user, ['PENDING']);
    // if any tasks are pending, send them the initial Text of "Youve been assigned..."
    for (let task of tasks) {
      const taskInstruction = task.instruction || task.recurring_task?.instruction;
      if (taskInstruction && taskInstruction.id == instruction.id) {
        if (task.type === 'Water') {
          return await Helper.sendWaterSms(task, true);
        } else {
          return await strapi.service('api::garden-task.garden-task').sendTask(task);
        }
      }
      // TODO: Handle non water tasks of assigning
    }
    return {success: true, message: 'No tasks found', task: false}

  },

  /**
   * Send instruction of a task to volunteer
   * 
   * @param {obj} task 
   * @returns 
   */
  async managePendingTask(user, instruction, task) {
    console.log("sending instruction: ", instruction.slug, user.id);
    if (task.status == 'INITIALIZED') {
      try {
        await strapi.service('api::garden-task.garden-task').updateTaskStatus(task, 'PENDING');
      } catch (error) {
        return {success: false, message: 'Error updating task status to PENDING', task: task};
      }
    }
    strapi.service('api::sms.sms').handleSms({
      task: task, 
      body: `Hi ${user.firstName}, before we can assign task ${task.title} please agree to the instruction: https://steward.garden/i/${instruction.slug}?u=${user.id}`, 
      type: 'question'
    }
    );
    return {success: true, message: 'Sent instruction for ' + user.username, task: task};

  },

  checkInstruction(task) {
    let needsInstruction = false;
    const instruction = task?.instruction || task?.recurring_task?.instruction;
    if (instruction) {
      needsInstruction = !task.volunteers[0]?.instructions?.find(i => i.id == instruction.id);
    }
    return needsInstruction;
  },

  getInstructionUrl(instruction, user) {
    if (!instruction) {
      return '';
    }
    return `https://steward.garden/i/${instruction.slug}?u=${user.id}`;
  }

}));
