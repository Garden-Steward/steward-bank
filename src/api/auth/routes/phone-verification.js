'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/auth/phone-signup',
      handler: 'phone-verification.phoneSignup',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      method: 'POST',
      path: '/auth/verify-email',
      handler: 'phone-verification.verifyEmail',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      method: 'POST',
      path: '/auth/set-password',
      handler: 'phone-verification.setPassword',
      config: {
        policies: [],
        middlewares: []
      }
    }
  ]
};
