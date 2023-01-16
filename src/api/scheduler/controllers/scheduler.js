'use strict';

/**
 * scheduler controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::scheduler.scheduler');
