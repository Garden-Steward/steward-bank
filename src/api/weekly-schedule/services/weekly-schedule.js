'use strict';
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const { format } = require('date-fns');
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);
const weeklyScheduleHelper = require('./helper');

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
    const assignees = await weeklyScheduleHelper.getAssignees({id, schedulers})

    const weekTitle = format(new Date(), 'PPP')

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
        publishedAt: null, sent: volGroup, body: copy, garden: recTask.garden.id, type: 'recurring-task'
      }
    });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }

    return sentInfo
  },

}))