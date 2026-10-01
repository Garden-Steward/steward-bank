'use strict';

const slugify = require('slugify');
const { sentryEnabled } = require('../instrument.js');
const Sentry = require('@sentry/node');

const SLUG_CONTENT_TYPES = {
  'api::blog.blog': { field: 'slug', reference: 'title' },
  'api::plant.plant': { field: 'slug', reference: 'title' },
  'api::volunteer-day.volunteer-day': { field: 'slug', reference: 'title' },
  'api::instruction.instruction': { field: 'slug', reference: 'title' },
  'api::project.project': { field: 'slug', reference: 'title' },
};

// Administrators help out on any project (many have a single lead who's new to
// Garden Steward), so they need every project endpoint a logged-in member has.
// The controllers already let `isAdmin` through; this makes sure the role's
// route permissions do too. Only adds, never removes.
const ADMIN_MIRRORED_PREFIXES = ['api::project.project.'];

async function grantAdminProjectPermissions(strapi) {
  const roles = strapi.db.query('plugin::users-permissions.role');
  const perms = strapi.db.query('plugin::users-permissions.permission');
  const [authenticated, administrator] = await Promise.all([
    roles.findOne({ where: { type: 'authenticated' }, populate: ['permissions'] }),
    roles.findOne({ where: { type: 'administrator' }, populate: ['permissions'] }),
  ]);
  if (!authenticated || !administrator) return;

  const has = new Set((administrator.permissions || []).map((p) => p.action));
  const missing = (authenticated.permissions || [])
    .map((p) => p.action)
    .filter((action) => ADMIN_MIRRORED_PREFIXES.some((prefix) => action.startsWith(prefix)) && !has.has(action));

  for (const action of missing) {
    await perms.create({ data: { action, role: administrator.id } });
  }
  if (missing.length) {
    strapi.log.info(`[bootstrap] granted Administrator: ${missing.join(', ')}`);
  }
}

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    strapi.documents.use(async (context, next) => {
      const config = SLUG_CONTENT_TYPES[context.uid];
      if (config && ['create', 'update'].includes(context.action)) {
        const data = context.params?.data;
        if (data && data[config.reference] && !data[config.field]) {
          data[config.field] = slugify(data[config.reference], { lower: true, strict: true });
        }
      }
      return next();
    });

    try {
      await grantAdminProjectPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] could not grant Administrator project permissions:', err);
    }

    if (sentryEnabled) {
      Sentry.setupKoaErrorHandler(strapi.server);
    }

    console.log('\n🌱 Initializing Garden Steward SMS services...');
    try {
      await strapi.service('api::garden.garden').initializeCache();
    } catch (err) {
      console.error('⚠️  Garden cache initialization failed:', err.message);
    }
  },
};
