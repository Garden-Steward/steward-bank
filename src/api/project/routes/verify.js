'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/projects/verify',
      handler: 'verify.verify',
      config: {
        auth: false,
      },
    },
  ],
};