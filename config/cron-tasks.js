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
    Weather.runWeatherCron();
  },

  '0 7 * * */1': async () => {
  // '1/1 * * * *': async () => {
    const recurringTasks = await strapi.db.query('api::recurring-task.recurring-task')
      .findMany({
        where: {},
        populate: { garden: true }
      });
    const gardenTaskService = strapi.db.query('api::garden-task.garden-task');
    let curTask, recTask;
    try {
      console.log('cronned');
      for (recTask of recurringTasks) {
        // If at least one of this type of recurring task is Initialized, skip
        curTask = await gardenTaskService.findOne({
          where: {
            status:{$ne:'FINISHED'}, //$notIn: ['Hello', 'Hola', 'Bonjour']
            recurring_task: recTask.id, 
            garden:recTask.garden
          },
          populate: { recurring_task: true, volunteers:true }
        });
        console.log('curtask data: ', curTask, recTask.id);

        /** SCHEDULER */
        let scheduledUser = null;
        // console.log(recTask)

        const schedulers = await strapi.db.query('api::scheduler.scheduler')
        .findMany({
          where: {recurring_task: recTask.id},
          populate: { volunteer: true }
        });
  
        // console.log(schedulers)
        if (schedulers && schedulers.length > 0) {
          const dayOfWeekName = new Date().toLocaleString(
            'default', {weekday: 'long'}
          );
          console.log(dayOfWeekName)
          for (let scheduledDay of schedulers) {
            if (scheduledDay.day == dayOfWeekName) {
              scheduledUser = scheduledDay.volunteer;
            }
          }

        }
        // SKIP IF ALREADY INITIALIZED
        if (curTask && curTask.recurring_task) {
          if (scheduledUser && !curTask.volunteers.length) {
            curTask.volunteer = scheduledUser;
            await gardenTaskService.update({
              data:{ volunteers: scheduledUser },
              where: {id: curTask.id}
            });
            console.log("added volunteer onto: ", curTask.id);
          }
          continue; 
        }
        // Someone could have it started, how many people can work on a task at same time?
        // console.log("setting task: ", recTask)
        let newTask = await gardenTaskService.create({
          data: {
            title:recTask.title,
            status:'INITIALIZED',
            garden:recTask.garden,
            overview:recTask.overview,
            recurring_task:recTask.id,
            volunteers: scheduledUser
          }
        });
        console.log('newtask added: ',newTask.title, newTask.id);
      }
    } catch (err) {
      console.error(err);
    }
  },
 
  taskReminders: {
    task: async({ strapi }) => {
      strapi.log.info('triggering SMS notification');
      const d = new Date();
      d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
      let hour = d.getHours();
      console.log('taskReminders hour: ',hour);
  
      if (process.env.ENVIRONMENT == 'test') {
        // We are proper with Pacific Time -- Also let's get our crons.
      } else {
        if (hour > 9 && hour < 8) {
          return;
        }
      }
      await Helper.handleInitialTasks();
  
      await Helper.handleStartedTasks();
  
    },
    options: {
       rule: '2 1/2 * * *',
       tz: 'America/Los_Angeles',
    },
  },
};