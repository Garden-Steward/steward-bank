'use strict';

/**
 * instruction service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::instruction.instruction');
