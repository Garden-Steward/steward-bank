'use strict';

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
      populate: {confirmed: true, volunteer_day: true},
      limit: 3
    });
    let vId = lastCampaigns[0].volunteer_day.id
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
  }
}));