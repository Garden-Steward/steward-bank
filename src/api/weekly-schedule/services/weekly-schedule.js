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
    function chooseVolunteer(volunteers, chosenArr, schedulers) {

      //Filter out previously chosen weekly schedulers.
      let filtered = volunteers.filter(v=> !chosenArr.includes(v.id));
      filtered = filtered.map(f=>{return f.id})

      // If any of the volunteers have a single length of schedulers add them once more
      let addExtras = filtered.filter((v)=> schedulers.filter(x => x==v).length == 1)
      filtered = filtered.concat(addExtras)

      // TODO: Get prior week recurring task
      const randomIndex = Math.floor(Math.random() * filtered.length);
      return filtered[randomIndex];
    }

    let chosenArr = [] // track already chosen volunteers so we don't give them multiple days.

    let simpleSchedulers = schedulers.map((v)=> {
      return v.backup_volunteers.map((bv) => {return bv.id})
    }).flat(1)

    let assignees = schedulers.map(s=> {
      let chosenIdx = chooseVolunteer(s.backup_volunteers, chosenArr, simpleSchedulers)
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

  async getWeeklySchedule(recTask) {
    return strapi.db.query('api::weekly-schedule.weekly-schedule').findOne({
      where: { recurring_task: recTask.id },
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