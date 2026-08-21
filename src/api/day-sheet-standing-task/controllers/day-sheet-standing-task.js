'use strict';

/**
 * day-sheet-standing-task controller
 *
 * A plain object controller — deliberately not the core-controller factory
 * — since there is no core routes file for this single type and no core
 * actions should ride along. The only action here is the manager-guarded
 * write of the global standing list; the two read paths (day-sheet
 * JSON/HTML) live on volunteer-day.
 */

module.exports = {
  async replaceList(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to edit the standing task list');
    }
    if (user.role?.type !== 'administrator') {
      const managedCount = await strapi.db.query('api::garden.garden').count({
        where: { managers: { id: user.id } },
      });
      if (managedCount === 0) {
        return ctx.forbidden('Only garden managers can edit the standing task list');
      }
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const { items, source } = await strapi
        .service('api::day-sheet-standing-task.day-sheet-standing-task')
        .replaceList(body.standing_tasks);
      ctx.set('Cache-Control', 'no-store');
      return {
        data: {
          standing: items,
          meta: { standingSource: source, standingCount: items.length },
        },
      };
    } catch (err) {
      if (err.standingValidationError) return ctx.badRequest(err.message);
      throw err;
    }
  },
};
