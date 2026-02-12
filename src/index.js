'use strict';

const slugify = require('slugify');

// Content types that need auto-slug generation (replaces strapi-plugin-slugify)
const SLUG_CONTENT_TYPES = {
  'api::blog.blog': { field: 'slug', reference: 'title' },
  'api::plant.plant': { field: 'slug', reference: 'title' },
  'api::volunteer-day.volunteer-day': { field: 'slug', reference: 'title' },
  'api::instruction.instruction': { field: 'slug', reference: 'title' },
};

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // Register document service middleware for auto-slug generation
    strapi.documents.use(async (context, next) => {
      const config = SLUG_CONTENT_TYPES[context.uid];

      if (config && ['create', 'update'].includes(context.action)) {
        const data = context.params?.data;
        if (data && data[config.reference] && !data[config.field]) {
          data[config.field] = slugify(data[config.reference], {
            lower: true,
            strict: true,
          });
        }
      }

      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/*{ strapi }*/) {},
};
