'use strict';

const REQUEST_OK_BODY = Object.freeze({
  ok: true,
  message: 'If that number belongs to a Garden Steward account, a login code has been sent.',
  resendAfterSeconds: 60,
  expiresInSeconds: 600,
});
const VERIFY_FAIL_MESSAGE = 'Invalid or expired code';

module.exports = ({ strapi }) => ({
  async request(ctx) {
    const { phoneNumber } = ctx.request.body || {};
    const result = await strapi.service('api::auth.sms-login').requestCode(phoneNumber);
    if (result.invalid) {
      return ctx.badRequest(result.message);
    }
    ctx.status = 200;
    ctx.body = { ...REQUEST_OK_BODY };
  },

  async verify(ctx) {
    const { phoneNumber, code } = ctx.request.body || {};
    const result = await strapi.service('api::auth.sms-login').verifyCode(phoneNumber, code);
    if (!result.ok) {
      return ctx.badRequest(VERIFY_FAIL_MESSAGE);
    }
    const userSchema = strapi.getModel('plugin::users-permissions.user');
    const user = await strapi.contentAPI.sanitize.output(result.user, userSchema, { auth: ctx.state.auth });
    ctx.status = 200;
    ctx.body = { jwt: result.jwt, user };
  },
});
