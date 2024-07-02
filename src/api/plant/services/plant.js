'use strict';

/**
 * plant service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::plant.plant');
