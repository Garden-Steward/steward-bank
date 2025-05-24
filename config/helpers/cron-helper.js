'use strict';
const { addDays, addHours } = require('date-fns');

const Weather = require('./weather.js');
const VdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper')
const {utcToZonedTime,} = require("date-fns-tz");
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
      status: {$in:['INITIALIZED','PENDING']},
      volunteers: { $not:null },
    },
    populate: ["garden", "volunteers", "recurring_task", "recurring_task.instruction", "volunteers.instructions"]
  });

  console.log("init tasks # ", initTasks.length);


  for (let initTask of initTasks) {
    let abandoned = await Helper.validateAbandon(initTask);
    if (abandoned) {
      continue;
    }

    // TODO check if the recurring task has an instruction

    // console.log(initTask, initTask.recurring_task);
    if (initTask.recurring_task?.instruction) {
      if (!initTask.volunteers[0].instructions.find(i=> i.id == initTask.recurring_task.instruction.id)) {

        return strapi.service('api::instruction.instruction').managePendingTask(initTask.volunteers[0], initTask.recurring_task.instruction, initTask);
      } else {
        console.log('already have instruction')
      }
    }
    if (initTask.type == 'Water') {
      Helper.sendWaterSms(initTask);
    } else {
      strapi.service('api::garden-task.garden-task').sendTask(initTask);
      console.log("initTask %s not Water: %s", initTask.id, initTask.type)
    }
  }
};

Helper.handleVolunteerReminders = async() => {
  const vDays = await VdayHelper.getUpcomingVdays();
  let messagesSent = []
  for (let vDay of vDays) {
    console.log("7 days: ", vDay.startDatetime);
    let copy = VdayHelper.buildUpcomingDayCopy(vDay);
    messagesSent = await strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy);
  }
  const todDays = await VdayHelper.getTomorrowVdays();
  for (let tDay of todDays) {
    console.log("today: ", tDay.startDatetime);
    let copy = VdayHelper.buildTomorrowCopy(tDay);
    messagesSent = await strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(tDay,copy);
  }
  console.log("messages sent: ", messagesSent);
  return messagesSent
};

/**
 * Sending Window - 
 * Don't send late at night or early morning, Not before 8am or after 7pm
 * @param {obj} task 
 * @returns 
 */
Helper.sendingWindow = (task) => {
  const today = new Date();
  const fourAgo = addHours(today, -4);
  
  // We always send in testing and staging (Cameron codes at night)
  if (['test','stg'].indexOf(process.env.ENVIRONMENT)>-1 && !task.test) { return true }

  const pacificTime = utcToZonedTime(new Date(), 'America/Los_Angeles');
  let hour = pacificTime.getHours();
  console.log("hour: ", hour)

  // If the task has been started in the last 4 hours, don't send
  if (task.status === 'STARTED' && Date.parse(task.started_at) > Date.parse(fourAgo)) {
    console.log('%s recently updated! no SMS sending for now.', task.id, hour);
    // if the hour is past 19 we should send - or else they won't be reminded until too late
    if (hour > 19) {
      return true;
    }
    return false;
  }

  if (hour < 8 || hour > 19) {
    console.log("outside of hours, ", hour)
    return false
  }
  console.log("we are sending in proper hours: ", hour);
  return true
}
/**
 * 
 * @param {*} waterTask 
 * @param {*} skipWindow = always send
 * @returns {obj} {success: true, message: 'Sent water reminder for ' + waterTask.volunteers[0].username, task: waterTask}
 */
Helper.sendWaterSms = async(waterTask, skipWindow) => {

  if (!waterTask.volunteers[0].phoneNumber) {
    console.log('Missing phone number for ',waterTask.volunteers[0].username);
    return {success: false, message: 'Missing phone number for ' + waterTask.volunteers[0].username, task: waterTask};
  }

  if (!skipWindow && !Helper.sendingWindow(waterTask)) { return }

  const weather = await Weather.getGardenWeather(waterTask.garden);

  if (!weather || weather.water) {
    await strapi.service('api::sms.sms').handleSms({
      task: waterTask, 
      body: `Hi ${waterTask.volunteers[0].firstName}, it's your watering day! Are you able to water today? You have some OPTIONS.`, 
      type: 'question'
    }
    );
    return {success: true, message: 'Sent water reminder for ' + waterTask.volunteers[0].username, task: waterTask};
  } else {
    try {
      await Helper.updateTask(waterTask,'SKIPPED');
    } catch (err) { console.log(err); }

    
    strapi.service('api::sms.sms').handleSms({
      task: waterTask, 
      body: `Hi ${waterTask.volunteers[0].firstName}, don't worry about watering today! Reason: ${weather.reason}`, 
      type: 'notification'
    });
    return {success: true, message: 'Sent water skip for ' + waterTask.volunteers[0].username, task: waterTask};
  }
};

