'use strict';

/**
 * garden-task controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const taskHelper = require('../services/helper');

module.exports = createCoreController('api::garden-task.garden-task', ({ strapi }) => ({

  /**
   * RSVP to a garden task via phone number or userId
   *
   * POST /garden-tasks/rsvp/:id
   * Body: { data: { userId?: number, phoneNumber?: string } }
   *
   * Flow:
   * - If userId: direct assignment (user already authenticated)
   * - If phoneNumber:
   *   - Check if user exists and is garden member
   *   - If not: send SMS invite to register
   *   - If yes: assign to task
   *
   * Returns:
   * - For registered users: { success, task, instruction }
   * - For unregistered: { success, body, needsRegistration, garden }
   */
  rsvpTask: async (ctx) => {
    console.log("task rsvp: ", ctx.params, ctx.request.body);
    const { data } = ctx.request.body;

    if (!data) {
      return ctx.badRequest('Missing data in request body');
    }

    if (!data.userId && !data.phoneNumber) {
      return ctx.badRequest('Must provide either userId or phoneNumber');
    }

    // Find user by userId or phoneNumber
    const userQuery = data.userId
      ? { id: data.userId }
      : { phoneNumber: `+1${data.phoneNumber}` };

    const user = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: userQuery,
      populate: ['gardens', 'instructions']
    });

    // Fetch the task with garden info
    const task = await strapi.db.query("api::garden-task.garden-task").findOne({
      where: { id: ctx.params.id },
      populate: ['garden', 'volunteers', 'recurring_task', 'recurring_task.instruction', 'primary_image']
    });

    if (!task) {
      return ctx.notFound('Task not found');
    }

    if (!task.garden) {
      return ctx.badRequest('Task has no associated garden');
    }

    // Check if user is already a member of the garden
    const alreadyMember = user?.gardens?.some(g => g.id === task.garden.id);

    // If authenticated via userId, directly RSVP
    if (data.userId) {
      return await taskHelper.rsvpTask(ctx.params.id, {
        userId: data.userId,
        user,
        task
      });
    }

    // Phone number flow
    if (data.phoneNumber) {
      if (!user || !alreadyMember) {
        // User doesn't exist or isn't a garden member - invite them
        console.log("inviting user to task");
        return await taskHelper.inviteUserTask({
          phoneNumber: `+1${data.phoneNumber}`,
          task
        });
      } else {
        // User is already a member of the garden - safe to RSVP
        return await taskHelper.rsvpTask(ctx.params.id, {
          userId: user.id,
          user,
          task
        });
      }
    }
  }

}));
