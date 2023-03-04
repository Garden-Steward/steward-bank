'use strict';

/**
 * volunteer-day controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { format } = require('date-fns');

module.exports = createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({

    groupSms: async ctx => {
      const accountSid = process.env.TWILIO_ACCOUNT_SID ;
      const authToken = process.env.TWILIO_AUTH_TOKEN  ;
      const twilioNum =process.env.TWILIONUM;
      const client = require('twilio')(accountSid, authToken);

      console.log("group sms");
      const vDay = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
        where: {id: ctx.params.id},
        populate: ['garden', 'garden.volunteers']
      });

      let sentInfo = [];
      for (const volunteer of vDay.garden.volunteers) {
        let user = await strapi.db.query("plugin::users-permissions.user").findOne({id:volunteer});
        let startTime = format(new Date(`${vDay.date} ${vDay.startTime}`),'H:mma');
        await client.messages
          .create({
            body: `${vDay.garden.title} Upcoming Volunteer Day: ${vDay.title}. ${vDay.blurb}. ${vDay.date}, ${startTime} to about noon. Hope to see you there!`,
            from: twilioNum,
            to: user.phoneNumber
          });
        sentInfo.push(user.phoneNumber);
      }
    
      return  sentInfo;
  }
}));

