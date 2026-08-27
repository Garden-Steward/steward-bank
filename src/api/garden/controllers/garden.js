'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

module.exports = createCoreController('api::garden.garden', ({ strapi }) => ({
  // Day-sheet JSON for a whole garden: the standing checklist plus every task
  // the garden currently has open, priority-ordered. Shares its assembly
  // service with the volunteer-day sheet, so the two cannot drift.
  async getDaySheet(ctx) {
    const svc = strapi.service('api::volunteer-day.day-sheet');
    const { slug } = ctx.params;
    if (!SLUG_PATTERN.test(String(slug))) {
      return ctx.badRequest('Invalid garden slug');
    }
    let params;
    try {
      params = svc.parseSheetParams(ctx.query);
    } catch (err) {
      if (err.sheetParamError) return ctx.badRequest(err.message);
      throw err;
    }
    const sheet = await svc.assembleForGarden(String(slug), params);
    if (!sheet) return ctx.notFound('Garden not found');
    ctx.set('Cache-Control', 'no-store');
    return { data: sheet };
  },

  // Printable HTML for the same sheet. Every failure surface is plain text with
  // no reflection of the submitted input — status/type/body are set directly
  // rather than via the Koa helpers, which produce a JSON error envelope.
  async getDaySheetHtml(ctx) {
    const fail = (status, text) => {
      ctx.status = status;
      ctx.type = 'text/plain; charset=utf-8';
      ctx.body = text;
    };

    const svc = strapi.service('api::volunteer-day.day-sheet');
    const { slug } = ctx.params;
    if (!SLUG_PATTERN.test(String(slug))) {
      return fail(400, 'Invalid garden slug');
    }
    let params;
    try {
      params = svc.parseSheetParams(ctx.query);
    } catch (err) {
      if (err.sheetParamError) return fail(400, err.message);
      throw err;
    }
    const sheet = await svc.assembleForGarden(String(slug), params);
    if (!sheet) return fail(404, 'Garden not found');
    ctx.set('Cache-Control', 'no-store');
    ctx.status = 200;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = svc.renderHtml(sheet);
  },

  // This garden's every-volunteer-day checklist.
  async getStandingTasks(ctx) {
    const { slug } = ctx.params;
    if (!SLUG_PATTERN.test(String(slug))) {
      return ctx.badRequest('Invalid garden slug');
    }
    const garden = await strapi.db.query('api::garden.garden').findOne({ where: { slug: String(slug) } });
    if (!garden) return ctx.notFound('Garden not found');

    const svc = strapi.service('api::day-sheet-standing-task.day-sheet-standing-task');
    const { items, source } = await svc.getListForGarden(garden);
    ctx.set('Cache-Control', 'no-store');
    return { data: { standing: items, meta: { source, gardenSlug: garden.slug } } };
  },

  // Replace this garden's checklist. Only a manager of THIS garden may write
  // it — being a manager somewhere else is not enough, or one garden's manager
  // could rewrite another's.
  async replaceStandingTasks(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const { slug } = ctx.params;
    if (!SLUG_PATTERN.test(String(slug))) {
      return ctx.badRequest('Invalid garden slug');
    }

    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { slug: String(slug) },
      populate: ['managers'],
    });
    if (!garden) return ctx.notFound('Garden not found');

    const isAdmin = user.role?.type === 'administrator';
    const managesThisGarden = (garden.managers || []).some((m) => m.id === user.id);
    if (!isAdmin && !managesThisGarden) {
      return ctx.forbidden('Only managers of this garden can edit its standing task list');
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    const svc = strapi.service('api::day-sheet-standing-task.day-sheet-standing-task');
    try {
      const { items, source } = await svc.replaceListForGarden(garden, body.standing_tasks);
      ctx.set('Cache-Control', 'no-store');
      return { data: { standing: items, meta: { source, gardenSlug: garden.slug } } };
    } catch (e) {
      if (e.standingValidationError) return ctx.badRequest(e.message);
      throw e;
    }
  },

  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    const entity = await strapi.db.query('api::garden.garden').findOne({
      where: {slug: ctx.params.slug},
      populate: [
        "recurring_tasks",
        "volunteers", "volunteers.role", "volunteers.u_g_interests", "volunteers.u_g_interests.interest", "volunteers.u_g_interests.garden",
        "managers","organization", "hero_image", "featured_gallery",
      ]
    });

    if (!entity) {
      return ctx.notFound('Garden not found');
    }

    const interests = await strapi.db.query('api::interest.interest').findMany({
      select: ['tag'],
      where: {gardens: entity.id}
    });

    entity.interests = interests;

    // db.query returns a flat v5 entity already; return it directly. (The old
    // this.transformResponse(entity) threw under v5, which the catch swallowed
    // into an empty {} body.)
    ctx.body = { data: entity };
  },
  
  async find(ctx) {
    // Handle public access (no authenticated user)
    if (!ctx.state.user) {
      // For public access, use the default core action which respects permissions
      const { data, meta } = await super.find(ctx);
      return { data, meta };
    }
    // Handle authenticated non-administrator users
    if (ctx.state.user.role.type !== 'administrator') {
      // Extract populate from query params
      let populate = ['volunteers']; // Always include volunteers
      
      if (ctx.query.populate) {
        // Handle different populate formats from Strapi query string
        if (typeof ctx.query.populate === 'string') {
          // Format: ?populate=field1,field2 or ?populate=*
          if (ctx.query.populate === '*') {
            populate = '*';
          } else {
            // Parse comma-separated string and merge with volunteers
            const requestedPopulate = ctx.query.populate.split(',').map(field => field.trim());
            populate = [...new Set([...populate, ...requestedPopulate])]; // Merge and deduplicate
          }
        } else if (Array.isArray(ctx.query.populate)) {
          // Format: ?populate[]=field1&populate[]=field2
          populate = [...new Set([...populate, ...ctx.query.populate])]; // Merge and deduplicate
        } else if (typeof ctx.query.populate === 'object') {
          // Format: ?populate[field1]=true&populate[field2]=true
          const requestedPopulate = Object.keys(ctx.query.populate);
          populate = [...new Set([...populate, ...requestedPopulate])]; // Merge and deduplicate
        }
      }
      
      // Determine filter based on manage query parameter
      // Only filter if manage=true, otherwise show all gardens
      const whereClause = ctx.query.manage === 'true' || ctx.query.manage === true
        ? { managers: ctx.state.user.id }
        : {};
      
      const gardens = await strapi.db.query('api::garden.garden').findMany({
        where: whereClause,
        populate: populate
      });

      // CAUTION: SANITIZING LOSES POPULATED
      // const sanitizedResults = await this.sanitizeOutput(gardens, ctx);
      return this.transformResponse(gardens);
    }
        
    // Calling the default core action for administrators
    const { data, meta } = await super.find(ctx);
    // some more custom logic
    meta.date = Date.now()
    meta.test = "ADMINISTRATOR STUFF YAY";

    return { data, meta };
  }
}));