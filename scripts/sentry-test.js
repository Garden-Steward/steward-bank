'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../instrument.js');
const Sentry = require('@sentry/node');

if (!process.env.SENTRY_DSN) {
  console.error('Set SENTRY_DSN in .env (or the environment) before running this script.');
  process.exit(1);
}

try {
  foo();
} catch (e) {
  Sentry.captureException(e);
}

Sentry.flush(2000).then(() => {
  console.log('Sent test error to Sentry (if DSN is valid). Check your Sentry project.');
});
