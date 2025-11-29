'use strict';

/**
 * project controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::project.project', ({ strapi }) => ({
  // Custom controller methods can be added here
  async findByGarden(ctx) {
    const { slug } = ctx.params;
    
    const projects = await strapi.db.query('api::project.project').findMany({
      where: {
        garden: {
          slug: slug
        }
      },
      populate: ['hero_image', 'featured_gallery', 'garden', 'impact_metrics'],
      orderBy: { date: 'desc' }
    });
    
    ctx.body = projects;
  }
}));

