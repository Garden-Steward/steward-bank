'use strict';

const phoneVerification = require('./phone-verification');
const smsLogin = require('./sms-login');

module.exports = {
  routes: [
    ...phoneVerification.routes,
    ...smsLogin.routes
  ]
};
