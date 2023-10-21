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
    const today = new Date();
    const recent = addHours(today, 4);
    const lastCampaigns = await strapi.entityService.findMany('api::sms-campaign.sms-campaign', {
      sort: {'id': 'desc'},
      filters: {
        sent: user.id
      },
      populate: {confirmed: true, volunteer_day: true},
      limit: 3
    });
    if (!lastCampaigns[0].volunteer_day) {
      console.warn("missing volunteer day on campaign");
      return false;
    }
    if (new Date(lastCampaigns[0].volunteer_day.startDatetime).getTime() < recent.getTime()) {
      // Campaign was old. Volunter Day has passed
      return false;
    }
    let vId = lastCampaigns[0].volunteer_day.id
    console.log("Latest Campaign with VDay %s ", vId);
    let latestVolunteers = lastCampaigns.filter((lc) => lc.volunteer_day.id == vId);
    let latestConfirmed = latestVolunteers.map((lv)=> {
      return lv.confirmed.map(c=> {return c.id});
    })
    latestConfirmed = [].concat(...latestConfirmed)
    lastCampaigns[0].confirmed = latestConfirmed;
    return lastCampaigns[0]
  },

  async getUserVdayStatus(user, volunteerDay) {
    // TODO: Find out if a user has confirmed or denied going to a volunteer day
  },

  async confirmSMSCampaign(user) {
    console.log("validateSMSCampaign")
    const lastCampaign = await strapi.service('api::sms-campaign.sms-campaign').getLatestCampaign(user);
    if (!lastCampaign) {
      return {body: "Glad you're down, but I don't have anything to update for you...", type: "complete"}
    }
 
    if (lastCampaign.confirmed.find((c)=> c == user.id)) {
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

    console.log("sendGroupMsg", copy);
  
    let sentInfo = [];
  
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