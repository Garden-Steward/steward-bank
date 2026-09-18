'use strict';
const { addDays, addHours } = require('date-fns');

const Weather = require('./weather.js');
const VdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper')
const {utcToZonedTime, zonedTimeToUtc} = require("date-fns-tz");
const { documentRowIds } = require('../../src/utils/documents');
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
      task_status: {$in:['INITIALIZED','PENDING']},
      volunteers: { $not:null },
    },
    populate: ["garden", "volunteers", "instruction", "recurring_task", "recurring_task.instruction", "volunteers.instructions"]
  });

  console.log("init tasks # ", initTasks.length);


  for (let initTask of initTasks) {
    console.log(`Processing task ${initTask.id} (${initTask.title}) - Status: ${initTask.task_status}, Recurring Task: ${initTask.recurring_task?.id || 'none'}`);
    let abandoned = await Helper.validateAbandon(initTask);
    if (abandoned) {
          continue;
        }

        // Guard: skip if no volunteers assigned to this task
        if (!initTask.volunteers?.length) {
          console.log(`handleInitialTasks: Task ${initTask.id} has no volunteers, skipping`);
          continue;
        }

        // Taken for tomorrow morning: they've answered, so leave them alone until then.
        if (Helper.isDeferred(initTask)) {
          console.log(`handleInitialTasks: Task ${initTask.id} held until ${initTask.deferred_until}, skipping`);
          continue;
        }

        // FIX: Check if there's already a FINISHED task for this recurring task
    // If so, skip sending SMS for this INITIALIZED/PENDING task (it's likely a duplicate)
    if (initTask.recurring_task) {
      const gardenId = initTask.garden?.id || initTask.garden;
      const finishedTask = await strapi.db.query('api::garden-task.garden-task').findOne({
        where: {
          task_status: 'FINISHED',
          recurring_task: initTask.recurring_task.id,
          garden: gardenId,
          completed_at: { $notNull: true }
        },
        orderBy: { completed_at: 'DESC' }
      });
      
      if (finishedTask) {
        // Check if the finished task was completed more recently than this task was created
        // If so, this is likely an old task that should be cleaned up
        const finishedDate = new Date(finishedTask.completed_at);
        const taskCreatedDate = new Date(initTask.createdAt);
        
        if (finishedDate > taskCreatedDate) {
          console.log(`Skipping SMS for task ${initTask.id}: A newer FINISHED task (${finishedTask.id}) exists for recurring task ${initTask.recurring_task.id}`);
          // Mark this task as SKIPPED since a newer one was finished
          try {
            await strapi.service('api::garden-task.garden-task').updateTaskStatus(initTask, 'SKIPPED');
          } catch (err) {
            console.log('Error skipping duplicate task:', err);
          }
          continue;
        }
      }
    }

    const taskInstruction = initTask.instruction || initTask.recurring_task?.instruction;
    if (taskInstruction) {
      if (!initTask.volunteers[0].instructions.find(i=> i.id == taskInstruction.id)) {

        return strapi.service('api::instruction.instruction').managePendingTask(initTask.volunteers[0], taskInstruction, initTask);
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

/**
 * Send one event's reminder without letting it take the rest of the run down.
 *
 * These reminders are the whole point of the daily cron, so a single event with
 * bad data (a deleted garden, a half-migrated row) must not stop every other
 * garden from being texted.
 *
 * @param {obj} vDay
 * @param {string} copy
 * @returns {arr} phone numbers texted for this event
 */
Helper.sendVdayReminder = async(vDay, copy) => {
  try {
    const sent = await strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay, copy);

    if (!sent?.length) {
      console.warn(
        `handleVolunteerReminders: volunteer-day ${vDay.id} ("${vDay.title}") matched the reminder window but texted nobody`
      );
    }

    return sent || [];
  } catch (err) {
    console.error(`handleVolunteerReminders: failed to send for volunteer-day ${vDay.id} ("${vDay.title}")`, err);
    return [];
  }
};

Helper.handleVolunteerReminders = async() => {
  const messagesSent = [];

  const vDays = await VdayHelper.getUpcomingVdays();
  for (let vDay of vDays) {
    console.log("7 days: ", vDay.startDatetime);
    let copy = VdayHelper.buildUpcomingDayCopy(vDay);
    messagesSent.push(...await Helper.sendVdayReminder(vDay, copy));
  }

  const todDays = await VdayHelper.getTomorrowVdays();
  for (let tDay of todDays) {
    console.log("today: ", tDay.startDatetime);
    let copy = VdayHelper.buildTomorrowCopy(tDay);
    messagesSent.push(...await Helper.sendVdayReminder(tDay, copy));
  }

  console.log(`handleVolunteerReminders: ${vDays.length} upcoming + ${todDays.length} tomorrow event(s), ${messagesSent.length} message(s) sent`);
  return messagesSent
};

const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * Watering is a morning job. Past mid-afternoon the sun is still high, and a
 * garden watered now stays wet into the evening, which is how mildew gets
 * started. So after this hour we stop asking anyone to water today and offer
 * them tomorrow morning instead - the better watering anyway.
 */
Helper.WATER_CUTOFF_HOUR = 15;

/** The hour a deferred watering task comes due again. */
Helper.WATER_MORNING_HOUR = 6;

Helper.pacificHour = (now = new Date()) => utcToZonedTime(now, PACIFIC_TZ).getHours();

/**
 * @param {Date} now
 * @returns {bool} too late in the day to send anyone out to water
 */
Helper.pastWateringCutoff = (now = new Date()) => Helper.pacificHour(now) >= Helper.WATER_CUTOFF_HOUR;

/**
 * Tomorrow morning, as a UTC instant. Set before the reminder cron's first run
 * of the day (8am Pacific) so a deferred task is already due when that run
 * comes around, rather than waiting for the one after it.
 *
 * @param {Date} now
 * @returns {Date}
 */
Helper.nextWateringMorning = (now = new Date()) => {
  const morning = addDays(utcToZonedTime(now, PACIFIC_TZ), 1);
  morning.setHours(Helper.WATER_MORNING_HOUR, 0, 0, 0);
  return zonedTimeToUtc(morning, PACIFIC_TZ);
};

/**
 * A volunteer who has taken a task for the morning has answered us - they get
 * no more reminders until the morning they committed to.
 *
 * @param {obj} task
 * @param {Date} now
 * @returns {bool}
 */
Helper.isDeferred = (task, now = new Date()) =>
  !!task.deferred_until && Date.parse(task.deferred_until) > now.getTime();

/**
 * The watering reminder that fits the time of day.
 *
 * @param {obj} waterTask populated with volunteers
 * @param {Date} now
 * @returns {string}
 */
Helper.buildWaterBody = (waterTask, now = new Date()) => {
  const firstName = waterTask.volunteers[0].firstName;

  if (Helper.pastWateringCutoff(now)) {
    return `Hi ${firstName}, it's getting late in the day to water - the plants take it better in the morning, and leaves left wet overnight invite mildew. Can you water tomorrow morning instead? Reply MORNING if you can, or SKIP if you can't.`;
  }
  if (waterTask.deferred_until) {
    return `Good morning ${firstName}! You're on to water "${waterTask.title}" this morning. Are you able to? Reply YES, or SKIP if your plans changed.`;
  }
  return `Hi ${firstName}, it's your watering day! Are you able to water today? You have some OPTIONS.`;
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
  if (task.task_status === 'STARTED' && Date.parse(task.started_at) > Date.parse(fourAgo)) {
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

  if (!waterTask.volunteers?.length) {
    console.log('sendWaterSms: No volunteers for task', waterTask.id);
    return {success: false, message: 'No volunteers assigned', task: waterTask};
  }

  if (!waterTask.volunteers[0].phoneNumber) {
    console.log('Missing phone number for ',waterTask.volunteers[0].username);
    return {success: false, message: 'Missing phone number for ' + waterTask.volunteers[0].username, task: waterTask};
  }

  if (!skipWindow && !Helper.sendingWindow(waterTask)) { return }

  // They already told us they'd take it in the morning - nothing to ask until then.
  if (Helper.isDeferred(waterTask)) {
    console.log('Task %s is held for the morning of %s, no SMS for now', waterTask.id, waterTask.deferred_until);
    return {success: false, message: 'Deferred until ' + waterTask.deferred_until, task: waterTask};
  }

  const weather = await Weather.getGardenWeather(waterTask.garden);

  if (!weather || weather.water) {
    await strapi.service('api::sms.sms').handleSms({
      task: waterTask, 
      body: Helper.buildWaterBody(waterTask), 
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
  // Same draft/published split as getScheduledVolunteer: the schedulers
  // populated on the row in hand can be empty while the document's other row
  // holds them all, which draws a roster with nobody on it.
  const schedulers = await Helper.getRecurringTaskSchedulers(recTask);
  if (!schedulers.length) {
    console.warn(`setWeeklySchedule: recTask ${recTask.id} ("${recTask.title}") has no schedulers, skipping`);
    return;
  }
  let weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').createWeeklySchedule({ ...recTask, schedulers });

  if (!weeklySchedule) {
    console.warn('setWeeklySchedule: no schedule created for recTask %s, skipping SMS', recTask.id);
    return;
  }

  // Text all the people on the weekly list
  return strapi.service('api::weekly-schedule.weekly-schedule').sendWeeklyMsg(recTask, weeklySchedule.assignees);
  
}

/**
 * Bring an already-open generated task up to date with its recurring task.
 *
 * Two things this repairs, both of which leave a task looking half-empty on the
 * front-end:
 *
 * 1. Generated tasks never copied primary_image, so every task the cron has
 *    ever created is imageless. New tasks get the image at creation; this fills
 *    in the ones already sitting open. An image set directly on the task is
 *    left alone - a manager may have picked something for that day.
 * 2. Tasks generated before the cron settled on published rows point their
 *    relations at draft rows. The REST API resolves published-to-published, so
 *    those come back null and the task shows up with no recurring task, garden
 *    or instruction. Relations are only ever moved between rows of the *same*
 *    document, so this never repoints a task at different content.
 *
 * @param {obj} task open garden task, populated with primary_image and relations
 * @param {obj} recTask recurring task it was generated from
 * @returns {obj|null} the fields that were repaired, or null if nothing was
 */
Helper.realignGeneratedTask = async(task, recTask) => {
  if (!task || !recTask) {
    return null;
  }

  const data = {};

  if (recTask.primary_image?.id && !task.primary_image) {
    data.primary_image = recTask.primary_image.id;
  }

  // Same document, different row: the draft/published twin of what it already
  // points at, so this only changes which version the API can resolve.
  const relations = { recurring_task: recTask, garden: recTask.garden, instruction: recTask.instruction };
  for (const [field, target] of Object.entries(relations)) {
    const current = task[field];
    if (!current || !target?.id || !target.documentId) {
      continue;
    }
    if (current.documentId === target.documentId && current.id !== target.id) {
      data[field] = target.id;
    }
  }

  if (!Object.keys(data).length) {
    return null;
  }

  const repaired = { ...data };
  await strapi.db.query('api::garden-task.garden-task').update({
    where: { id: task.id },
    data
  });
  console.log(`[realignGeneratedTask] task ${task.id}:`, repaired);
  return repaired;
};

/**
 * A generated task from a day gone by that nobody ever took.
 *
 * This is how task generation stops dead. No volunteer means no reminder cron
 * ever looks at it (they all filter on volunteers), so nothing moves it to a
 * status the open-task lookup ignores - and while it sits there open, every
 * later day's task is skipped as "already have one". One empty task in June
 * and a garden goes the summer without a single new one.
 *
 * Only for tasks a schedule generates: an unclaimed task on a recurring task
 * with no schedule is the open pool that TASK hands out, and is meant to wait.
 *
 * @param {obj} task the open task blocking creation
 * @param {obj} recTask the recurring task it came from
 * @returns {bool}
 */
Helper.isStaleUnclaimed = (task, recTask) => {
  if (!task || task.volunteers?.length) {
    return false;
  }
  if (!recTask?.scheduler_type || recTask.scheduler_type === 'No Schedule') {
    return false;
  }

  const madeOn = Date.parse(task.createdAt) || Date.parse(task.updatedAt);
  if (!madeOn) {
    return false;
  }

  const startOfToday = utcToZonedTime(new Date(), PACIFIC_TZ);
  startOfToday.setHours(0, 0, 0, 0);
  return madeOn < zonedTimeToUtc(startOfToday, PACIFIC_TZ).getTime();
};

Helper.buildSchedulerTask = async(curTask, recTask, scheduledUser) => {
    console.log(`[buildSchedulerTask] Processing recurring task ${recTask.id} (${recTask.title}), curTask: ${curTask?.id || 'none'}, status: ${curTask?.task_status || 'N/A'}`);
    // ASSIGN && SKIP IF ALREADY INITIALIZED
    if (curTask && curTask.recurring_task) {
      // FIX: Check if this task is FINISHED - if so, we should create a new one
      if (curTask.task_status === 'FINISHED' || curTask.task_status === 'SKIPPED' || curTask.task_status === 'ABANDONED') {
        console.log(`[buildSchedulerTask] Task ${curTask.id} is ${curTask.task_status}, creating new task for recurring task ${recTask.id}`);
        // Fall through to create new task
      } else if (Helper.isStaleUnclaimed(curTask, recTask)) {
        // Retire it and make today's, rather than let an empty task from an
        // earlier day block this recurring task for good.
        console.log(`[buildSchedulerTask] Task ${curTask.id} was never taken by anyone, skipping it and generating today's`);
        try {
          await strapi.service('api::garden-task.garden-task').updateTaskStatus(curTask, 'SKIPPED');
        } catch (err) {
          console.error(`[buildSchedulerTask] could not retire stale task ${curTask.id}`, err);
          return {success: false, message: 'Could not retire stale task: ' + curTask.id};
        }
        curTask = null;
        // Fall through to create today's task
      } else {
        // Task exists and is not finished, just assign volunteer if needed
        if (scheduledUser && !curTask.volunteers.length) {
          curTask.volunteer = scheduledUser;
          await strapi.db.query('api::garden-task.garden-task').update({
            data:{ volunteers: scheduledUser },
            where: {id: curTask.id}
          });
          console.log("added volunteer onto: ", curTask.id);
        }
        await Helper.realignGeneratedTask(curTask, recTask);
        return {success: true, message: 'Added volunteer onto: ' + curTask.id}; 
      }
    }
    
    // FIX: Before creating new task, double-check there isn't already an active one
    // This prevents race conditions where multiple tasks get created
    const existingActiveTask = await strapi.service('api::garden-task.garden-task').getTaskByRecurringUndone(recTask);
    if (existingActiveTask && existingActiveTask.id !== curTask?.id) {
      console.log(`Found existing active task ${existingActiveTask.id} for recurring task ${recTask.id}, skipping creation`);
      if (scheduledUser && !existingActiveTask.volunteers.length) {
        await strapi.db.query('api::garden-task.garden-task').update({
          data:{ volunteers: scheduledUser },
          where: {id: existingActiveTask.id}
        });
        console.log("added volunteer onto existing task: ", existingActiveTask.id);
      }
      await Helper.realignGeneratedTask(existingActiveTask, recTask);
      return {success: true, message: 'Using existing task: ' + existingActiveTask.id};
    }
    
    // Someone could have it started, how many people can work on a task at same time?
    // console.log("setting task: ", recTask)
    let newTask = await strapi.db.query('api::garden-task.garden-task').create({
      data: {
        title:recTask.title,
        task_status:'INITIALIZED',
        garden:recTask.garden,
        overview:recTask.overview,
        recurring_task:recTask.id,
        type:recTask.type,
        volunteers: scheduledUser,
        instruction: recTask.instruction?.id || null,
        primary_image: recTask.primary_image?.id || null
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
/**
 * A filter matching anything related to *any* row of a recurring task's
 * document.
 *
 * Strapi v5 keeps a draft row and a published row per recurring task, and a
 * relation points at one specific row. The cron iterates the published row
 * (dedupeByDocument prefers it) while a schedule attached in the admin lands on
 * the draft - so a filter written against the row in hand finds no schedule at
 * all, and the day's task is generated with nobody on it.
 *
 * @param {obj} recTask
 * @returns {obj|num} a `recurring_task` filter
 */
Helper.recurringTaskFilter = async(recTask) => {
  const rowIds = await documentRowIds('api::recurring-task.recurring-task', recTask);
  return rowIds.length ? { id: { $in: rowIds } } : recTask.id;
};

/**
 * Every scheduler row for a recurring task, across both rows of its document.
 *
 * @param {obj} recTask
 * @returns {arr} scheduler rows, with volunteers populated
 */
Helper.getRecurringTaskSchedulers = async(recTask) => {
  return strapi.db.query('api::scheduler.scheduler').findMany({
    where: { recurring_task: await Helper.recurringTaskFilter(recTask) },
    populate: { volunteer: true, backup_volunteers: true }
  });
};

Helper.getScheduledVolunteer = async(recTask) => {
  let scheduledUser;
  const dayOfWeekName = new Date().toLocaleString(
    'default', {weekday: 'long'}
  );
  console.log("Getting %s Schedule", dayOfWeekName, recTask.scheduler_type);

  if (recTask.scheduler_type == 'Weekly Shuffle') {
    const weeklySchedule = await strapi.db.query('api::weekly-schedule.weekly-schedule')
    .findOne({
      where: {recurring_task: await Helper.recurringTaskFilter(recTask)},
      orderBy: { createdAt: 'DESC' },
      populate: ["assignees", "assignees.assignee"]
    });
    if (weeklySchedule) {
      scheduledUser = weeklySchedule.assignees.find(a=> a.day == dayOfWeekName)?.assignee
      console.log("weekly schedule latest: ", weeklySchedule)
    }

  } else if (recTask.scheduler_type == 'Daily Primary') {

    const schedulers = await Helper.getRecurringTaskSchedulers(recTask);

    if (schedulers && schedulers.length > 0) {
      for (let scheduledDay of schedulers) {
        if (scheduledDay.day == dayOfWeekName) {
          scheduledUser = scheduledDay.volunteer;
          // The primary is on vacation — hand the day to a backup who isn't.
          if (scheduledUser?.paused) {
            const standIn = (scheduledDay.backup_volunteers || []).find(v => !v.paused);
            console.log(`[Schedule] ${scheduledUser.firstName} is on vacation; ${standIn ? `assigning backup ${standIn.firstName}` : 'no available backup'}`);
            scheduledUser = standIn;
          }
        }
      }

    }
  }

  // A Weekly Shuffle roster is built once a week, so someone can start their
  // vacation after it was drawn and still be holding a day on it.
  if (scheduledUser?.paused) {
    console.log(`[Schedule] Skipping ${scheduledUser.firstName} — on vacation.`);
    return undefined;
  }

  return scheduledUser;
}

Helper.updateTask = async(task, status) => {
  return strapi.db.query('api::garden-task.garden-task').update({
    data:{ task_status: status },
    where: {id: task.id}
  });
};

Helper.validateAbandon = async(task) => {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const lastActivity = Date.parse(task.started_at) || Date.parse(task.updatedAt);
  // A task held for the morning is still live. Its clock runs from the morning
  // it was moved to, not from the afternoon the volunteer answered us - or the
  // cron would abandon it within hours of reminding them to go water.
  const heldFor = Date.parse(task.deferred_until) || 0;
  // If there's been no activity for more than 24 hours, abandon
  if (Math.max(lastActivity, heldFor) < Date.parse(yesterday)) {
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
      task_status:{$eq:'STARTED'},
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

    // Guard: skip if no volunteers assigned to this task
    if (!task.volunteers?.length) {
      console.log(`handleStartedTasks: Task ${task.id} has no volunteers, skipping`);
      continue;
    }

    // Taken for tomorrow morning: they've answered, so leave them alone until then.
    if (Helper.isDeferred(task)) {
      console.log(`handleStartedTasks: Task ${task.id} held until ${task.deferred_until}, skipping`);
      continue;
    }

    if (!Helper.sendingWindow(task)) { return }

    if (!task.volunteers[0].phoneNumber) {
      console.log('Missing phone number for ',task.volunteers[0].username);
      return;
    }

    if (task.type === 'Water') {
      // Past the cutoff there's no point pushing them out with a hose today, so
      // the nudge turns into the same offer the initial reminder would make.
      if (Helper.pastWateringCutoff()) {
        strapi.service('api::sms.sms').handleSms({
          task,
          body: `Hi ${task.volunteers[0].firstName}, did you get "${task.title}" done? Reply DONE if so. If not, no worries - a morning watering is better for the plants anyway. Reply MORNING to take it tomorrow morning, or SKIP if you can't.`,
          type: 'question'
        });
      } else {
        strapi.service('api::sms.sms').handleSms({
          task,
          body: `Hey there ${task.volunteers[0].firstName}, once you're DONE with "${task.title}" let me know you're FINISHED :) ...you always have OPTIONS`,
          type: 'followup'
        });
      }
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