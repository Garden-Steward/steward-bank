'use strict';

const Weather = require('./weather.js');
const VdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper')
/**
 * An asynchronous bootstrap function that runs before
 * your application gets started.
 *
 * This gives you an opportunity to set up your data model,
 * run jobs, or perform some special logic.
 *
 * See more details here: https://strapi.io/documentation/3.0.0-beta.x/configurations/configurations.html#bootstrap
 */

// CRON HELPER
const Helper = {};

Helper.handleInitialTasks = async() => {
  console.log("get init");
  let initTasks = await strapi.db.query('api::garden-task.garden-task').findMany({
    where: {
      status: 'INITIALIZED',
      volunteers: { $not:null },
    },
    populate: { garden: true, volunteers: true }
  });

  console.log("init tasks: ", initTasks.length);

  for (let initTask of initTasks) {
    if (initTask.title.indexOf('Water') > -1) {
      Helper.sendWaterSms(initTask);
    }
  }
};

Helper.handleVolunteerReminders = async() => {
  const vDays = await VdayHelper.getUpcomingVdays();
  for (let vDay of vDays) {
    console.log("3 days: ", vDay.startDatetime);
    let copy = VdayHelper.buildUpcomingDayCopy(vDay);
    VdayHelper.sendMessage(vDay, copy);
  }
  const todDays = await VdayHelper.getTodayVdays();
  for (let tDay of todDays) {
    console.log("today: ", tDay.startDatetime);
    let copy = VdayHelper.buildTodayCopy(tDay);
    VdayHelper.sendMessage(tDay, copy);
  }
}

Helper.sendWaterSms = async(waterTask) => {
  // const weather = await Helper.getWeather(waterTask.garden);
  const weather = await Weather.getGardenWeather(waterTask.garden);
  if (waterTask.volunteers[0].phoneNumber) {
    if (weather.water) {
      strapi.service('api::sms.sms').handleSms(
        waterTask, 
        `Hi ${waterTask.volunteers[0].firstName}, it's your watering day! Are you able to water today? You have some OPTIONS.`, 
        'question'
      );
    } else {
      try {
        await Helper.updateTask(waterTask,'SKIPPED');
      } catch (err) { console.log(err); }

      const lastRain = weather.lastRain.toDateString();
      strapi.service('api::sms.sms').handleSms(
        waterTask, 
        `Hi ${waterTask.volunteers[0].firstName}, don't worry about watering today! Reason: ${weather.rainDescription} on ${lastRain}`, 
        'notification'
      );
    }
  } else {
    console.log('Missing phone number for ',waterTask.volunteers[0].username);
  }
};

Helper.buildSchedulerTask = async(curTask, recTask, scheduledUser) => {
    // SKIP IF ALREADY INITIALIZED
    if (curTask && curTask.recurring_task) {
      if (scheduledUser && !curTask.volunteers.length) {
        curTask.volunteer = scheduledUser;
        await strapi.db.query('api::garden-task.garden-task').update({
          data:{ volunteers: scheduledUser },
          where: {id: curTask.id}
        });
        console.log("added volunteer onto: ", curTask.id);
      }
      return; 
    }
    // Someone could have it started, how many people can work on a task at same time?
    // console.log("setting task: ", recTask)
    let newTask = await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title:recTask.title,
        status:'INITIALIZED',
        garden:recTask.garden,
        overview:recTask.overview,
        recurring_task:recTask.id,
        type:recTask.type,
        volunteers: scheduledUser
      }
    });
    console.log('newtask added: ',newTask.title, newTask.id);

}

Helper.getScheduledVolunteer = async(recTask) => {
  let scheduledUser;
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
  return scheduledUser;
}

Helper.updateTask = async(task, status) => {
  return strapi.db.query('api::garden-task.garden-task').update({
    data:{ status },
    where: {id: task.id}
  });
};

Helper.handleStartedTasks = async() => {

  let yesterday = new Date(new Date().setDate(new Date().getDate()-1));

  let started = await strapi.db.query('api::garden-task.garden-task')
  .findMany({
    where: {
      status:{$eq:'STARTED'},
      volunteers: {$not:null}
    },
    populate: { garden: true }
  });

  for (let task of started) {
    if (task.started_at < yesterday.toISOString().substring(0,10)) {
      try {
        await Helper.updateTask(task,'ABANDONED');
      } catch (err) { console.log(err); }
      continue;
    }
    let timeAgo = new Date().getTime();
    const numOfHours = 4;
    var hoursAgo = new Date(timeAgo - (60 * 60 * 1000 * numOfHours));
    if (new Date(task.updatedAt) > hoursAgo) {
      console.log('updated! this happened recently');
      continue;
    }
    if (task.type === 'Water') {
      console.log('started watering already', task);
      if (task.volunteers[0].phoneNumber) {
        strapi.db.query('api::sms.sms').handleSms(
          task, 
          `Hey there ${task.volunteers[0].firstName}, have you managed garden watered yet? Let me know when you're DONE :)`,
          'followup'
        );
      } else {
        console.log('Missing phone number for ',task.volunteers[0].username);
      }
    }
  }
  
};
module.exports = Helper;