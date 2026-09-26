'use strict';

const phoneVerification = require('./phone-verification');
const smsLogin = require('./sms-login');

module.exports = {
  'phone-verification': phoneVerification,
  'sms-login': smsLogin
};
