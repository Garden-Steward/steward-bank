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

    async create(ctx) {
      const { data } = ctx.request.body;

      // Check for duplicate volunteer day with same startDatetime and garden
      if (data.startDatetime) {
        const duplicateFilters = {
          startDatetime: data.startDatetime,
        };

        // Extract garden ID from various possible formats
        let gardenId = null;
        if (data.garden) {
          if (typeof data.garden === 'object') {
            // Handle {id: ...} or {connect: [{id: ...}]} formats
            gardenId = data.garden.id || (data.garden.connect && data.garden.connect[0]?.id);
          } else {
            // Handle direct ID
            gardenId = data.garden;
          }
        }

        // If garden is provided, also check for same garden
        if (gardenId) {
          duplicateFilters.garden = {
            id: gardenId
          };
        }

        const existingEvent = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
          filters: duplicateFilters,
          limit: 1,
        });

        if (existingEvent && existingEvent.length > 0) {
          return ctx.badRequest('A volunteer day with the same start date/time already exists' + 
            (gardenId ? ' for this garden' : '') + '.');
        }
      }

      // Call the default create method if no duplicate found
      return await super.create(ctx);
    },

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
      // Extract pagination parameters from query string
      let page = null;
      let pageSize = null;
      
      // Try nested object access first (most common)
      if (ctx.query.pagination) {
        page = parseInt(ctx.query.pagination.page) || null;
        pageSize = parseInt(ctx.query.pagination.pageSize) || null;
      } 
      // Fallback to bracket notation (if Koa parses as string keys)
      else if (ctx.query['pagination[page]']) {
        page = parseInt(ctx.query['pagination[page]']) || null;
        pageSize = parseInt(ctx.query['pagination[pageSize]']) || null;
      }

      const filters = {
        accessibility: 'Public',
        startDatetime: {
          // 3 months historic
          $gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      // Always populate hero_image (volunteer-day's) and garden with its hero_image
      const populate = ['hero_image', 'garden', 'garden.hero_image'];

      let entries;
      let paginationMeta = null;

      // Use findPage if pagination is requested
      if (page !== null && pageSize !== null) {
        const result = await strapi.entityService.findPage('api::volunteer-day.volunteer-day', {
          sort: {startDatetime: 'desc'},
          filters,
          populate,
          page,
          pageSize,
        });
        entries = result.results;
        paginationMeta = result.pagination;
      } else {
        entries = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
          sort: {startDatetime: 'desc'},
          filters,
          populate,
        });
      }

      // Prefer volunteer-day's hero_image over garden's hero_image
      entries = entries.map(entry => {
        // Check if volunteer-day has a valid hero_image (has id property)
        const hasVolunteerDayHeroImage = entry.hero_image && entry.hero_image.id;
        
        // Only use garden's hero_image if volunteer-day doesn't have one
        if (!hasVolunteerDayHeroImage && entry.garden && entry.garden.hero_image && entry.garden.hero_image.id) {
          entry.hero_image = entry.garden.hero_image;
        }
        return entry;
      });

      // Return paginated response if pagination was requested
      if (page !== null && pageSize !== null) {
        return {
          data: entries,
          meta: {
            pagination: paginationMeta
          }
        };
      }

      return entries;
    },

    getByGarden: async ctx => {
      // Extract pagination parameters from query string
      // Strapi/Koa may parse nested query params differently
      // Try multiple access patterns to be safe
      let page = 1;
      let pageSize = 15;
      
      // Try nested object access first (most common)
      if (ctx.query.pagination) {
        page = parseInt(ctx.query.pagination.page) || 1;
        pageSize = parseInt(ctx.query.pagination.pageSize) || 15;
      } 
      // Fallback to bracket notation (if Koa parses as string keys)
      else if (ctx.query['pagination[page]']) {
        page = parseInt(ctx.query['pagination[page]']) || 1;
        pageSize = parseInt(ctx.query['pagination[pageSize]']) || 15;
      }
      
      console.log("ctx.query:", JSON.stringify(ctx.query, null, 2));
      console.log("Extracted - page:", page, "pageSize:", pageSize);
      
      try {
        // findPage supports page and pageSize directly (no need to convert to start/limit)
        const { results, pagination: paginationMeta } = await strapi.entityService.findPage('api::volunteer-day.volunteer-day', {
          sort: {startDatetime: 'desc'},
          filters: {
            garden: {
              slug: ctx.params.slug,
            }
          },
          populate: ['garden_tasks', 'garden_tasks.primary_image'],
          page,
          pageSize,
        });
        
        ctx.body = {
          data: results,
          meta: {
            pagination: paginationMeta
          }
        };
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

