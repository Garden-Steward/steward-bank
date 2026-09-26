'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/auth/sms-login/request',
      handler: 'sms-login.request',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/auth/sms-login/verify',
      handler: 'sms-login.verify',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
