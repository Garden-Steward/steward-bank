'use strict';

const phoneVerification = require('./phone-verification');

module.exports = {
  routes: [
    ...phoneVerification.routes
  ]
};
