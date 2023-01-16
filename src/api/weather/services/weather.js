'use strict';

/**
 * weather service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::weather.weather');
