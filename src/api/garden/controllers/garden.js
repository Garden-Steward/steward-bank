'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::garden.garden', ({ strapi }) => ({
  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    console.log(ctx.params, ctx.query)
    const entity = await strapi.db.query('api::garden.garden').findOne({
      where: {slug: ctx.params.slug},
      populate: { recurring_tasks: true, volunteers:true }
    });
    // const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

    // return 
    try {
      ctx.body = this.transformResponse(entity);
    } catch (err) {
      ctx.body = err;
    }
  }, 
  
  async find(ctx) {
    if (ctx.state.user.role.type !== 'administrator') {
      console.log(ctx.state.user)

      const gardens = await strapi.db.query('api::garden.garden').findMany({
        where: {
          volunteers: ctx.state.user.id
        },
        populate: ['volunteers']
      });

      // CAUTION: SANITIZING LOSES POPULATED
      // const sanitizedResults = await this.sanitizeOutput(gardens, ctx);
      return this.transformResponse(gardens);
    }
        
    // Calling the default core action
    const { data, meta } = await super.find(ctx);
    // some more custom logic
    meta.date = Date.now()
    meta.test = "ADMINISTRATOR STUFF YAY";

    return { data, meta };
  }
}));