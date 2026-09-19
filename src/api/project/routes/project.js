'use strict';

/**
 * project router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::project.project', {
  config: {
    create: {
      middlewares: ['api::project.rate-limit'],
    },
  },
});

// Custom routes are auto-discovered by Strapi from separate files in this directory.
// See verify.js for the email-verification endpoint.
module.exports = defaultRouter;

