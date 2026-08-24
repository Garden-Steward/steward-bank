'use strict';

/**
 * weekly-schedule controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::weekly-schedule.weekly-schedule', ({ strapi }) => ({

  async send(ctx) {
    const { id } = ctx.params;
    try {
      const schedule = await strapi.db.query('api::weekly-schedule.weekly-schedule').findOne({
        where: { documentId: id },
        populate: ['assignees', 'assignees.assignee', 'recurring_task']
      });
      if (!schedule) {
        ctx.status = 404;
        return { error: 'Schedule not found' };
      }

      const sentInfo = await strapi.service('api::weekly-schedule.weekly-schedule').sendWeeklyMsg(
        schedule.recurring_task,
        schedule.assignees
      );
      return { success: true, sent: sentInfo };
    } catch (err) {
      ctx.status = 500;
      return { error: err.message };
    }
  }

}));
