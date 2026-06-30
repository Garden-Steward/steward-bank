'use strict';

const Helper = require('./helpers/cron-helper.js');
const Weather = require('./helpers/weather.js');

module.exports = {
  weatherUpdate: {
    task: async ({ strapi }) => {
      Weather.runWeatherCron();
    },
    options: {
      rule: '0 1/3 * * *',
    },
  },

  createRecurringTasks: {
    task: async ({ strapi }) => {
      const recurringTasks = await strapi.service('api::recurring-task.recurring-task').getRecurringTaskGarden();
      let curTask, recTask;
      try {
        console.log('recurringTasks cronned count: ', recurringTasks.length);
        for (recTask of recurringTasks) {

          await Helper.setWeeklySchedule(recTask);

          curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);

          let scheduledUser = await Helper.getScheduledVolunteer(recTask);

          await Helper.buildSchedulerTask(curTask, recTask, scheduledUser);

        }
      } catch (err) {
        console.error(err);
      }
    },
    options: {
      rule: '0 14 * * */1',
    },
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
      rule: '5 8 * * *',
      tz: 'America/Los_Angeles',
    },
  },

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
      rule: '0 * * * *',
      tz: 'America/Los_Angeles',
    },
  },

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
      rule: '31 * * * *',
      tz: 'America/Los_Angeles',
    },
  },

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
      rule: '0 2 * * *',
      tz: 'America/Los_Angeles',
    },
  },

  weeklyVacationCheckIn: {
    task: async ({ strapi }) => {
      strapi.log.info('triggering weeklyVacationCheckIn cron');
      try {
        const { differenceInDays } = require('date-fns');

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

          if (daysPaused > 14 && (!lastCheckSent || daysSinceLastCheck >= 7)) {
            strapi.log.info(`[VacationCheckIn] Sending check-in to ${user.firstName} (paused ${daysPaused} days)`);

            const smsBody = `Hi ${user.firstName}! Just checking in...\n\nWe noticed you've been on vacation for ${daysPaused} days.\n\nText BACK or VACATION to update your status. If you're still on vacation, just ignore this message!`;

            try {
              await strapi.service('api::sms.sms').sendSms(user.phone_number, smsBody);

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
      rule: '0 9 * * 0',
      tz: 'America/Los_Angeles',
    },
  },
};
