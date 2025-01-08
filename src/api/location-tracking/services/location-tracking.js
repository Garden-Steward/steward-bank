'use strict';

/**
 * location-tracking service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::location-tracking.location-tracking');
