'use strict';
/**
 * sms-campaign controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::sms-campaign.sms-campaign', ({strapi}) => ({

  getByGarden: async ctx => {
    
    const entries = await strapi.entityService.findMany('api::sms-campaign.sms-campaign', {
      sort: {createdAt: 'desc'},
      filters: {
        garden: {
          slug: ctx.params.slug,
        }
      },
      populate: ['sent', 'confirmed'],
    });
    // console.log(entries)
    try {
      ctx.body = entries;
    } catch (err) {
      ctx.body = err;
    }


  },

  testSms: async ctx => {
    try {
      console.log("test params: ", ctx.params, ctx.request.body);
      const {body, interest, garden} = ctx.request.body;
      if (!garden) {
        return {error:"Garden is missing."}
      }
      const gardenObj = await strapi.db.query('api::garden.garden').findOne({
        where: {id: garden},
        populate: ['volunteers']
      });
  
      const vGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(gardenObj,interest);
    
      return {copy: body, numVolunteers: vGroup.length, interest}

    } catch (err) {
      console.log(err);
      return {error:"Failed to load this SMS Campaign. Garden related."}
    }
  },

  groupSms: async ctx => {
    console.log("Endpoint triggered group SMS");
    const {body, interest, garden} = ctx.request.body;
    
    const gardenObj = await strapi.db.query('api::garden.garden').findOne({
      where: {id: garden},
      populate: ['volunteers']
    });

    const vGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(gardenObj,interest);
    const sentInfo = await strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg(vGroup,body, gardenObj);
  
    return  sentInfo;
}

}));
