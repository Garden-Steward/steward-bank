'use strict';

const { resolveMode, evaluate } = require('../../../utils/twilio-signature');

let warnedUnknownMode = false;

module.exports = (config, { strapi }) => async (ctx, next) => {
  const { mode, unknown } = resolveMode(process.env.TWILIO_SIGNATURE_MODE);
  if (unknown && !warnedUnknownMode) {
    warnedUnknownMode = true;
    strapi.log.warn('[twilio-signature] unknown TWILIO_SIGNATURE_MODE, using log');
  }
  const r = evaluate({
    mode,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    url: process.env.TWILIO_WEBHOOK_URL,
    signature: ctx.request.header['x-twilio-signature'],
    params: ctx.request.body || {},
  });
  if (r.missing.length) {
    if (mode === 'enforce') {
      strapi.log.error(`[twilio-signature] mode=enforce rejected: missing ${r.missing.join(', ')}`);
      ctx.status = 403;
      ctx.body = '';
      return;
    }
    strapi.log.warn(`[twilio-signature] skipped: missing ${r.missing.join(', ')}`);
    return next();
  }
  if (r.valid) {
    if (mode === 'log') strapi.log.info('[twilio-signature] mode=log valid=true');
    return next();
  }
  strapi.log.warn(`[twilio-signature] mode=${mode} valid=false reason=${r.reason}`);
  if (r.allow) return next();
  ctx.status = 403;
  ctx.body = '';
};
