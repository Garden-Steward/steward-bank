'use strict';

/**
 * Rate-limit alert signups to 10 per IP per day. In-memory, like
 * api::project.rate-limit.
 */

const store = new Map();
const MAX = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60 * 60 * 1000).unref();

module.exports = () => async (ctx, next) => {
  const ip = ctx.request.ip || ctx.request.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  let entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + DAY_MS };
    store.set(ip, entry);
  }
  if (entry.count >= MAX) {
    return ctx.tooManyRequests('Too many signups from this connection today. Please try again tomorrow.');
  }
  entry.count++;
  await next();
};
