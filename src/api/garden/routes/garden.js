'use strict';

/**
 * garden router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::garden.garden');
