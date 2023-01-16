'use strict';

/**
 * weather controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::weather.weather');
