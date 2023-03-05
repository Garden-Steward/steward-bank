'use strict';

/**
 * volunteer-day controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const VdayHelper = require('./VdayHelper');


module.exports = createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({

    testSms: async ctx => {
      try {
        const vDay = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
          where: {id: ctx.params.id},
          populate: ['garden', 'garden.volunteers']
        });
        const copy = VdayHelper.buildDayCopy(vDay);
        console.log("copy: ", copy);
        return {copy: copy}

      } catch (err) {
        console.log(err);
        return {error:"Failed to load this Volunteer Day."}
      }
    },

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
        const copy = VdayHelper.buildDayCopy(vDay);
        await client.messages
          .create({
            body: copy,
            from: twilioNum,
            to: user.phoneNumber
          });
        sentInfo.push(user.phoneNumber);
      }
    
      return  sentInfo;
  }
}));

