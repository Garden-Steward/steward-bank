'use strict';

/**
 * recurring-task service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::recurring-task.recurring-task');
