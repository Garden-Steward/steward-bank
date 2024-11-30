'use strict';
// const { sanitizeOutput } = require('@strapi/utils');
// const utils = require('@strapi/utils');
const eventHelper = require('../services/helper');
/**
 * volunteer-day controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const VdayHelper = require('./VdayHelper');


module.exports = createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({

    getByUser: async ctx => {
      const authUser = ctx.state.user;
      let fullUser = await strapi.entityService.findOne('plugin::users-permissions.user', authUser.id, {
        populate: ['gardens']
      });
      if (!authUser) {
        return ctx.unauthorized('You must be logged in to access this resource');
      }
      
      const gardenIds = fullUser.gardens.map(garden => garden.id);
      const entries = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        filters: {
          garden: {
            id: {
              $in: gardenIds
            }
          },
          startDatetime: {
            $gt: new Date().toISOString()
          }
        }
      });

      return entries;

    },

    getPublic: async ctx => {
      const entries = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        sort: {startDatetime: 'desc'},
        filters: {
          accessibility: 'Public',
          startDatetime: {
            // 3 months historic
            $gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      });
      return entries;
    },

    getByGarden: async ctx => {
      
      const entries = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        sort: {startDatetime: 'desc'},
        filters: {
          garden: {
            slug: ctx.params.slug,
          }
        },
        populate: ['garden_tasks', 'garden_tasks.primary_image'],
        limit: 15,
      });
      try {
        ctx.body = entries;
      } catch (err) {
        ctx.body = err;
      }
    },

    rsvpEvent: async ctx => {
      console.log("rsvp: ", ctx.params, ctx.request.body);
      const { data } = ctx.request.body;
      const userQuery = data.userId ? {id: data.userId} : {phoneNumber: `+1${data.phoneNumber}`};
      const user = await strapi.db.query("plugin::users-permissions.user").findOne({where:userQuery, populate: ['gardens']});
      const event = await strapi.db.query("api::volunteer-day.volunteer-day")
      .findOne({
        where:{id: ctx.params.id},
        populate: ["garden"]
      });
      if (!event) {
        return {error: "Event not found"}
      }
      data.event = event;
      data.user = user;
      const alreadyMember = user?.gardens?.find(g => g.id === event.garden.id);

      if (data.userId) {
        return await eventHelper.rsvpEvent(ctx.params.id, data);
      } else if (data.phoneNumber) {
        if (!user || !alreadyMember) {
          console.log("inviting user");
          return await eventHelper.inviteUserEvent(data);
        } else {
          // user is already a member of the garden - SAFE RSVP!
          data.userId = user.id;
          return await eventHelper.rsvpEvent(ctx.params.id, data);
        }
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

