'use strict';

const Helper = require('./helpers/cron-helper.js');
const Weather = require('./helpers/weather.js');
const Mapping = require('./helpers/mapping.js');

//https://crontab.guru/#0_7_*_*_*/1

module.exports = {
  /**
  * Cron job with timezone example.
  * Every Monday at 1am for Asia/Dhaka timezone.
  * List of valid timezones: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List
  */

  /**“At minute 0 past every 3rd hour from 1 through 23.” */
  '0 1/3 * * *': async () => {
    // '1/1 * * * *': async () => {
    Weather.runWeatherCron();
  },

  '0 1/1 * * *': async () => {
  // '1/2 * * * *': async () => {
    // await Mapping.updateGoogleMap();
  },

  /** Create Tasks from Recurring Tasks - add Scheduler Volunteers if any */
  /** 7 was midnight 14 should be 7am */
  '0 14 * * */1': async () => {
    // '1/1 * * * *': async () => {
    const recurringTasks = await strapi.service('api::recurring-task.recurring-task').getRecurringTaskGarden();
    let curTask, recTask;
    try {
      console.log('recurringTasks cronned count: ', recurringTasks.length);
      for (recTask of recurringTasks) {

        await Helper.setWeeklySchedule(recTask);

        // If at least one of this type of recurring task is Initialized, skip
        curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);

        /** SCHEDULER */
        let scheduledUser = await Helper.getScheduledVolunteer(recTask);

        await Helper.buildSchedulerTask(curTask, recTask, scheduledUser);

      }
    } catch (err) {
      console.error(err);
    }
  },

  taskReminders: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering taskReminders cron');
      try {
        await Helper.handleInitialTasks();

        await Helper.handleStartedTasks();
      } catch (err) {
        console.log("ERR taskReminders: ", err);
      }

    },
    options: {
      // rule: '1/1 * * * *',
      rule: '2 1/2 * * *',
      tz: 'America/Los_Angeles',
    },
  },

  sendVolunteerReminder: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering sendVolunteerReminder cron');
      try {
        await Helper.handleVolunteerReminders();
      } catch (err) {
        console.log("ERR sendVolunteerReminder: ", err);
      }

    },
    options: {
      //  rule: '1/1 * * * *',
      rule: '5 8 * * *',
      tz: 'America/Los_Angeles',
    },
  },

  /**
   * Send 24-hour poll reminders to non-voters when a poll closes within the next 24-25 hours.
   * Runs every hour; a 2-hour window prevents double-sending.
   */
  pollReminders: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering pollReminders cron');
      try {
        const result = await strapi.service('api::sms-campaign.sms-campaign').sendPollReminders();
        strapi.log.info(`pollReminders: processed ${result.remindersProcessed} campaign(s)`);
      } catch (err) {
        console.error('ERR pollReminders:', err);
      }
    },
    options: {
      rule: '0 * * * *',           // every hour on the hour
      tz: 'America/Los_Angeles',
    },
  },

  /**
   * Auto-close polls whose closes_at has passed.
   * Runs at :31 past the hour — offset from pollReminders to avoid racing.
   * closePoll is idempotent so overlap is safe.
   */
  pollAutoClose: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering pollAutoClose cron');
      try {
        const result = await strapi.service('api::sms-campaign.sms-campaign').autoCloseExpiredPolls();
        strapi.log.info(`pollAutoClose: closed ${result.closed} poll(s)`);
      } catch (err) {
        console.error('ERR pollAutoClose:', err);
      }
    },
    options: {
      rule: '31 * * * *',          // :31 past every hour
      tz: 'America/Los_Angeles',
    },
  },

  /**
   * Process Recurring Event Templates
   * Runs daily at 2am Pacific time to maintain future event instances.
   * Creates new volunteer-day entries from active recurring templates
   * to ensure each template has up to max_future_instances scheduled.
   */
  processRecurringEvents: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering processRecurringEvents cron');
      try {
        const summary = await strapi.service('api::recurring-event-template.recurring-event-template').processAllTemplates();
        strapi.log.info(`processRecurringEvents complete: ${summary.totalCreated} instances created from ${summary.totalTemplates} templates`);
      } catch (err) {
        strapi.log.error('ERR processRecurringEvents: ', err);
      }
    },
    options: {
      // Run daily at 2am Pacific time
      rule: '0 2 * * *',
      tz: 'America/Los_Angeles',
    },
  },

  /**
   * Weekly Vacation Check-in
   * Runs every Sunday at 9am Pacific time.
   * Sends check-in messages to users paused >14 days
   */
  weeklyVacationCheckIn: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering weeklyVacationCheckIn cron');
      try {
        const { differenceInDays } = require('date-fns');
        
        // Find all paused users
        const pausedUsers = await strapi.db.query("plugin::users-permissions.user").findMany({
          where: {
            paused: true,
            paused_at: { $ne: null }
          },
          select: ['id', 'firstName', 'phone_number', 'paused_at', 'last_vacation_check_sent']
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
              strapi.log.info(`[VacationCheckIn] ✅ Check-in sent to ${user.phone_number}`);
            } catch (err) {
              strapi.log.error(`[VacationCheckIn] Error sending SMS to ${user.phone_number}:`, err);
            }
          }
        }
        
        strapi.log.info(`[VacationCheckIn] ✅ Weekly check-in complete. Sent ${messagesCount} messages.`);
      } catch (err) {
        strapi.log.error('ERR weeklyVacationCheckIn: ', err);
      }
    },
    options: {
      // Run every Sunday at 9am Pacific time
      rule: '0 9 * * 0',
      tz: 'America/Los_Angeles',
    },
  },
};