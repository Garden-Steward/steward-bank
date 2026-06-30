'use strict';
const eventHelper = require('../services/helper');
const { normalizePhoneNumber } = require('../../../utils/phone');
/**
 * volunteer-day controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const VdayHelper = require('./VdayHelper');


module.exports = createCoreController('api::volunteer-day.volunteer-day', ({strapi}) => ({

    // Fetch a single event by NUMERIC id. v5's core findOne keys on documentId,
    // but numeric /d/:id links are sent in SMS messages, so the frontend still
    // resolves events by numeric id through here.
    getById: async (ctx) => {
      const { id } = ctx.params;
      const entry = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
        where: { id },
        populate: {
          recurring_template: true,
          confirmed: true,
          hero_image: true,
          featured_gallery: true,
          garden: { populate: { managers: true } },
        },
      });
      if (!entry) {
        return ctx.notFound('Volunteer day not found');
      }
      return { data: entry };
    },

    async create(ctx) {
      const { data } = ctx.request.body || {};

      if (!data) {
        return await super.create(ctx);
      }

      // Check for duplicate volunteer day with same startDatetime and garden
      if (data.startDatetime) {
        const duplicateWhere = {
          startDatetime: data.startDatetime,
        };

        // Extract garden ID from various possible formats
        let gardenId = null;
        if (data.garden) {
          if (typeof data.garden === 'object') {
            gardenId = data.garden.id || (data.garden.connect && data.garden.connect[0]?.id);
          } else {
            gardenId = data.garden;
          }
        }

        if (gardenId) {
          duplicateWhere.garden = {
            id: gardenId
          };
        }

        const existingEvent = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
          where: duplicateWhere,
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
      let fullUser = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: authUser.id },
        populate: ['gardens']
      });
      if (!authUser) {
        return ctx.unauthorized('You must be logged in to access this resource');
      }

      // Extract populate from query params
      let populate = null;

      if (ctx.query.populate) {
        if (typeof ctx.query.populate === 'string') {
          if (ctx.query.populate === '*') {
            populate = '*';
          } else {
            populate = ctx.query.populate.split(',').map(field => field.trim());
          }
        } else if (Array.isArray(ctx.query.populate)) {
          populate = ctx.query.populate;
        } else if (typeof ctx.query.populate === 'object') {
          populate = Object.keys(ctx.query.populate);
        }
      }

      const gardenIds = fullUser.gardens.map(garden => garden.id);
      const queryOptions = {
        where: {
          garden: {
            id: {
              $in: gardenIds
            }
          },
          startDatetime: {
            $gt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      };

      if (populate !== null) {
        queryOptions.populate = populate;
      }

      const entries = await strapi.db.query('api::volunteer-day.volunteer-day').findMany(queryOptions);

      return entries;

    },

    getPublic: async ctx => {
      let page = null;
      let pageSize = null;

      if (ctx.query.pagination) {
        page = parseInt(ctx.query.pagination.page) || null;
        pageSize = parseInt(ctx.query.pagination.pageSize) || null;
      }
      else if (ctx.query['pagination[page]']) {
        page = parseInt(ctx.query['pagination[page]']) || null;
        pageSize = parseInt(ctx.query['pagination[pageSize]']) || null;
      }

      const where = {
        accessibility: 'Public',
        startDatetime: {
          $gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      const populate = ['hero_image', 'garden', 'garden.hero_image', 'garden.organization'];

      let entries;
      let paginationMeta = null;

      if (page !== null && pageSize !== null) {
        const offset = (page - 1) * pageSize;
        const [results, total] = await Promise.all([
          strapi.db.query('api::volunteer-day.volunteer-day').findMany({
            where,
            orderBy: { startDatetime: 'desc' },
            populate,
            offset,
            limit: pageSize,
          }),
          strapi.db.query('api::volunteer-day.volunteer-day').count({ where }),
        ]);
        entries = results;
        paginationMeta = {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        };
      } else {
        entries = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
          where,
          orderBy: { startDatetime: 'desc' },
          populate,
        });
      }

      entries = entries.map(entry => {
        const hasVolunteerDayHeroImage = entry.hero_image && entry.hero_image.id;
        if (!hasVolunteerDayHeroImage && entry.garden && entry.garden.hero_image && entry.garden.hero_image.id) {
          entry.hero_image = entry.garden.hero_image;
        }
        return entry;
      });

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
      let page = 1;
      let pageSize = 15;

      if (ctx.query.pagination) {
        page = parseInt(ctx.query.pagination.page) || 1;
        pageSize = parseInt(ctx.query.pagination.pageSize) || 15;
      }
      else if (ctx.query['pagination[page]']) {
        page = parseInt(ctx.query['pagination[page]']) || 1;
        pageSize = parseInt(ctx.query['pagination[pageSize]']) || 15;
      }

      try {
        const getByGardenPopulate = {
          hero_image: true,
          garden: {
            populate: { hero_image: true },
          },
          recurring_template: {
            populate: { hero_image: true },
          },
          garden_tasks: {
            populate: { primary_image: true },
          },
        };

        const where = {
          garden: {
            slug: ctx.params.slug,
          }
        };

        const offset = (page - 1) * pageSize;
        const [results, total] = await Promise.all([
          strapi.db.query('api::volunteer-day.volunteer-day').findMany({
            where,
            orderBy: { startDatetime: 'desc' },
            populate: getByGardenPopulate,
            offset,
            limit: pageSize,
          }),
          strapi.db.query('api::volunteer-day.volunteer-day').count({ where }),
        ]);

        const paginationMeta = {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        };

        const entries = results.map(entry => {
          const hasVolunteerDayHeroImage = entry.hero_image && entry.hero_image.id;
          if (!hasVolunteerDayHeroImage && entry.garden && entry.garden.hero_image && entry.garden.hero_image.id) {
            entry.hero_image = entry.garden.hero_image;
          }
          return entry;
        });

        ctx.body = {
          data: entries,
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
      const authUser = ctx.state.user;
      const body = ctx.request.body || {};
      const data = body.data || {};

      const userId = data.userId ?? authUser?.id;
      const phoneNumber = data.phoneNumber;

      if (!userId && !phoneNumber) {
        return ctx.badRequest(authUser
          ? 'Authenticated request: no user context (ensure JWT is sent)'
          : 'Must provide either userId or phoneNumber in data');
      }

      let userQuery;
      if (userId) {
        userQuery = { id: userId };
      } else {
        const normalized = normalizePhoneNumber(phoneNumber);
        if (!normalized.valid) {
          return ctx.badRequest(normalized.message);
        }
        userQuery = { phoneNumber: normalized.phoneNumber };
      }
      const user = await strapi.db.query("plugin::users-permissions.user").findOne({
        where: userQuery,
        populate: ['gardens']
      });

      if (userId && !user) {
        return ctx.notFound("User not found");
      }

      const event = await strapi.db.query("api::volunteer-day.volunteer-day").findOne({
        where: { id: ctx.params.id },
        populate: ["garden"]
      });

      if (!event) {
        return ctx.notFound("Event not found");
      }

      if (!event.garden) {
        return ctx.badRequest("Event has no associated garden");
      }

      const rsvpData = { event, user, userId: user?.id };

      if (userId) {
        return await eventHelper.rsvpEvent(ctx.params.id, rsvpData);
      }

      const alreadyMember = user?.gardens?.some(g => g.id === event.garden.id);
      if (!user || !alreadyMember) {
        console.log("inviting user");
        return await eventHelper.inviteUserEvent({ ...data, ...rsvpData });
      }

      rsvpData.userId = user.id;
      return await eventHelper.rsvpEvent(ctx.params.id, rsvpData);
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
    },

    getGardenMedia: async ctx => {
      try {
        const { gardenId } = ctx.params;

        const volunteerDays = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
          where: {
            garden: {
              id: gardenId
            }
          },
          populate: ['hero_image', 'featured_gallery'],
          orderBy: { updatedAt: 'desc' }
        });

        const mediaMap = new Map();

        volunteerDays.forEach(vDay => {
          const lastUsed = vDay.updatedAt || vDay.startDatetime || vDay.createdAt;

          if (vDay.hero_image && vDay.hero_image.id) {
            const mediaId = vDay.hero_image.id;

            if (!mediaMap.has(mediaId) ||
                new Date(lastUsed) > new Date(mediaMap.get(mediaId).lastUsed)) {
              mediaMap.set(mediaId, {
                media: vDay.hero_image,
                lastUsed: lastUsed
              });
            }
          }

          if (vDay.featured_gallery && Array.isArray(vDay.featured_gallery)) {
            vDay.featured_gallery.forEach(galleryMedia => {
              if (galleryMedia && galleryMedia.id) {
                const mediaId = galleryMedia.id;

                if (!mediaMap.has(mediaId) ||
                    new Date(lastUsed) > new Date(mediaMap.get(mediaId).lastUsed)) {
                  mediaMap.set(mediaId, {
                    media: galleryMedia,
                    lastUsed: lastUsed
                  });
                }
              }
            });
          }
        });

        const mediaArray = Array.from(mediaMap.values())
          .sort((a, b) => {
            return new Date(b.lastUsed) - new Date(a.lastUsed);
          })
          .map(item => item.media);

        return mediaArray;
      } catch (err) {
        console.error('Error fetching garden media:', err);
        return ctx.badRequest('Failed to fetch media for this garden');
      }
    }
}));
