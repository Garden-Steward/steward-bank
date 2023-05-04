'use strict';

/**
 * volunteer-day controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const VdayHelper = require('./VdayHelper');


module.exports = createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({

    getByGarden: async ctx => {
      
      const entries = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        sort: {startDatetime: 'desc'},
        filters: {
          garden: {
            slug: ctx.params.slug,
          }
        },
        populate: ['garden_tasks'],
      });
      try {
        ctx.body = entries;
      } catch (err) {
        ctx.body = err;
      }


    },

    testSms: async ctx => {
      try {
        const vDay = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
          where: {id: ctx.params.id},
          populate: ['garden', 'garden.volunteers']
        });
        const vGroup = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);
        const copy = VdayHelper.buildUpcomingDayCopy(vDay);
        console.log("copy: ", copy);
        return {copy: copy, numVolunteers: vGroup.length}

      } catch (err) {
        console.log(err);
        return {error:"Failed to load this Volunteer Day."}
      }
    },

    groupSms: async ctx => {
      console.log("Endpoint triggered group SMS");
      const vDay = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
        where: {id: ctx.params.id},
        populate: ['garden', 'garden.volunteers']
      });

      const copy = VdayHelper.buildUpcomingDayCopy(vDay);
      const sentInfo = strapi.service('api::volunteer-day.volunteer-day').sendGroupMsg(vDay,copy);
    
      return  sentInfo;
  }
}));

