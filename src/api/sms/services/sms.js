const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { countSegments } = require('../../../utils/sms-segments');

const VALID_CATEGORIES = ['broadcast', 'reminder', 'transactional', 'system'];
const CONTACT_CARD_URL = 'https://steward.garden/contactcard.vcf';
const NULL_CTX = { gardenDocumentId: null, organizationDocumentId: null };
const log = (level, msg) => { try { strapi.log[level](msg); } catch (e) { console.error(msg); } };
const countMedia = (mediaUrl) => (Array.isArray(mediaUrl) ? mediaUrl.length : (mediaUrl ? 1 : 0));
const mmsUnits = () => strapi.config.get('billing.MMS_UNITS', 3);

/**
 * The one metered outbound send. Every other export that texts someone goes through it.
 * Order: normalize category -> resolve attribution -> gate -> beforeSend -> transport -> ledger row.
 * Metering failures are logged and swallowed; they never stop a text from going out.
 */
const send = async function ({ to, body, mediaUrl, garden, user, task, event, category, source, billable, throwOnError = false, beforeSend } = {}) {
  const transport = strapi.service('api::sms.transport');
  // 1. category + estimate
  let cat = category;
  if (!VALID_CATEGORIES.includes(cat)) {
    log('warn', `[sms] send: category "${cat}" is missing or unknown (source=${source || 'unknown'}); recording as transactional`);
    cat = 'transactional';
  }
  const { segments: estSegments, encoding } = countSegments(body);
  const numMedia = countMedia(mediaUrl);
  const MMS = mmsUnits();
  let segments = estSegments;
  let units = numMedia > 0 ? MMS : segments;
  // 2. attribution (never blocks)
  let ctx = NULL_CTX;
  try { ctx = (await strapi.service('api::billing.resolver').resolveContext({ garden, user, task, event })) || NULL_CTX; }
  catch (err) { log('error', `[sms] resolveContext failed source=${source || 'unknown'}: ${err && err.message}`); }
  const base = {
    organization_document_id: ctx.organizationDocumentId, garden_document_id: ctx.gardenDocumentId,
    user: user?.id ?? null, to_number: to ?? null, source: source ?? null,
    num_media: numMedia, encoding, direction: 'api', category: cat,
  };
  const write = async (row) => {
    try { await strapi.service('api::billing.usage').record(row); }
    catch (err) { log('error', `[sms] ledger write failed source=${source || 'unknown'}: ${err && err.message}`); }
  };
  // 3. gate (fail open)
  let gate = { allowed: true };
  try { gate = (await strapi.service('api::billing.usage').canSend(ctx.organizationDocumentId, cat, units)) || { allowed: true }; }
  catch (err) { log('error', `[sms] canSend failed source=${source || 'unknown'}: ${err && err.message}`); gate = { allowed: true }; }
  if (gate.allowed === false) {
    const simulated = transport.isDryRun();
    await write({ ...base, segments, units, twilio_sid: null, billable: false, blocked: true, simulated });
    return { ok: false, sid: null, segments, units, blocked: true, simulated, error: null };   // never throws, even with throwOnError
  }
  // 4. beforeSend
  if (typeof beforeSend === 'function') {
    try { await beforeSend(); } catch (err) { log('error', `[sms] beforeSend failed source=${source || 'unknown'}: ${err && err.message}`); }
  }
  // 5. network
  let msg;
  try { msg = await transport.create({ to, body, mediaUrl }); }
  catch (err) {
    log('warn', `[sms] send failed source=${source || 'unknown'} code=${err && err.code}`);
    if (throwOnError) throw err;
    return { ok: false, sid: null, segments, units, blocked: false, simulated: false, error: err };
  }
  // 6. final segments
  const n = parseInt(msg && msg.numSegments, 10);
  if (Number.isFinite(n) && n > 0) segments = n;
  if (numMedia === 0) units = segments;
  // 7. ledger (period/sent_at defaulted by usage.record)
  const simulated = msg?.simulated === true;
  await write({ ...base, segments, units, twilio_sid: msg?.sid ?? null, billable: billable ?? (cat !== 'system'), blocked: false, simulated });
  // 8.
  return { ok: true, sid: msg?.sid ?? null, segments, units, blocked: false, simulated, error: null };
};

/** Rejects on a transport error (callers already handle that); resolves { blocked: true } when the gate blocks. */
const sendSms = function (toNum, body, mediaUrl, opts = {}) {
  return strapi.service('api::sms.sms').send({ to: toNum, body, mediaUrl, ...opts, throwOnError: opts.throwOnError ?? true });
};

const sendContactCard = function (toNum, opts = {}) {
  return strapi.service('api::sms.sms').send({ to: toNum, body: '', mediaUrl: CONTACT_CARD_URL, category: 'transactional', source: 'sms.contact-card', ...opts, throwOnError: true });
};

/** Handle a Task Based SMS or pass in user */
const handleSms = async function (params = {}) {
  const { task, body, type, previous, user, meta_data, event, garden, category, source } = params;
  const member = (!user && task && task.volunteers?.length) ? task.volunteers[0] : user;
  return strapi.service('api::sms.sms').send({
    to: member?.phoneNumber, body, mediaUrl: task?.primary_image?.url || null,
    garden, task, event, user: member, category, source, throwOnError: false,
    beforeSend: async () => {
      try {
        await strapi.db.query('api::message.message').create({
          data: { user: member, type, garden: task?.garden || user?.activeGarden || event?.garden, body, garden_task: task, previous, meta_data },
        });
      } catch (err) {
        log('error', `Problem logging message. ${err && err.message}`);
      }
    },
  });
};

/** Ledger row for a TwiML reply to an inbound text (no API send, so no sid). Never rejects. */
const recordTwimlReply = async function ({ to, body, mediaCount = 0, garden, user, task, source = 'webhook.reply' } = {}) {
  try {
    const ctx = (await strapi.service('api::billing.resolver').resolveContext({ garden, user, task })) || NULL_CTX;
    const { segments, encoding } = countSegments(body);
    return await strapi.service('api::billing.usage').record({
      organization_document_id: ctx.organizationDocumentId, garden_document_id: ctx.gardenDocumentId,
      user: user?.id ?? null, to_number: to ?? null, twilio_sid: null, source,
      segments, num_media: mediaCount, units: mediaCount > 0 ? mmsUnits() : segments, encoding,
      direction: 'twiml_reply', category: 'transactional', billable: true, blocked: false,
      simulated: strapi.service('api::sms.transport').isDryRun(),
    });
  } catch (err) {
    log('error', `[sms] recordTwimlReply failed: ${err && err.message}`);
    return null;
  }
};

const handleVoice = function(){
  const response = new VoiceResponse();
  response.say({
    voice: 'Polly.Joanna'
  },'Hello! You\'ve reached Garden Steward. Please send this number a text message if you\'d like to join as a volunteer. Thanks for calling, and feel free to stay on the line and dig this classic tune.');
  response.play('https://demo.twilio.com/docs/classic.mp3');
  return response.toString();
};

module.exports = { send, sendSms, handleSms, recordTwimlReply, handleVoice, sendContactCard };
