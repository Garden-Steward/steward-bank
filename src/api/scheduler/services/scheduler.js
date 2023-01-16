'use strict';

/**
 * scheduler service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::scheduler.scheduler');
