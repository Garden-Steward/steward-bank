'use strict';

const UID = 'api::project-alert.project-alert';

// The routes are public, but a signed-in visitor's token still identifies them.
async function optionalUser(ctx) {
  try {
    const payload = await strapi.plugin('users-permissions').service('jwt').getToken(ctx);
    if (!payload?.id) return null;
    return await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: payload.id },
      select: ['id', 'email'],
    });
  } catch {
    return null;
  }
}

module.exports = {
  // POST /project-alerts { email?, zip? | city? }
  async subscribe(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};
    const user = await optionalUser(ctx);
    const email = body.email || user?.email;

    const result = await strapi.service(UID).subscribe({
      email,
      zip: body.zip,
      city: body.city,
      user,
    });
    if (result.error) {
      return ctx.badRequest(result.error);
    }
    // Same answer whether or not the email has an account.
    ctx.body = { subscribed: true, label: result.label };
  },

  // GET /project-alerts/unsubscribe?token=
  async unsubscribe(ctx) {
    const result = await strapi.service(UID).unsubscribe(ctx.query.token);
    if (!result) {
      return ctx.notFound('This unsubscribe link is not valid');
    }
    ctx.body = { unsubscribed: true, label: result.label };
  },
};
