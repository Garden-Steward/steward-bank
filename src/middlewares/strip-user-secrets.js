'use strict';

const { stripUserSecrets } = require('../utils/user-secrets');

// Last line of defence for the REST API: custom controllers that use db.query
// skip the sanitizer, so a populated user can carry its password hash, tokens
// or login codes. Strip those from every /api JSON response, whatever built it.
module.exports = (config, { strapi }) => async (ctx, next) => {
  await next();
  if (!ctx.path.startsWith('/api/')) return;
  const body = ctx.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body) && typeof body.pipe !== 'function') {
    stripUserSecrets(strapi, body);
  }
};
