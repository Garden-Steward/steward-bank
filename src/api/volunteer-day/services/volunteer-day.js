'use strict';

/**
 * volunteer-day service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::volunteer-day.volunteer-day');
