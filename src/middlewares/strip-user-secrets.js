'use strict';

const { stripUserSecrets, stripOtherUsersContact } = require('../utils/user-secrets');

// Project and task pages only show the people on them by name, so their users
// carry no one else's email or phone. Garden pages and SMS campaigns, where
// managers do need contact details, aren't on this list.
const CONTACT_FREE_PREFIXES = ['/api/projects', '/api/garden-tasks'];

// Last line of defence for the REST API: custom controllers that use db.query
// skip the sanitizer, so a populated user can carry its password hash, tokens
// or login codes. Strip those from every /api JSON response, whatever built it.
module.exports = (config, { strapi }) => async (ctx, next) => {
  await next();
  if (!ctx.path.startsWith('/api/')) return;
  const body = ctx.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body) && typeof body.pipe !== 'function') {
    stripUserSecrets(strapi, body);
    const caller = ctx.state.user;
    if (caller?.role?.type !== 'administrator' && CONTACT_FREE_PREFIXES.some((p) => ctx.path.startsWith(p))) {
      stripOtherUsersContact(body, caller?.id);
    }
  }
};
