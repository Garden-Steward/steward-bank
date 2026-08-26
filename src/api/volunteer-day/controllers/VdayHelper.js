const { addHours, addDays } = require('date-fns');
const {format,utcToZonedTime,} = require("date-fns-tz");
const { dedupeByDocument } = require('../../../utils/documents');

const VdayHelper = {};

VdayHelper.getDateCopy = (vDay) => {
  const timeZone = 'America/Los_Angeles'; // Let's see what time it is Down Under
  const pacificTime = utcToZonedTime(new Date(`${vDay.startDatetime}`), timeZone);
  let date = format(pacificTime, 'MMM d');
  let startTime = format(pacificTime, 'h:mmaaa');
  return {startTime, date}
}

VdayHelper.addSmsLink = (copy, vDay) => {
  if (vDay.smsLink) {
    copy += `\n\nView event info here: \nhttps://steward.garden/d/${vDay.id}`;
  }
  return copy;
}

/***
 * SMS COPY FOR VOLUNTEER DAY CRON EMAILS
 */
VdayHelper.buildUpcomingDayCopy = (vDay) => {
  // console.log("building copy for ", vDay.title, vDay.startDatetime);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  const {date, startTime} = VdayHelper.getDateCopy(vDay);
  let interestCopy = VdayHelper.buildEventInterestCopy(vDay);
  let copy = `${vDay.garden.title} has an upcoming ${interestCopy} "${vDay.title}". ${vDay.blurb} ${date}, ${startTime} to ${vDay.endText}.`
  copy = VdayHelper.addSmsLink(copy, vDay);
  return copy
}

VdayHelper.buildTomorrowCopy = (vDay) => {
  // console.log("building copy for ", vDay.title, vDay.startDatetime);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  const {startTime} = VdayHelper.getDateCopy(vDay);
  let interestCopy = VdayHelper.buildEventInterestCopy(vDay);
  let copy = `Tomorrow!! ${vDay.garden.title} has ${interestCopy} "${vDay.title}". ${vDay.blurb} `
  if (vDay.endText) {
    copy += `Come by from ${startTime} to ${vDay.endText}.`
  } else {
    copy += ` starts at ${startTime}.`
  }
  copy = VdayHelper.addSmsLink(copy, vDay);
  return copy
}

VdayHelper.buildEventInterestCopy = (vDay) => {

  switch (vDay.interest) {
    case 'Meetings':
      return 'a meeting. Hope to see you for';
    case 'Events':
      return 'event! See you at'
    case 'Volunteering':
      return 'a volunteer day! Come by for'
    default:
      return 'event! All welcome at';
  }
}

VdayHelper.buildTodayCopy = (vDay) => {
  // console.log("building copy for ", vDay);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  const {date, startTime} = VdayHelper.getDateCopy(vDay);
  let interestCopy = VdayHelper.buildEventInterestCopy(vDay);
  let copy = `Today's the day for ${vDay.garden.title}'s ${interestCopy} "${vDay.title}". ${vDay.blurb} ${date},`
  if (vDay.endText) {
    copy += ` ${startTime} to ${vDay.endText}.`
  } else {
    copy += ` starts at ${startTime}.`
  }
  return copy
}
/**
 * Collapse the draft/published twins the query engine returns down to one row
 * per event, so a published event isn't texted out twice. See
 * src/utils/documents.js — the recurring-task cron needs the same thing.
 *
 * @param {arr} vDays
 * @returns {arr} one row per event
 */
VdayHelper.dedupeByDocument = (vDays) => dedupeByDocument(vDays);

/**
 * 3-4 days in the future.
 * @returns arr of volunteer-days
 */
VdayHelper.getUpcomingVdays = async () => {
  const today = new Date();
  const recent = addDays(today, 8);
  const toorecent = addDays(today, 7);
  const vDays = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
    where: {
      startDatetime: {
        $lt: recent,
        $gt: toorecent
      },
      // publishedAt: {$ne: null},
      disabled: {$ne: true},
      canceled: {$ne: true}
    },
    populate: ['garden', 'garden.volunteers']
  });

  return VdayHelper.dedupeByDocument(vDays);
}

VdayHelper.getTodayVdays = async () => {
  const today = new Date();
  const tmrw = addHours(today, 14);
  const vDays = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
    where: {
      startDatetime: {
        $lt:tmrw,
        $gte:today
      },
      // publishedAt: {$ne: null},
      disabled: {$ne: true},
      canceled: {$ne: true}
    },
    populate: ['garden', 'garden.volunteers']
  });

  return VdayHelper.dedupeByDocument(vDays);
}
VdayHelper.getTomorrowVdays = async () => {
  const today = new Date();
  const tmrw = addHours(today, 14);
  const nextDay = addHours(tmrw, 30);  //38, aka 24 hours after 14 hours: Sent an email two days before volunteer day AND day before
  const vDays = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
    where: {
      startDatetime: {
        $lt:nextDay,
        $gte:tmrw
      },
      // publishedAt: {$ne: null},
      disabled: {$ne: true},
      canceled: {$ne: true}
    },
    populate: ['garden', 'garden.volunteers']
  });

  return VdayHelper.dedupeByDocument(vDays);
}


VdayHelper.sendMessage = (vDay, copy) => {
  return strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy);
}

module.exports = VdayHelper;