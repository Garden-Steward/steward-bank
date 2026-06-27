'use strict';

/**
 * location-tracking controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const Geo = require('../../../../config/helpers/geo');

function parseCoordinate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

async function canConfirmGarden(user, locationTracking) {
  if (!user) {
    return false;
  }
  if (user.role?.type === 'administrator') {
    return true;
  }
  if (locationTracking.user?.id === user.id) {
    return true;
  }
  const gardenId = locationTracking.garden?.id ?? locationTracking.garden;
  if (!gardenId) {
    return false;
  }
  const garden = await strapi.db.query('api::garden.garden').findOne({
    where: { id: gardenId },
    populate: ['managers'],
  });
  return (garden?.managers || []).some((manager) => manager.id === user.id);
}

module.exports = createCoreController('api::location-tracking.location-tracking', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    const body = ctx.request.body?.data || ctx.request.body || {};

    if (user && body.user === undefined) {
      body.user = user.id;
    }

    ctx.request.body = { data: body };
    return await super.create(ctx);
  },

  async nearbyGardens(ctx) {
    const latitude = parseCoordinate(ctx.query.latitude);
    const longitude = parseCoordinate(ctx.query.longitude);

    if (latitude === null || longitude === null) {
      return ctx.badRequest('latitude and longitude query parameters are required');
    }

    const gardens = await strapi.service('api::garden.garden').getCachedGardens();
    const matches = Geo.findMatchingGardens(latitude, longitude, gardens).map(Geo.formatGardenMatch);

    return { data: matches };
  },

  async confirmGarden(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to confirm garden assignment');
    }

    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const { confirmed, garden: gardenOverride } = body;

    if (typeof confirmed !== 'boolean') {
      return ctx.badRequest('confirmed (boolean) is required');
    }

    const locationTracking = await strapi.db.query('api::location-tracking.location-tracking').findOne({
      where: { id },
      populate: ['user', 'garden'],
    });

    if (!locationTracking) {
      return ctx.notFound('Location tracking not found');
    }

    if (!(await canConfirmGarden(user, locationTracking))) {
      return ctx.forbidden('You are not allowed to confirm garden assignment for this location');
    }

    const updateData = {};

    if (confirmed) {
      let gardenId = locationTracking.garden?.id ?? locationTracking.garden;
      if (gardenOverride !== undefined && gardenOverride !== null) {
        gardenId = typeof gardenOverride === 'object' ? gardenOverride.id : gardenOverride;
      }
      if (!gardenId) {
        return ctx.badRequest('No garden to confirm; provide garden when confirming');
      }
      updateData.garden = gardenId;
      updateData.garden_assignment_status = 'confirmed';
    } else {
      updateData.garden = null;
      updateData.garden_assignment_status = 'declined';
      updateData.suggested_distance_meters = null;
      updateData.suggested_match_method = null;
    }

    const updated = await strapi.db.query('api::location-tracking.location-tracking').update({
      where: { id },
      data: updateData,
      populate: ['garden', 'plant', 'user'],
    });

    return this.transformResponse(updated);
  },

  async findByGarden(ctx) {
    const { slug } = ctx.params;

    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { slug },
    });

    if (!garden) {
      return ctx.notFound('Garden not found');
    }

    const locations = await strapi.db.query('api::location-tracking.location-tracking').findMany({
      where: {
        garden: garden.id,
        garden_assignment_status: 'confirmed',
        publishedAt: { $notNull: true },
      },
      populate: ['plant', 'garden', 'user', 'plant_image', 'location_image'],
      orderBy: { createdAt: 'desc' },
    });

    return this.transformResponse(locations);
  },
}));
