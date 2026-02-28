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
      console.log('[VacationCheckIn] Starting weekly vacation check-in...');
      
      // Find all paused users
      const pausedUsers = await strapi.db.query("plugin::users-permissions.user").findMany({
        where: {
          paused: true,
          paused_at: { $ne: null }
        },
        select: ['id', 'firstName', 'phone_number', 'paused_at', 'last_vacation_check_sent']
      });
      
      console.log(`[VacationCheckIn] Found ${pausedUsers.length} paused users`);
      
      const now = new Date();
      let messagesCount = 0;
      
      for (const user of pausedUsers) {
        const daysPaused = differenceInDays(now, new Date(user.paused_at));
        const lastCheckSent = user.last_vacation_check_sent ? new Date(user.last_vacation_check_sent) : null;
        const daysSinceLastCheck = lastCheckSent ? differenceInDays(now, lastCheckSent) : null;
        
        // Check if paused >14 days AND (never been sent check OR sent >7 days ago)
        if (daysPaused > 14 && (!lastCheckSent || daysSinceLastCheck >= 7)) {
          console.log(`[VacationCheckIn] Sending check-in to ${user.firstName} (paused ${daysPaused} days)`);
          
          // Send SMS via sendSms service
          const smsBody = `Hi ${user.firstName}! Just checking in...\n\nWe noticed you've been on vacation for ${daysPaused} days.\n\nText BACK or VACATION to update your status. If you're still on vacation, just ignore this message!`;
          
          try {
            await strapi.service('api::sms.sms').sendSms(user.phone_number, smsBody);
            
            // Update last_vacation_check_sent timestamp
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: user.id },
              data: { last_vacation_check_sent: now }
            });
            
            messagesCount++;
            console.log(`[VacationCheckIn] ✅ Check-in sent to ${user.phone_number}`);
          } catch (err) {
            console.error(`[VacationCheckIn] Error sending SMS to ${user.phone_number}:`, err);
          }
        }
      }
      
      console.log(`[VacationCheckIn] ✅ Weekly check-in complete. Sent ${messagesCount} messages.`);
      return {
        success: true,
        pausedUsersTotal: pausedUsers.length,
        messagesCheckedIn: messagesCount
      };
      
    } catch (err) {
      console.error('[VacationCheckIn] Error in sendVacationCheckIns:', err);
      throw err;
    }
  }
};
