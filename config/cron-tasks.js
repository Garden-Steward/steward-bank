'use strict';

const Helper = require('./helpers/cron-helper.js');
const Weather = require('./helpers/weather.js');

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

  /** Create Tasks from Recurring Tasks - add Scheduler Volunteers if any */
  '0 7 * * */1': async () => {
  // '1/1 * * * *': async () => {
    const recurringTasks = await strapi.service('api::recurring-task.recurring-task').getRecurringTaskGarden();
    let curTask, recTask;
    try {
      console.log('recurringTasks cronned count: ', recurringTasks.length);
      for (recTask of recurringTasks) {
        // If at least one of this type of recurring task is Initialized, skip
        curTask = await strapi.db.query('api::garden-task.garden-task').findOne({
          where: {
            status:{$notIn: ['FINISHED', 'SKIPPED', 'ABANDONED']}, //$notIn: ['Hello', 'Hola', 'Bonjour']
            recurring_task: recTask.id, 
            garden:recTask.garden
          },
          populate: { recurring_task: true, volunteers:true }
        });

        /** SCHEDULER */

        let scheduledUser = await Helper.getScheduledVolunteer(recTask);

        await Helper.buildSchedulerTask(curTask, recTask, scheduledUser);

      }
    } catch (err) {
      console.error(err);
    }
  },
 
  taskReminders: {
    task: async({ strapi }) => {
      strapi.log.info('triggering taskReminders cron');
      try {
        await Helper.handleInitialTasks();
    
        await Helper.handleStartedTasks();
      } catch (err) {
        console.log("ERR taskReminders: ", err);
      }
  
    },
    options: {
      //  rule: '1/1 * * * *',
       rule: '2 1/2 * * *',
       tz: 'America/Los_Angeles',
    },
  },

  sendVolunteerReminder: {
    task: async({ strapi }) => {
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
};