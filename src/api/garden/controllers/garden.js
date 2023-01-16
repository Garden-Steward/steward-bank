'use strict';

/**
 * garden controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::garden.garden');
