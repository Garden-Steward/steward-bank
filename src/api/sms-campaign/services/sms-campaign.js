'use strict';

/**
 * sms-campaign service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::sms-campaign.sms-campaign', ({ strapi }) =>  ({
  async confirmSMSCampaign(user) {
    console.log("validateSMSCampaign")
    const lastCampaign = await strapi.entityService.findMany('api::sms-campaign.sms-campaign', {
      sort: {'id': 'desc'},
      filters: {
        sent: user.id
      },
      populate: {confirmed: true},
      limit: 1
    });

    if (lastCampaign[0].confirmed.find((c)=> c.id == user.id)) {
      return {body: "Already got you boo!", type: "complete"}
    } else {
      let newconfirms = lastCampaign[0].confirmed.map((c)=> {return c.id});
      newconfirms.push(user.id)
      try {
        await strapi.entityService.update('api::sms-campaign.sms-campaign', lastCampaign[0].id, {
          data: {
            confirmed: newconfirms
          }
        });
      } catch (err) {
        console.error(err);
      }

      return {body: "Thanks for RSVPing! We've got you confirmed", type: "complete"}
    }



  }
}));