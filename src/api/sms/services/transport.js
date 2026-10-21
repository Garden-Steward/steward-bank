'use strict';

// The one place that talks to Twilio. Plain object (no factory, no strapi) so it can be
// required standalone in tests. Registers as api::sms.transport.

const defaultFactory = (accountSid, authToken) => require('twilio')(accountSid, authToken);
let clientFactory = defaultFactory;
let client = null;

// Read env on every call: a change to process.env takes effect without a reboot.
// ENVIRONMENT === 'stg' is deliberately not dry-run (staging sends for real).
const isDryRun = () => {
  const flag = process.env.SMS_DRY_RUN;
  return flag === 'true' || flag === '1' || process.env.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test';
};

const getClient = () => {
  if (!client) client = clientFactory(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
};

const create = async ({ to, body, mediaUrl } = {}) => {
  if (isDryRun()) return { sid: null, numSegments: null, numMedia: null, simulated: true };
  const msg = await getClient().messages.create({ body, from: process.env.TWILIONUM, to, ...(mediaUrl && { mediaUrl }) });
  return { sid: msg.sid, numSegments: msg.numSegments, numMedia: msg.numMedia, simulated: false };
};

// Test seam: swap the client factory; null restores the real one. Always drops the memoized client.
const _setClientFactory = (fn) => { clientFactory = fn || defaultFactory; client = null; };

module.exports = { isDryRun, create, _setClientFactory };
