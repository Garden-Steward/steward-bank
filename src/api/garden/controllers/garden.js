'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const { mutedList } = require('../../../utils/garden-mute');

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const USER_UID = 'plugin::users-permissions.user';

// Every row of the garden behind :slug (draft and published share the slug),
// the caller with their mute list, and where they stand. A volunteer or
// manager link on either row counts.
async function loadMembership(strapi, ctx) {
  const authUser = ctx.state.user;
  if (!authUser) return { error: ctx.unauthorized('You must be logged in') };

  const { slug } = ctx.params;
  if (!SLUG_PATTERN.test(String(slug))) return { error: ctx.badRequest('Invalid garden slug') };

  const rows = await strapi.db.query('api::garden.garden').findMany({
    where: { slug: String(slug) },
    select: ['id', 'documentId'],
    populate: { volunteers: { select: ['id'] }, managers: { select: ['id'] } },
  });
  if (!rows.length) return { error: ctx.notFound('Garden not found') };

  const user = await strapi.db.query(USER_UID).findOne({
    where: { id: authUser.id },
    select: ['id', 'muted_gardens'],
    populate: { activeGarden: { select: ['id'] } },
  });
  const garden = rows[0];
  const inList = (key) => rows.some((r) => (r[key] || []).some((u) => u.id === user.id));
  return {
    user,
    garden,
    rows,
    state: {
      member: inList('volunteers'),
      manager: inList('managers'),
      muted: mutedList(user).includes(garden.documentId),
    },
  };
}

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

  // The signed-in user's standing with a garden, for the garden page's
  // member menu: { member, manager, muted }.
  async membership(ctx) {
    const found = await loadMembership(strapi, ctx);
    if (found.error) return found.error;
    ctx.set('Cache-Control', 'no-store');
    return { data: found.state };
  },

  // Stop (or resume) this garden's group texts without leaving it.
  async setMute(ctx) {
    const found = await loadMembership(strapi, ctx);
    if (found.error) return found.error;
    const { user, garden, state } = found;
    if (!state.member && !state.manager) return ctx.badRequest("You're not a member of this garden");

    const body = ctx.request.body?.data || ctx.request.body || {};
    if (typeof body.muted !== 'boolean') return ctx.badRequest('muted must be true or false');

    const others = mutedList(user).filter((d) => d !== garden.documentId);
    await strapi.db.query(USER_UID).update({
      where: { id: user.id },
      data: { muted_gardens: body.muted ? [...others, garden.documentId] : others },
    });
    ctx.set('Cache-Control', 'no-store');
    return { data: { ...state, muted: body.muted } };
  },

  // Leave a garden: off its volunteer list, its interest groups and its mute
  // list. Managers have to be removed by another manager first, so a garden
  // can't be left without anyone running it by accident.
  async leave(ctx) {
    const found = await loadMembership(strapi, ctx);
    if (found.error) return found.error;
    const { user, garden, rows, state } = found;
    if (state.manager) return ctx.badRequest("Managers can't leave their garden from here. Ask another manager to remove you.");
    if (!state.member) return ctx.badRequest("You're not a member of this garden");

    const rowIds = rows.map((r) => r.id);
    for (const id of rowIds) {
      await strapi.db.query('api::garden.garden').update({
        where: { id },
        data: { volunteers: { disconnect: [user.id] } },
      });
    }
    await strapi.db.query('api::user-garden-interest.user-garden-interest').deleteMany({
      where: { user: user.id, garden: { id: { $in: rowIds } } },
    });

    const data = { muted_gardens: mutedList(user).filter((d) => d !== garden.documentId) };
    if (user.activeGarden && rowIds.includes(user.activeGarden.id)) data.activeGarden = null;
    await strapi.db.query(USER_UID).update({ where: { id: user.id }, data });

    ctx.set('Cache-Control', 'no-store');
    return { data: { member: false, manager: false, muted: false } };
  },

  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    const entity = await strapi.db.query('api::garden.garden').findOne({
      where: {slug: ctx.params.slug},
      populate: [
        "recurring_tasks",
        "volunteers", "volunteers.role", "volunteers.u_g_interests", "volunteers.u_g_interests.interest", "volunteers.u_g_interests.garden",
        "managers","organization", "hero_image", "featured_gallery", "visit_info",
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

    // db.query skips the REST sanitizer, so populated users arrive with every
    // column. This route serves the public garden page: never send password
    // hashes, reset/verification tokens or login codes. Every attribute the
    // user schema marks private is dropped, plus the core auth secrets.
    const userModel = strapi.getModel('plugin::users-permissions.user');
    const secretFields = new Set([
      'password', 'resetPasswordToken', 'confirmationToken',
      ...Object.entries(userModel?.attributes || {}).filter(([, a]) => a.private).map(([k]) => k),
    ]);
    const stripSecrets = (u) => {
      if (!u || typeof u !== 'object') return u;
      secretFields.forEach((f) => { delete u[f]; });
      return u;
    };
    (entity.volunteers || []).forEach(stripSecrets);
    (entity.managers || []).forEach(stripSecrets);

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