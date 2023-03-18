const { addHours, addDays } = require('date-fns');
const {format,utcToZonedTime,} = require("date-fns-tz");

const VdayHelper = {};
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);

/***
 * SMS COPY FOR VOLUNTEER DAY CRON EMAILS
 */
VdayHelper.buildUpcomingDayCopy = (vDay) => {
  // console.log("building copy for ", vDay.title, vDay.startDatetime);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  const timeZone = 'America/Los_Angeles'; // Let's see what time it is Down Under
  const pacificTime = utcToZonedTime(new Date(`${vDay.startDatetime}`), timeZone);
  let date = format(pacificTime, 'MMM d');
  let startTime = format(pacificTime, 'h:mmaaa');
  let copy = `${vDay.garden.title} has an upcoming volunteer day! Come by for "${vDay.title}". ${vDay.blurb} ${date}, ${startTime} to ${vDay.endText}.`
  return copy
}

VdayHelper.buildTodayCopy = (vDay) => {
  // console.log("building copy for ", vDay);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  const timeZone = 'America/Los_Angeles'; // Let's see what time it is Down Under
  const pacificTime = utcToZonedTime(new Date(`${vDay.startDatetime}`), timeZone);
  let date = format(pacificTime, 'MMM d');
  let startTime = format(pacificTime, 'h:mmaaa');
  let copy = `${vDay.garden.title} has an upcoming volunteer day! Come by for "${vDay.title}". ${vDay.blurb} ${date}, ${startTime} to ${vDay.endText}.`
  return copy
}
/**
 * 3-4 days in the future.
 * @returns arr of volunteer-days
 */
VdayHelper.getUpcomingVdays = () => {
  const today = new Date();
  const recent = addDays(today, 4);
  const toorecent = addDays(today, 3);
  return strapi.db.query('api::volunteer-day.volunteer-day').findMany({
    where: {
      startDatetime: {
        $lt: recent,
        $gt: toorecent
      },
      publishedAt: {$ne: null},
      disabled: {$ne: true}
    },
    populate: ['garden', 'garden.volunteers']
  }) 
}

VdayHelper.getTodayVdays = () => {
  const today = new Date();
  const tmrw = addHours(today, 14);
  return strapi.db.query('api::volunteer-day.volunteer-day').findMany({
    where: {
      startDatetime: {
        $lt:tmrw,
        $gte:today
      },
      publishedAt: {$ne: null},
      disabled: {$ne: true}
    },
    populate: ['garden', 'garden.volunteers']
  }) 
}


VdayHelper.sendMessage = (vDay, copy) => {
  return strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy);
}

module.exports = VdayHelper;