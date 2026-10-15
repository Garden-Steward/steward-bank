'use strict';

const ERROR_RESPONSES = {
  USER_NOT_FOUND: 'notFound',
  GARDEN_NOT_FOUND: 'notFound',
  NO_GARDEN: 'badRequest',
  NO_EMAIL: 'badRequest',
  INVALID_RECIPIENT: 'badRequest',
};

module.exports = {
  async sendWelcome(ctx) {
    const sender = ctx.state.user;
    if (!sender) {
      return ctx.unauthorized('You must be logged in to send welcome emails');
    }

    const { gardenId, force = false, subject, body } = ctx.request.body || {};

    try {
      const result = await strapi.service('api::email.welcome').send({
        userId: ctx.params.userId,
        gardenId,
        sender,
        force,
        subject,
        body,
      });

      if (!result.sent) {
        return ctx.send({ alreadySent: true, message: 'Welcome email already sent. Pass force: true to resend.' });
      }
      return ctx.send({ success: true, alreadySent: result.alreadySent, resendMessageId: result.resendMessageId });
    } catch (err) {
      const respond = ERROR_RESPONSES[err.code];
      if (respond) {
        return ctx[respond](err.message);
      }
      strapi.log.error('[sendWelcome] failed:', err);
      return ctx.internalServerError('Failed to send welcome email');
    }
  },
};
