'use strict';

/**
 * registration-followup service.
 *
 * A volunteer who texts a garden name gets an account with the placeholder
 * email test@test.com and is asked for their real email. If they never reply,
 * we nudge them once, 30 minutes later. Their reply goes through the normal
 * sign-up flow in the message controller (email, then name if we lack it).
 */

const PLACEHOLDER_EMAIL = 'test@test.com';
const FOLLOWUP_DELAY_MINUTES = 30;
// Only nudge recent sign-ups, so this never texts everyone who stalled before
// the feature existed.
const FOLLOWUP_WINDOW_HOURS = 24;

const FOLLOWUP_BODY = "We love to use email for more regular reminders and notifications 💌 Please consider replying with your email so we can finish signing you up! 🌱";

module.exports = {
  FOLLOWUP_BODY,

  sendRegistrationFollowUps: async () => {
    const now = Date.now();
    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
      where: {
        email: PLACEHOLDER_EMAIL,
        phoneNumber: { $notNull: true },
        registration_followup_sent_at: { $null: true },
        sms_opted_out_at: { $null: true },
        createdAt: {
          $lte: new Date(now - FOLLOWUP_DELAY_MINUTES * 60 * 1000),
          $gte: new Date(now - FOLLOWUP_WINDOW_HOURS * 60 * 60 * 1000),
        },
      },
      populate: { activeGarden: true },
    });

    let sent = 0;
    for (const user of users) {
      try {
        // Mark first so a slow or failed send can never cause a second text.
        await strapi.db.query('plugin::users-permissions.user').update({
          where: { id: user.id },
          data: { registration_followup_sent_at: new Date() },
        });
        await strapi.service('api::sms.sms').handleSms({
          task: null,
          body: FOLLOWUP_BODY,
          type: 'registration',
          previous: null,
          user,
        });
        sent++;
      } catch (err) {
        strapi.log.error(`[RegistrationFollowUp] Failed for user ${user.id}: `, err);
      }
    }

    if (users.length) {
      strapi.log.info(`[RegistrationFollowUp] Sent ${sent} of ${users.length} email follow-ups`);
    }
    return { found: users.length, sent };
  },
};
