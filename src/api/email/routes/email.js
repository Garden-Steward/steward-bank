'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/email/send-welcome/:userId',
      handler: 'email.sendWelcome',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
