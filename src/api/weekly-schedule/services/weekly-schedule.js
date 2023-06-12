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
    function chooseVolunteer(volunteers, chosenArr) {
      // @TODO: make sure selected isn't in chosenArr
      const filtered = volunteers.filter(v=> {
        if (!chosenArr.includes(v.id)) {
          return v
        }
      })
      const randomIndex = Math.floor(Math.random() * filtered.length);
      return filtered[randomIndex];
    }
    let chosenArr = []
    let assignees = schedulers.map(s=> {
      let chosen = chooseVolunteer(s.backup_volunteers, chosenArr)
      chosenArr.push(chosen.id)
      return {day: s.day, assignee: chosen.id}
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

  async sendWeeklyMsg(assignees) {

    let sentInfo = [];

    const daysCopy = assignees.map((a)=> {return `${a.day}: ${a.assignee.firstName} ${a.assignee.lastName.charAt(0)}`}).join(', ');
    const volGroup = assignees.map((a)=> {return a.assignee.id});
    
    // TODO: Have there been any SMS campaigns for this volunteer day?
    // Check deny list of SMS Campaigns before sending
    const copy = `You're on the watering list this week! ${daysCopy}. Feel free to swap out on your watering day if needed.`

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