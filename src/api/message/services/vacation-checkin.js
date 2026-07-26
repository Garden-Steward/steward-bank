'use strict';

/**
 * vacation-checkin service.
 * Sends weekly check-in messages to users who have been paused for >14 days
 */

const { differenceInDays } = require('date-fns');

module.exports = {
  /**
   * Check for users paused >14 days and send vacation check-in
   */
  sendVacationCheckIns: async () => {
    try {
      strapi.log.info('[VacationCheckIn] Starting weekly vacation check-in...');

      // Find all paused users
      const pausedUsers = await strapi.db.query("plugin::users-permissions.user").findMany({
        where: {
          paused: true,
          paused_at: { $ne: null }
        },
        select: ['id', 'firstName', 'phoneNumber', 'paused_at', 'last_vacation_check_sent', 'vacation_reminder_count'],
        populate: { gardens: { select: ['title'] } }
      });

      strapi.log.info(`[VacationCheckIn] Found ${pausedUsers.length} paused users`);

      const now = new Date();
      let messagesCount = 0;

      for (const user of pausedUsers) {
        const daysPaused = differenceInDays(now, new Date(user.paused_at));
        const lastCheckSent = user.last_vacation_check_sent ? new Date(user.last_vacation_check_sent) : null;
        const daysSinceLastCheck = lastCheckSent ? differenceInDays(now, lastCheckSent) : null;

        // Check if paused >14 days AND (never been sent check OR sent >7 days ago)
        if (daysPaused > 14 && (!lastCheckSent || daysSinceLastCheck >= 7)) {
          strapi.log.info(`[VacationCheckIn] Sending check-in to ${user.firstName} (paused ${daysPaused} days)`);

          const newCount = (user.vacation_reminder_count || 0) + 1;
          const gardenTitles = (user.gardens || []).map(g => g.title).filter(Boolean);
          const gardenList = gardenTitles.length ? ` for ${gardenTitles.join(', ')}` : '';
          let smsBody = `Hi ${user.firstName}! You're still on vacation and paused from watering and other recurring schedules${gardenList}. Reply BACK once you're back and we'll add you to your schedules again.`;
          if (newCount >= 2) {
            smsBody += `\n\nIf you no longer want the responsibility of being in this task please let a Garden Manager know so you can be quickly removed, instead of feigning vacation :)`;
          }

          try {
            await strapi.service('api::sms.sms').sendSms(user.phoneNumber, smsBody);

            // Update last_vacation_check_sent timestamp and reminder counter (only on send success)
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: user.id },
              data: { last_vacation_check_sent: now, vacation_reminder_count: newCount }
            });

            messagesCount++;
            strapi.log.info(`[VacationCheckIn] Check-in sent to ${user.phoneNumber}`);
          } catch (err) {
            strapi.log.error(`[VacationCheckIn] Error sending SMS for user ${user.id}: `, err);
          }
        }
      }

      strapi.log.info(`[VacationCheckIn] Weekly check-in complete. Sent ${messagesCount} messages.`);
      return {
        success: true,
        pausedUsersTotal: pausedUsers.length,
        messagesCheckedIn: messagesCount
      };

    } catch (err) {
      strapi.log.error('[VacationCheckIn] Error in sendVacationCheckIns:', err);
      throw err;
    }
  }
};
