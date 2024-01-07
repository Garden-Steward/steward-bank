'use strict';
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);

const { addHours } = require('date-fns');

/**
 * sms-campaign service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::sms-campaign.sms-campaign', ({ strapi }) =>  ({

  /**
   * 
   * @param {obj} user 
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async getLatestCampaign(user) {

    const lastCampaigns = await strapi.entityService.findMany('api::sms-campaign.sms-campaign', {
      sort: {'id': 'desc'},
      filters: {
        sent: user.id
      },
      populate: {sent: true, confirmed: true, volunteer_day: true},
      limit: 3
    });

    return lastCampaigns[0];

  },

  async getUserVdayStatus(user, volunteerDay) {
    // TODO: Find out if a user has confirmed or denied going to a volunteer day
  },

  async confirmSMSCampaign(user) {
    console.log("validateSMSCampaign")
    const lastCampaign = await strapi.service('api::sms-campaign.sms-campaign').getLatestCampaign(user);
    console.log("lastCampaign: ", lastCampaign.body)
    if (!lastCampaign) {
      return {body: "Glad you're down, but I don't have anything to update for you...", type: "complete"}
    }
 
    if (lastCampaign.confirmed.find((c)=> c.id == user.id)) {
      return {body: "Already got you boo!", type: "complete"}
    } else {
      lastCampaign.confirmed.push(user.id)
      try {
        await strapi.entityService.update('api::sms-campaign.sms-campaign', lastCampaign.id, {
          data: {
            confirmed: lastCampaign.confirmed
          }
        });
      } catch (err) {
        console.error(err);
      }

      return {body: "Thanks for RSVPing! We've got you confirmed", type: "complete"}
    }
  },

  sendGroupMsg: async (volGroup, copy, gardenObj) => {

    console.log("sendGroupMsg on SMS Campaign: \n", copy);
  
    let sentInfo = [];
  
    for (const volunteer of volGroup) {
      if (!volunteer.phoneNumber) { continue; }
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
        publishedAt: null, sent: volGroup, body: copy, garden: gardenObj.id
      }
    });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }
  
    return sentInfo
  },

  // async sendGardenInterestMsg(garden, copy, interest) {

  //   console.log("sendGroupMsg", copy);

  //   let volGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(garden, interest);

  //   let sentInfo = [];
    
  //   for (const volunteer of volGroup) {
  //     await client.messages
  //       .create({
  //         body: copy,
  //         from: twilioNum,
  //         to: volunteer.phoneNumber
  //       });
  //     sentInfo.push(volunteer.phoneNumber);
  //   }
  //   try {
  //   await strapi.db.query('api::sms-campaign.sms-campaign').create({
  //     data: {
  //       publishedAt: null, sent: volGroup, volunteer_day: vDay.id, body: copy, garden: vDay.garden.id
  //     }
  //   });
  //   } catch (err) {
  //     console.warn('Could not save sms campaign: ', err);
  //   }

  //   return sentInfo
  // },

}));