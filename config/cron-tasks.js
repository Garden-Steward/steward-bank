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
      console.log('recurringTasks cronned count: ', recurringTasks.length);
      for (const recTask of recurringTasks) {
        try {
          await Helper.setWeeklySchedule(recTask);

          const curTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);

          let scheduledUser = await Helper.getScheduledVolunteer(recTask);

          await Helper.buildSchedulerTask(curTask, recTask, scheduledUser);
        } catch (err) {
          console.error(`createRecurringTasks: failed for recurring task ${recTask.id}`, err);
        }
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
        await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();
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
