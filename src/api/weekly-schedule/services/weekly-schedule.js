'use strict';
const { format } = require('date-fns');
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);

/**
 * weekly-schedule service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::weekly-schedule.weekly-schedule', ({ strapi }) =>  ({

  /**
   * 
   * @param {object}  recurringTask Object
   * @returns weekly-schedule
   */
  async createWeeklySchedule({id, schedulers}) {
    
    console.log("creating weekly")

    // Logic for picking a volunteer out of a batch of volunteers.
    function chooseVolunteer(volunteers, {chosenArr, flatSchedulerList, lastWeekSchedulers}) {

      //Filter out previously chosen weekly schedulers.
      let weekPool = volunteers.filter(v=> !chosenArr.includes(v.id));
      weekPool = weekPool.map(f=>{return f.id})

      // If any of the volunteers have only this day of schedulers add them once more
      const extraSolo = weekPool.filter((v)=> flatSchedulerList.filter(x => x==v).length == 1);

      // If any volunteer is NOT in last week add them once more
      const extraBenched = weekPool.filter(v=> lastWeekSchedulers.indexOf(v) == -1);
      
      weekPool = weekPool.concat(extraSolo,extraBenched)
      // console.log(extraBenched, lastWeekSchedulers, "weekPool: ", weekPool, "chosen: ", chosenArr)

      const randomIndex = Math.floor(Math.random() * weekPool.length);
      return weekPool[randomIndex];
    }

    let chosenArr = [] // track already chosen volunteers so we don't give them multiple days.

    let flatSchedulerList = schedulers.map((v)=> {
      return v.backup_volunteers.map((bv) => {return bv.id})
    }).flat(1)

    const weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule(id);
    let lastWeekSchedulers = weeklySchedule.assignees.map(a=> {return a.assignee.id})

    let assignees = schedulers.map(s=> {
      let chosenIdx = chooseVolunteer(s.backup_volunteers, {chosenArr, flatSchedulerList, lastWeekSchedulers})
      chosenArr.push(chosenIdx)
      return {day: s.day, assignee: chosenIdx}
    })
    const weekTitle = format(new Date(), 'PPP')

    // TODO: Get Schedules from RecTask
    try {
      return strapi.entityService.create('api::weekly-schedule.weekly-schedule', {
        data: {
          Week:weekTitle,
          recurring_task: id,
          assignees
        },
        populate: ['assignees', 'assignees.assignee']
      });

    } catch (err) {
      console.warn("Weekly Scheduler Creating erroring: ", err);
    }
  },

  async getWeeklySchedule(recTaskId) {
    return strapi.db.query('api::weekly-schedule.weekly-schedule').findOne({
      where: { recurring_task: recTaskId },
      populate: ['assignees', 'assignees.assignee'],
      orderBy: {
        id: 'desc'
      },
    });
    // strapi.entityService.findOne('api::weekly-schedule.weekly-schedule',null, {
      
  },

  async getScheduleAssignees(assignees) {
    return assignees.map((a)=> {
      return `${a.day}: ${a.assignee.firstName} ${a.assignee.lastName.charAt(0)}`
    }).join('\n');
  },

  async sendWeeklyMsg(recTask, assignees) {

    let sentInfo = [];

    const daysCopy = assignees.map((a)=> {return `${a.day}: ${a.assignee.firstName} ${a.assignee.lastName.charAt(0)}`}).join('\n');
    const volGroup = assignees.map((a)=> {return a.assignee.id});
    
    const copy = `You've been selected to '${recTask.title}' this week! ${daysCopy}. You'll receive a reminder morning of where you can transfer if necessary.`

    for (const volunteer of assignees) {
      if (['test','stg'].indexOf(process.env.ENVIRONMENT)>-1) {continue;}

      await client.messages
        .create({
          body: copy,
          from: twilioNum,
          to: volunteer.assignee.phoneNumber
        });
      sentInfo.push(volunteer.assignee.phoneNumber);
    }
    try {
    await strapi.db.query('api::sms-campaign.sms-campaign').create({
      data: {
        publishedAt: null, sent: volGroup, body: copy
      }
    });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }

    return sentInfo
  },

}))