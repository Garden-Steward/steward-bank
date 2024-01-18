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

  async getVolunteerGroup(vDay) {
    let volGroup = vDay.garden.volunteers
    if (vDay.interest && vDay.interest !== "Everyone") {
      let volInterests = await strapi.db.query('api::user-garden-interest.user-garden-interest').findMany({
        where: {
          garden: vDay.garden.id
        },
        populate: {
          interest: {
            where: {
              tag: vDay.interest
            }
          },
          user: true
        },
        garden: true
      });
      volInterests = volInterests.filter(vi=> vi.interest)
      volGroup = volInterests.map(vi=> {return vi.user})
    }
    return volGroup
  },

  async sendGroupMsg(vDay, copy) {

    console.log("sendGroupMsg", copy);

    let volGroup = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);

    let sentInfo = [];
    
    // TODO: Have there been any SMS campaigns for this volunteer day?
    // Check deny list of SMS Campaigns before sending


    for (const volunteer of volGroup) {
      await client.messages
        .create({
          body: copy,
          from: twilioNum,
          to: volunteer.phoneNumber
        });
      sentInfo.push(volunteer.phoneNumber);
    }
    try {
    await strapi.db.query('api::sms-campaign.sms-campaign').create({
      data: {
        publishedAt: null, sent: volGroup, volunteer_day: vDay.id, body: copy, garden: vDay.garden.id, type: 'volunteer-day'
      }
    });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }

    return sentInfo
  },
}));
