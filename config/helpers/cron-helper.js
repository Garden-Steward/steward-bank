'use strict';

const Weather = require('./weather.js');

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
  let initTasks = await strapi.db.query('api::garden-task.garden-task').findMany({
    where: {
      status:{$eq:'INITIALIZED'},
      user: {$ne:null}
    }
    });

  console.log('init tasks: ', initTasks);
        
  for (let initTask of initTasks) {
    if (initTask.title.indexOf('Water') > -1) {
      Helper.sendWaterSms(initTask);
    }
  }
};

Helper.sendWaterSms = async(waterTask) => {
  console.log('sending water sms!');
  // const weather = await Helper.getWeather(waterTask.garden);
  const weather = await Weather.getGardenWeather(waterTask.garden);
  if (waterTask.user.phoneNumber) {
    if (weather.water) {
      strapi.service('api::sms.sms').handleSms(
        waterTask, 
        `Hi ${waterTask.user.firstName}, it's your watering day! Are you able to water today? You have some OPTIONS.`, 
        'question'
      );
    } else {
      try {
        await Helper.updateTask(waterTask,'SKIPPED');
      } catch (err) { console.log(err); }

      const lastRain = weather.lastRain.toDateString();
      strapi.service('api::sms.sms').handleSms(
        waterTask, 
        `Hi ${waterTask.user.firstName}, don't worry about watering today! Reason: ${weather.rainDescription} on ${lastRain}`, 
        'notification'
      );
    }
  } else {
    console.log('Missing phone number for ',waterTask.user.username);
  }
};

Helper.updateTask = async(task, status) => {
  return strapi.service('api::garden-task.garden-task').update({id:task.id},{
    status
  });
};

Helper.handleStartedTasks = async() => {

  let yesterday = new Date(new Date().setDate(new Date().getDate()-1));

  let started = await strapi.service('api::garden-task.garden-task').find({
    status:{$eq:'STARTED'},
    user: {$ne:null}
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
    if (task.type == 'Water') {
      console.log('started watering already', task);
      if (task.user.phoneNumber) {
        strapi.service('api::sms.sms').handleSms(
          task, 
          `Hey there ${task.user.firstName}, have you managed garden watered yet? Let me know when you're DONE :)`,
          'followup'
        );
      } else {
        console.log('Missing phone number for ',task.user.username);
      }
    }
  }
  
};
module.exports = Helper;