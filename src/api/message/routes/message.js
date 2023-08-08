'use strict';

/**
 * message router
 */

// const { createCoreRouter } = require('@strapi/strapi').factories;

// module.exports = createCoreRouter('api::message.message');

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sms/requestEmail/:id',
      handler: 'message.requestEmail',
      config: {
        policies: [],
        middlewares: [],
      },
     },
     {
     method: 'POST',
     path: '/sms',
     handler: 'message.fetchSms',
     config: {
       policies: [],
       middlewares: [],
     },
    },
  ],
};
