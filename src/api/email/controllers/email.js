'use strict';

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@steward.garden';

function renderTemplate(template, vars) {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName || '')
    .replace(/\{\{gardenName\}\}/g, vars.gardenName || '')
    .replace(/\{\{senderName\}\}/g, vars.senderName || '');
}

module.exports = {
  async sendWelcome(ctx) {
    const sender = ctx.state.user;
    if (!sender) {
      return ctx.unauthorized('You must be logged in to send welcome emails');
    }

    const targetUserId = ctx.params.userId;
    const { gardenId, force = false, subject: customSubject, body: customBody } = ctx.request.body || {};

    // Load target user with their activeGarden
    const targetUser = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      targetUserId,
      { populate: ['activeGarden'] }
    );

    if (!targetUser) {
      return ctx.notFound('User not found');
    }

    const resolvedGardenId = gardenId || (targetUser.activeGarden && targetUser.activeGarden.id);
    if (!resolvedGardenId) {
      return ctx.badRequest('No garden specified and user has no active garden');
    }

    const garden = await strapi.entityService.findOne('api::garden.garden', resolvedGardenId);
    if (!garden) {
      return ctx.notFound('Garden not found');
    }

    // Custom subject/body override the garden template; fall back to garden template if not provided
    const rawSubject = customSubject || garden.welcome_email_subject;
    const rawBody = customBody || garden.welcome_email_body;

    if (!rawSubject || !rawBody) {
      return ctx.badRequest(
        'No email content provided and this garden has no welcome email template configured. ' +
        'Pass subject and body in the request, or add a template to the garden in the Strapi admin.'
      );
    }

    // Check for prior send to this garden
    const emailHistory = Array.isArray(targetUser.automated_emails_sent)
      ? targetUser.automated_emails_sent
      : [];
    const alreadySent = emailHistory.some(
      (e) => e.type === 'welcome' && e.garden_id === resolvedGardenId
    );

    if (alreadySent && !force) {
      return ctx.send({ alreadySent: true, message: 'Welcome email already sent. Pass force: true to resend.' });
    }

    const senderName =
      [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.email;

    const vars = {
      firstName: targetUser.firstName,
      gardenName: garden.title,
      senderName,
    };

    const subject = renderTemplate(rawSubject, vars);
    const html = renderTemplate(rawBody, vars);

    let resendMessageId;
    try {
      const result = await strapi.plugins['email'].services.email.send({
        to: targetUser.email,
        from: `${senderName} <${FROM_ADDRESS}>`,
        replyTo: sender.email,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ''),
      });
      resendMessageId = result && result.id;
    } catch (emailError) {
      strapi.log.error('[sendWelcome] Email send failed:', emailError);

      const resendErr = emailError.resendError;
      if (resendErr && (resendErr.name === 'validation_error' || resendErr.name === 'not_found')) {
        return ctx.badRequest('Invalid recipient email address');
      }
      return ctx.internalServerError('Failed to send welcome email');
    }

    // Record the send in the user's history
    const updatedHistory = [
      ...emailHistory,
      {
        type: 'welcome',
        sent_at: new Date().toISOString(),
        sender_email: sender.email,
        garden_id: resolvedGardenId,
        resend_message_id: resendMessageId || null,
      },
    ];

    await strapi.entityService.update('plugin::users-permissions.user', targetUserId, {
      data: { automated_emails_sent: updatedHistory },
    });

    strapi.log.info(
      `[sendWelcome] Welcome email sent to user ${targetUserId} for garden ${resolvedGardenId} by ${sender.email}`
    );

    return ctx.send({ success: true, alreadySent, resendMessageId });
  },
};
