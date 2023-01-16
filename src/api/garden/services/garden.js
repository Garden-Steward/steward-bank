'use strict';

/**
 * garden service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::garden.garden');
