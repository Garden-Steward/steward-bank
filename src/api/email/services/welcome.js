'use strict';

/**
 * Garden welcome emails.
 *
 * `sendOnJoin` goes out automatically when a volunteer finishes signing up,
 * when a user's email is first set (see `onEmailSet`), or when an existing
 * volunteer joins another garden. `send` is the shared
 * worker, also used by the manual POST /email/send-welcome/:userId route,
 * which can override the subject/body and resend with `force`.
 *
 * Each send is recorded in the user's `automated_emails_sent`, and a garden's
 * welcome only goes out once per user unless forced.
 */

const { WELCOME_EMAIL } = require('../defaultTemplates');

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@steward.garden';
const DEFAULT_SENDER_NAME = 'The Garden Steward Team';
// SMS sign-ups start with this placeholder until the volunteer texts their email.
const PLACEHOLDER_EMAIL = 'test@test.com';

class WelcomeEmailError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function renderTemplate(template, vars) {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName || 'there')
    .replace(/\{\{gardenName\}\}/g, vars.gardenName || '')
    .replace(/\{\{senderName\}\}/g, vars.senderName || '');
}

const hasRealEmail = (email) => Boolean(email) && email !== PLACEHOLDER_EMAIL;

const fullName = (person) => [person.firstName, person.lastName].filter(Boolean).join(' ');

module.exports = ({ strapi }) => ({
  /**
   * Send a garden's welcome email to a user.
   *
   * @param {object} opts
   * @param {number} opts.userId
   * @param {number} [opts.gardenId]  defaults to the user's active garden
   * @param {object} [opts.sender]    the person sending; defaults to the garden's first manager
   * @param {boolean} [opts.force]    resend even if this garden's welcome already went out
   * @param {string} [opts.subject]   overrides the garden template
   * @param {string} [opts.body]      overrides the garden template
   * @returns {Promise<{sent: boolean, alreadySent: boolean, resendMessageId?: string}>}
   * @throws {WelcomeEmailError}
   */
  async send({ userId, gardenId, sender, force = false, subject: customSubject, body: customBody }) {
    const userQuery = strapi.db.query('plugin::users-permissions.user');
    const targetUser = await userQuery.findOne({ where: { id: userId }, populate: ['activeGarden'] });
    if (!targetUser) {
      throw new WelcomeEmailError('USER_NOT_FOUND', 'User not found');
    }
    if (!hasRealEmail(targetUser.email)) {
      throw new WelcomeEmailError('NO_EMAIL', 'User has no email address yet');
    }

    const resolvedGardenId = gardenId || targetUser.activeGarden?.id;
    if (!resolvedGardenId) {
      throw new WelcomeEmailError('NO_GARDEN', 'No garden specified and user has no active garden');
    }
    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { id: resolvedGardenId },
      populate: ['managers'],
    });
    if (!garden) {
      throw new WelcomeEmailError('GARDEN_NOT_FOUND', 'Garden not found');
    }

    const emailHistory = Array.isArray(targetUser.automated_emails_sent) ? targetUser.automated_emails_sent : [];
    const alreadySent = emailHistory.some((e) => e.type === 'welcome' && e.garden_id === garden.id);
    if (alreadySent && !force) {
      return { sent: false, alreadySent: true };
    }

    // Replies go to a real person: whoever sent it, else one of the garden's managers.
    const replyPerson = sender || (garden.managers || []).find((m) => m.email && m.id !== targetUser.id);
    const senderName = (replyPerson && (fullName(replyPerson) || replyPerson.email)) || DEFAULT_SENDER_NAME;

    const vars = { firstName: targetUser.firstName, gardenName: garden.title, senderName };
    const subject = renderTemplate(customSubject || garden.welcome_email_subject || WELCOME_EMAIL.subject, vars);
    const html = renderTemplate(customBody || garden.welcome_email_body || WELCOME_EMAIL.body, vars);

    let resendMessageId;
    try {
      const result = await strapi.plugins['email'].services.email.send({
        to: targetUser.email,
        from: `${senderName} <${FROM_ADDRESS}>`,
        ...(replyPerson?.email ? { replyTo: replyPerson.email } : {}),
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ''),
      });
      resendMessageId = result && result.id;
    } catch (emailError) {
      const resendErr = emailError.resendError;
      if (resendErr && (resendErr.name === 'validation_error' || resendErr.name === 'not_found')) {
        throw new WelcomeEmailError('INVALID_RECIPIENT', 'Invalid recipient email address');
      }
      strapi.log.error('[welcome email] send failed:', emailError);
      throw new WelcomeEmailError('SEND_FAILED', 'Failed to send welcome email');
    }

    await userQuery.update({
      where: { id: targetUser.id },
      data: {
        automated_emails_sent: [
          ...emailHistory,
          {
            type: 'welcome',
            sent_at: new Date().toISOString(),
            sender_email: sender ? sender.email : null,
            automatic: !sender,
            garden_id: garden.id,
            resend_message_id: resendMessageId || null,
          },
        ],
      },
    });

    strapi.log.info(
      `[welcome email] sent to user ${targetUser.id} for garden ${garden.id}` +
        (sender ? ` by ${sender.email}` : ' automatically on join')
    );
    return { sent: true, alreadySent, resendMessageId };
  },

  /**
   * Automatic welcome when a volunteer joins a garden. Never throws: a failed
   * email must not break the sign-up flow that triggered it.
   */
  async sendOnJoin(userId, gardenId) {
    try {
      return await this.send({ userId, gardenId });
    } catch (err) {
      // Not ready yet: it goes out once they have an email and a garden.
      if (err.code === 'NO_EMAIL' || err.code === 'NO_GARDEN') return { sent: false };
      strapi.log.warn(`[welcome email] automatic send for user ${userId} skipped: ${err.message}`);
      return { sent: false, error: err.code || err.message };
    }
  },

  /**
   * Called from the user lifecycle whenever a user gets a real email for the
   * first time, wherever it was set (SMS, web app, admin panel). Many
   * volunteers signed up by phone only and add an email much later.
   */
  onEmailSet(user) {
    if (!hasRealEmail(user.email)) return;
    // Mid SMS sign-up (no name yet): the name step sends it, so it can say hi by name.
    if (!user.firstName && user.username === user.phoneNumber) return;
    // Fire-and-forget: never hold up or fail the save that set the email.
    Promise.resolve()
      .then(() => this.sendOnJoin(user.id))
      .catch((err) => strapi.log.error(`[welcome email] on email set for user ${user.id} failed:`, err));
  },

  hasRealEmail,
  WelcomeEmailError,
});
