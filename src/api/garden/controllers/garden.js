'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::garden.garden', ({ strapi }) => ({
  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    const entity = await strapi.db.query('api::garden.garden').findOne({
      where: {slug: ctx.params.slug},
      populate: [
        "recurring_tasks",
        "volunteers", "volunteers.role", "volunteers.u_g_interests", "volunteers.u_g_interests.interest", "volunteers.u_g_interests.garden",
        "managers","organization", "hero_image", "featured_gallery",
      ]
    });
    
    const interests = await strapi.db.query('api::interest.interest').findMany({
      columns:['tag'],
      where: {gardens: entity.id}
    });
    
    entity.interests = interests;

    try {
      ctx.body = this.transformResponse(entity);
    } catch (err) {
      ctx.body = err;
    }
  }, 
  
  async find(ctx) {
    // Handle public access (no authenticated user)
    if (!ctx.state.user) {
      // For public access, use the default core action which respects permissions
      const { data, meta } = await super.find(ctx);
      return { data, meta };
    }
    // Handle authenticated non-administrator users
    if (ctx.state.user.role.type !== 'administrator') {
      // Extract populate from query params
      let populate = ['volunteers']; // Always include volunteers
      
      if (ctx.query.populate) {
        // Handle different populate formats from Strapi query string
        if (typeof ctx.query.populate === 'string') {
          // Format: ?populate=field1,field2 or ?populate=*
          if (ctx.query.populate === '*') {
            populate = '*';
          } else {
            // Parse comma-separated string and merge with volunteers
            const requestedPopulate = ctx.query.populate.split(',').map(field => field.trim());
            populate = [...new Set([...populate, ...requestedPopulate])]; // Merge and deduplicate
          }
        } else if (Array.isArray(ctx.query.populate)) {
          // Format: ?populate[]=field1&populate[]=field2
          populate = [...new Set([...populate, ...ctx.query.populate])]; // Merge and deduplicate
        } else if (typeof ctx.query.populate === 'object') {
          // Format: ?populate[field1]=true&populate[field2]=true
          const requestedPopulate = Object.keys(ctx.query.populate);
          populate = [...new Set([...populate, ...requestedPopulate])]; // Merge and deduplicate
        }
      }
      
      // Determine filter based on manage query parameter
      // Only filter if manage=true, otherwise show all gardens
      const whereClause = ctx.query.manage === 'true' || ctx.query.manage === true
        ? { managers: ctx.state.user.id }
        : {};
      
      const gardens = await strapi.db.query('api::garden.garden').findMany({
        where: whereClause,
        populate: populate
      });

      // CAUTION: SANITIZING LOSES POPULATED
      // const sanitizedResults = await this.sanitizeOutput(gardens, ctx);
      return this.transformResponse(gardens);
    }
        
    // Calling the default core action for administrators
    const { data, meta } = await super.find(ctx);
    // some more custom logic
    meta.date = Date.now()
    meta.test = "ADMINISTRATOR STUFF YAY";

    return { data, meta };
  }
}));