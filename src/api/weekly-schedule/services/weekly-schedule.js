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

const recurringTaskDocumentId = async (id) => {
  if (!id) {
    return null;
  }
  const row = await strapi.db.query('api::recurring-task.recurring-task').findOne({
    where: { id },
    select: ['documentId'],
  });
  return row?.documentId || null;
};

module.exports = createCoreService('api::weekly-schedule.weekly-schedule', ({ strapi }) =>  ({

  /**
   * 
   * @param {object}  recurringTask Object
   * @returns weekly-schedule
   */
  async createWeeklySchedule({id, documentId, title, schedulers}) {
    const assignees = await weeklyScheduleHelper.getAssignees({id, documentId, schedulers})

    const weekTitle = format(new Date(), 'PPP')

    try {
      // Uses the Document Service API (not db.query) because db.query's
      // relation attachment can't create a repeatable component's rows
      // together with the nested `assignee` relation in Strapi v5.
      //
      // Link the recurring task by documentId, not numeric id. The Document
      // Service passes a numeric id straight through to that exact row, and the
      // cron hands us the *published* recurring task row - so the new (draft)
      // schedule ended up linked draft -> published. The admin only shows a
      // draft's relations to draft rows, so recurring_task looked empty there,
      // and publishing the schedule from the admin dropped the link entirely.
      // A documentId lets Strapi pick the version matching the schedule's own
      // status (draft -> draft).
      return await strapi.documents('api::weekly-schedule.weekly-schedule').create({
        data: {
          Week: `${title}: ${weekTitle}`,
          recurring_task: documentId || await recurringTaskDocumentId(id),
          assignees
        },
        populate: ['assignees', 'assignees.assignee']
      });

    } catch (err) {
      console.warn("Weekly Scheduler Creating erroring: ", err);
    }

  },

  /**
   * The latest weekly schedule for a recurring task.
   *
   * Matches on the recurring task's documentId so it finds the schedule
   * whichever version (draft or published) of the recurring task either side
   * is linked to. Older schedules link draft -> published (see
   * createWeeklySchedule), newer ones draft -> draft, and a schedule published
   * from the admin links published -> published.
   *
   * When a schedule has both a draft and a published row, the draft wins: it's
   * what the admin edits on Save, and publishing only copies it.
   *
   * @param {number|obj} recTask recurring task row id, or a row with documentId
   * @returns weekly-schedule row with assignees populated, or null
   */
  async getWeeklySchedule(recTask) {
    const documentId = typeof recTask === 'object'
      ? recTask?.documentId || await recurringTaskDocumentId(recTask?.id)
      : await recurringTaskDocumentId(recTask);
    if (!documentId) {
      return null;
    }

    const rows = await strapi.db.query('api::weekly-schedule.weekly-schedule').findMany({
      where: { recurring_task: { documentId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      limit: 2,
      populate: ['assignees', 'assignees.assignee', 'recurring_task'],
    });
    const latest = rows?.[0];
    if (!latest) {
      return null;
    }
    return rows.find(r => r.documentId === latest.documentId && !r.publishedAt) || latest;
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