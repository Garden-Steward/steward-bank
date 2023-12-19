'use strict';

/**
 * instruction router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::instruction.instruction');
