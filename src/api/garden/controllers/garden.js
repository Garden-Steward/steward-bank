'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::garden.garden', ({ strapi }) => ({
  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    console.log(ctx.params.slug, ctx.query);
    // const weather = await strapi.db.query('api::weather.weather').findOne({
    //   where: {openweather_id: garden.openweather_id},
    //   orderBy: {dt: 'DESC'}
    // });

    const entity = await strapi.db.query('api::garden.garden').findOne({
      where: {slug: ctx.params.slug},
      populate: { recurring_tasks: true, volunteers:true }
    });
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

    // return 
    try {
      ctx.body = this.transformResponse(entity);
    } catch (err) {
      ctx.body = err;
    }
  }
}));