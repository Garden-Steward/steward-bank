'use strict';

/**
 * scheduler router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::scheduler.scheduler');
