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
const MEMBER_ACTIONS = [
  'api::garden.garden.membership',
  'api::garden.garden.setMute',
  'api::garden.garden.leave',
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

// User routes a signed-out caller must never reach: they list every user's
// email and phone, or edit any account. Signing up and logging in go through
// the auth routes, not these. Permissions live in the DB, so this runs at boot
// to close them in every environment, whatever the admin panel says.
const PUBLIC_REVOKED_ACTIONS = [
  'plugin::users-permissions.user.find',
  'plugin::users-permissions.user.findOne',
  'plugin::users-permissions.user.count',
  'plugin::users-permissions.user.create',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy',
];

async function revokePublicUserPermissions(strapi) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
    populate: ['permissions'],
  });
  if (!role) return;

  const granted = (role.permissions || []).filter((p) => PUBLIC_REVOKED_ACTIONS.includes(p.action));
  if (!granted.length) return;
  // delete (not deleteMany) so the role link rows go too.
  const perms = strapi.db.query('plugin::users-permissions.permission');
  for (const p of granted) {
    await perms.delete({ where: { id: p.id } });
  }
  strapi.log.info(`[bootstrap] revoked Public: ${granted.map((p) => p.action).join(', ')}`);
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

    // Every new garden gets an organization (SMS billing attribution). Logic in api::billing.coverage.
    strapi.documents.use((context, next) => strapi.service('api::billing.coverage').provisionForGardenCreate(context, next));

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
      await revokePublicUserPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] could not revoke Public user permissions:', err);
    }

    // Recurring-template events used to be inserted as a published row only;
    // give those the draft row an edit needs so a save can't strip relations.
    try {
      const created = await backfillDrafts('api::volunteer-day.volunteer-day');
      if (created) strapi.log.info(`[bootstrap] created ${created} missing volunteer-day drafts`);
    } catch (err) {
      strapi.log.error('[bootstrap] volunteer-day draft backfill failed:', err);
    }

    // Ledger indexes (CREATE INDEX IF NOT EXISTS). Never blocks boot.
    try {
      await strapi.service('api::billing.usage').ensureIndexes();
    } catch (err) {
      strapi.log.error('[bootstrap] sms_usages index step failed:', err);
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
