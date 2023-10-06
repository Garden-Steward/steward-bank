'use strict';
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
  }
}));