'use strict';

/**
 * Pure Twilio webhook signature evaluation. No Strapi, no I/O.
 * See design.md section 9 for the outcome table.
 */

const resolveMode = (raw) => {
  if (raw === 'enforce') return { mode: 'enforce', unknown: false };
  if (raw === undefined || raw === '' || raw === 'log') return { mode: 'log', unknown: false };
  return { mode: 'log', unknown: true };
};

const evaluate = ({ mode, authToken, url, signature, params } = {}) => {
  const missing = [];
  if (!url) missing.push('TWILIO_WEBHOOK_URL');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
  const permissive = mode !== 'enforce';

  if (missing.length) {
    return { mode, valid: false, allow: permissive, reason: 'missing-config', missing };
  }
  if (!signature) {
    return { mode, valid: false, allow: permissive, reason: 'missing-signature', missing };
  }

  let valid = false;
  let reason;
  try {
    valid = require('twilio').validateRequest(authToken, signature, url, params || {}) === true;
    reason = valid ? 'ok' : 'invalid-signature';
  } catch (err) {
    valid = false;
    reason = 'validation-error';
  }
  return { mode, valid, allow: valid || permissive, reason, missing };
};

module.exports = { resolveMode, evaluate };
