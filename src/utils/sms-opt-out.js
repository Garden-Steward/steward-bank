'use strict';

/**
 * SMS opt-out handling.
 *
 * Opting out of texts must never remove someone from their gardens: they stay a
 * member and keep getting email. We only record that this number shouldn't be
 * texted, and skip it on group sends.
 *
 * Keywords follow the FCC's list of per-se revocation words (effective
 * April 11, 2025) plus Twilio's default opt-out / opt-in keywords.
 */

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'stopall',
  'stop all',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'revoke',
  'optout',
  'opt out',
  'opt-out',
]);

const OPT_IN_KEYWORDS = new Set(['start', 'unstop']);

// Twilio: "Attempt to send to unsubscribed recipient"
const TWILIO_UNSUBSCRIBED_ERROR = 21610;

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');

const isOptOutKeyword = (text) => OPT_OUT_KEYWORDS.has(normalize(text));
const isOptInKeyword = (text) => OPT_IN_KEYWORDS.has(normalize(text));

const isOptedOut = (user) => Boolean(user && user.sms_opted_out_at);

const isUnsubscribedError = (err) =>
  Boolean(err) && Number(err.code) === TWILIO_UNSUBSCRIBED_ERROR;

const setOptOut = async (user, value) => {
  if (!user || !user.id) return null;
  return strapi.db.query('plugin::users-permissions.user').update({
    where: { id: user.id },
    data: { sms_opted_out_at: value },
  });
};

const markOptedOut = (user) => setOptOut(user, new Date());
const markOptedIn = (user) => setOptOut(user, null);

/**
 * Called when a send to one volunteer fails. Only Twilio's "unsubscribed"
 * error counts as an opt-out; anything else is logged and left alone, since
 * it may be transient (rate limits, carrier filtering, outages).
 */
const handleSendError = async (user, err) => {
  if (isUnsubscribedError(err)) {
    await markOptedOut(user);
    console.log(`SMS opt-out recorded for user ${user && user.id} (Twilio ${TWILIO_UNSUBSCRIBED_ERROR})`);
    return;
  }
  console.log(`SMS send error for user ${user && user.id}:`, err && (err.code || err.message || err));
};

module.exports = {
  OPT_OUT_KEYWORDS,
  OPT_IN_KEYWORDS,
  TWILIO_UNSUBSCRIBED_ERROR,
  normalize,
  isOptOutKeyword,
  isOptInKeyword,
  isOptedOut,
  isUnsubscribedError,
  markOptedOut,
  markOptedIn,
  handleSendError,
};
