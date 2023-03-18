'use strict';
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);


/**
 * volunteer-day service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::volunteer-day.volunteer-day', ({ strapi }) =>  ({

  async sendGroupMsg(vDay, copy) {

    console.log("sendGroupMsg", copy);
    let sentInfo = [];

    for (const volunteer of vDay.garden.volunteers) {
      await client.messages
        .create({
          body: copy,
          from: twilioNum,
          to: volunteer.phoneNumber
        });
      sentInfo.push(volunteer.phoneNumber);
    }

    // let response = { okay: true }

    // if (response.okay === false) {
    //   return { response, error: true }
    // }

    return sentInfo
  },
}));
