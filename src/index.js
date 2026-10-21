'use strict';

const slugify = require('slugify');
const { sentryEnabled } = require('../instrument.js');
const Sentry = require('@sentry/node');
const { backfillDrafts } = require('./utils/documents');

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

// Routes every signed-in member needs whatever role they have. Granted at boot
// so a deploy doesn't wait on someone ticking boxes in the admin panel. Only
// adds, never removes.
// user.find isn't for the route (the users-permissions extension refuses
// GET /users to non-admins): the REST sanitizer needs it to let populated or
// filtered user relations (project managers, task volunteers) through.
const MEMBER_ACTIONS = [
  'api::garden.garden.membership',
  'api::garden.garden.setMute',
  'api::garden.garden.leave',
  'plugin::users-permissions.user.find',
];

async function grantMemberPermissions(strapi) {
  const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
    where: { type: { $in: ['authenticated', 'administrator'] } },
    populate: ['permissions'],
  });
  const perms = strapi.db.query('plugin::users-permissions.permission');
  for (const role of roles) {
    const has = new Set((role.permissions || []).map((p) => p.action));
    const missing = MEMBER_ACTIONS.filter((action) => !has.has(action));
    for (const action of missing) {
      await perms.create({ data: { action, role: role.id } });
    }
    if (missing.length) strapi.log.info(`[bootstrap] granted ${role.type}: ${missing.join(', ')}`);
  }
}

// Core user routes list every user's email and phone, and PUT /users/:id has
// no ownership check, so whoever holds `update` can edit any account. Signing
// up and logging in go through the auth routes, and the web app only reads
// /users/me, which stays. Members keep user.find for the sanitizer (see
// MEMBER_ACTIONS); the route itself is refused in the users-permissions
// extension. Administrators keep the reads (seed scripts look users up) but
// not the writes: account edits go through the admin panel. API tokens
// (plant-bot) skip roles, so they're unaffected. Permissions live in the DB,
// so this runs at boot to close them in every environment, whatever the admin
// panel or scripts/seed-auth-permissions.js says.
const USER_WRITE_ACTIONS = [
  'plugin::users-permissions.user.create',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy',
];
const REVOKED_USER_ACTIONS = {
  public: [
    'plugin::users-permissions.user.find',
    'plugin::users-permissions.user.findOne',
    'plugin::users-permissions.user.count',
    ...USER_WRITE_ACTIONS,
  ],
  authenticated: [
    'plugin::users-permissions.user.findOne',
    'plugin::users-permissions.user.count',
    ...USER_WRITE_ACTIONS,
  ],
  administrator: USER_WRITE_ACTIONS,
};

async function revokeUserPermissions(strapi) {
  const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
    where: { type: { $in: Object.keys(REVOKED_USER_ACTIONS) } },
    populate: ['permissions'],
  });
  const perms = strapi.db.query('plugin::users-permissions.permission');
  for (const role of roles) {
    const revoked = REVOKED_USER_ACTIONS[role.type];
    const granted = (role.permissions || []).filter((p) => revoked.includes(p.action));
    if (!granted.length) continue;
    // delete (not deleteMany) so the role link rows go too.
    for (const p of granted) {
      await perms.delete({ where: { id: p.id } });
    }
    strapi.log.info(`[bootstrap] revoked ${role.type}: ${granted.map((p) => p.action).join(', ')}`);
  }
}

// Send the garden welcome email the first time a user gets a real email,
// whichever path set it. Users created by SMS start with a placeholder email.
function subscribeWelcomeEmailOnEmailSet(strapi) {
  const USER_UID = 'plugin::users-permissions.user';
  const welcome = () => strapi.service('api::email.welcome');

  strapi.db.lifecycles.subscribe({
    models: [USER_UID],

    afterCreate(event) {
      // No garden yet means nothing to welcome them to: skip the lookups.
      if (event.result && event.params?.data?.activeGarden) welcome().onEmailSet(event.result);
    },

    async beforeUpdate(event) {
      if (!event.params?.data?.email) return;
      const before = await strapi.db.query(USER_UID).findMany({
        where: event.params.where,
        select: ['id', 'email'],
      });
      event.state.hadRealEmail = new Map(before.map((u) => [u.id, welcome().hasRealEmail(u.email)]));
    },

    afterUpdate(event) {
      const { result, state } = event;
      if (!state.hadRealEmail || !result || state.hadRealEmail.get(result.id) !== false) return;
      welcome().onEmailSet(result);
    },
  });
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

    subscribeWelcomeEmailOnEmailSet(strapi);

    try {
      await grantAdminProjectPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] could not grant Administrator project permissions:', err);
    }

    try {
      await grantMemberPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] could not grant garden membership permissions:', err);
    }

    try {
      await revokeUserPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] could not revoke user permissions:', err);
    }

    // Recurring-template events used to be inserted as a published row only;
    // give those the draft row an edit needs so a save can't strip relations.
    try {
      const created = await backfillDrafts('api::volunteer-day.volunteer-day');
      if (created) strapi.log.info(`[bootstrap] created ${created} missing volunteer-day drafts`);
    } catch (err) {
      strapi.log.error('[bootstrap] volunteer-day draft backfill failed:', err);
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