/**
 * For 'Weekly Shuffle' Scheduled types on a recurring Task
 * Step 1: Initiate the creation ofschedule for the week.
 * 
 * Step 2: On scheduleSetDate send an email to all the users on the schedule
 * 
 * @param {obj} recTask 
 * @returns Weekly Message return
 */
Helper.setWeeklySchedule = async(recTask) => {
  const scheduleSetDate = recTask.week_start_date || 'Sunday';
  const dayOfWeekName = new Date().toLocaleString(
    'default', {weekday: 'long'}
    );
  if (recTask.scheduler_type !== 'Weekly Shuffle' || dayOfWeekName !== scheduleSetDate) {
    return
  }

    console.log("Setting weekly schedule for %s of type ", dayOfWeekName, recTask.scheduler_type)
  let weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').createWeeklySchedule(recTask);

  // Text all the people on the weekly list
  return strapi.service('api::weekly-schedule.weekly-schedule').sendWeeklyMsg(recTask, weeklySchedule.assignees);
  
}

Helper.buildSchedulerTask = async(curTask, recTask, scheduledUser) => {
    // ASSIGN && SKIP IF ALREADY INITIALIZED
    if (curTask && curTask.recurring_task) {
      if (scheduledUser && !curTask.volunteers.length) {
        curTask.volunteer = scheduledUser;
        await strapi.db.query('api::garden-task.garden-task').update({
          data:{ volunteers: scheduledUser },
          where: {id: curTask.id}
        });
        console.log("added volunteer onto: ", curTask.id);
      }
      return {success: true, message: 'Added volunteer onto: ' + curTask.id}; 
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
    return {success: true, message: 'Created Task: ' + newTask.id};
}

/**
 * Handle both the schedule types on a Recurring Task
 * 'Weekly Shuffle' and 'Daily Primary'.
 * Weekly schedules will have already been assigned so 
 * we are just getting the right user for today if any
 * 
 * @param {obj} recTask: Full Recurring Task Obj
 * @returns 
 */
Helper.getScheduledVolunteer = async(recTask) => {
  let scheduledUser;
  const dayOfWeekName = new Date().toLocaleString(
    'default', {weekday: 'long'}
  );
  console.log("Getting %s Schedule", dayOfWeekName, recTask.scheduler_type);

  if (recTask.scheduler_type == 'Weekly Shuffle') {
    const weeklySchedule = await strapi.db.query('api::weekly-schedule.weekly-schedule')
    .findOne({
      where: {recurring_task: recTask.id},
      orderBy: { createdAt: 'DESC' },
      populate: ["assignees", "assignees.assignee"]
    });
    if (weeklySchedule) {
      scheduledUser = weeklySchedule.assignees.find(a=> a.day == dayOfWeekName)?.assignee
      console.log("weekly schedule latest: ", weeklySchedule)
    }
    
  } else if (recTask.scheduler_type == 'Daily Primary') {

    const schedulers = await strapi.db.query('api::scheduler.scheduler')
    .findMany({
      where: {recurring_task: recTask.id},
      populate: { volunteer: true }
    });
  
    if (schedulers && schedulers.length > 0) {
      for (let scheduledDay of schedulers) {
        if (scheduledDay.day == dayOfWeekName) {
          scheduledUser = scheduledDay.volunteer;
        }
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

Helper.validateAbandon = async(task) => {
  const today = new Date();
  const yesterday = addDays(today, -1);
  // If started_at is more than 24 hours ago, abandon
  if ((Date.parse(task.started_at) || Date.parse(task.updatedAt)) < Date.parse(yesterday)) {
    console.log("abandoning")
    try {
      // Started but never finished: ABANDONED
      await strapi.service('api::garden-task.garden-task').updateTaskStatus(task,'ABANDONED');
    } catch (err) { console.log(err); }

    return true;
  }
  return false;

}

Helper.handleStartedTasks = async() => {

  let started = await strapi.db.query('api::garden-task.garden-task')
  .findMany({
    where: {
      status:{$eq:'STARTED'},
      volunteers: {$not:null},
      complete_once: {$ne:false}
    },
    populate: { garden: true, volunteers:true }
  });
  console.log("Checking Started, found: ", started.length);
  for (let task of started) {
    let abandoned = await Helper.validateAbandon(task);
    if (abandoned) {
      continue;
    }

    if (!Helper.sendingWindow(task)) { return }

    if (!task.volunteers[0].phoneNumber) {
      console.log('Missing phone number for ',task.volunteers[0].username);
      return;
    }

    if (task.type === 'Water') {
      strapi.service('api::sms.sms').handleSms({  
        task, 
        body: `Hey there ${task.volunteers[0].firstName}, once you're DONE with "${task.title}" let me know you're FINISHED :) ...you always have OPTIONS`,
        type: 'followup'
    });
    } else {
      strapi.service('api::sms.sms').handleSms({  
        task, 
        body: `Hey there ${task.volunteers[0].firstName}, have you managed to "${task.title}"? Let me know when you're DONE :) ...you always have OPTIONS`,
        type: 'followup'
      });
    }
  }
  
};
module.exports = Helper;