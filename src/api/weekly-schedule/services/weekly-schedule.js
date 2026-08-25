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
  async createWeeklySchedule({id, title, schedulers}) {
    const assignees = await weeklyScheduleHelper.getAssignees({id, schedulers})

    const weekTitle = format(new Date(), 'PPP')

    try {
      // Uses the Document Service API (not db.query) because db.query's
      // relation attachment can't create a repeatable component's rows
      // together with the nested `assignee` relation in Strapi v5.
      return await strapi.documents('api::weekly-schedule.weekly-schedule').create({
        data: {
          Week: `${title}: ${weekTitle}`,
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
      // Use strapi.documents() (Strapi v5 proper API) instead of db.query.
      // Filter by relation numeric id, not documentId.
      const schedules = await strapi.documents('api::weekly-schedule.weekly-schedule').findMany({
        filters: { recurring_task: { id: recTaskId } },
        populate: ['assignees', 'assignees.assignee'],
        sort: 'id:desc',
        limit: 1,
      });
      return schedules?.[0] ?? null;
    },

  async getScheduleAssignees(assignees) {
    return assignees.map((a)=> {
      if (!a.assignee) {
        return `${a.day}: Unassigned`;
      }
      return `${a.day}: ${a.assignee.firstName} ${a.assignee.lastName.charAt(0)}`
    }).join('\n');
  },

  async sendWeeklyMsg(recTask, assignees) {

    let sentInfo = [];

    // A day has no assignee when everyone in its pool is on vacation.
    const filled = (assignees || []).filter(a => a.assignee);

    const daysCopy = (assignees || []).map((a)=> {
      if (!a.assignee) { return `${a.day}: Unassigned`; }
      return `${a.day}: ${a.assignee.firstName} ${a.assignee.lastName.charAt(0)}`;
    }).join('\n');
    const volGroup = filled.map((a)=> {return a.assignee.id});

    const copy = `You've been selected to '${recTask.title}' this week! \n${daysCopy}. \nYou'll receive a reminder morning of where you can transfer if necessary.`

    for (const volunteer of filled) {
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