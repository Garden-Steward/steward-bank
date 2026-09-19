'use strict';

/**
 * project router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::project.project');

// Custom routes are injected by Strapi via separate route files in this directory.
// See verify.js for the email-verification endpoint.
module.exports = defaultRouter;

