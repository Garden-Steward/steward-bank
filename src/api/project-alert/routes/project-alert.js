'use strict';

// Custom routes only: there is deliberately no core router, so the list of
// subscriber emails is never exposed through the REST API.
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/project-alerts',
      handler: 'project-alert.subscribe',
      config: {
        auth: false,
        middlewares: ['api::project-alert.rate-limit'],
      },
    },
    {
      method: 'GET',
      path: '/project-alerts/unsubscribe',
      handler: 'project-alert.unsubscribe',
      config: { auth: false },
    },
  ],
};
