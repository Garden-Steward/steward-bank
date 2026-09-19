'use strict';

/**
 * Rate-limit project submissions to 3 per IP per day.
 * Simple in-memory store — resets on server restart (fine for Fly.io).
 */

const store = new Map();

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.resetAt > 0) store.delete(key);
  }
}, 60 * 60 * 1000);

module.exports = () => {
  const MAX = 3;

  return async (ctx, next) => {
    const ip = ctx.request.ip || ctx.request.headers['x-forwarded-for'] || 'unknown';
    const key = `project:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    // Reset counter after 24h
    if (!entry || now - entry.resetAt > 0) {
      entry = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
      store.set(key, entry);
    }

    if (entry.count >= MAX) {
      return ctx.tooManyRequests(`You've submitted ${MAX} projects today. Please try again tomorrow.`);
    }

    entry.count++;
    store.set(key, entry);

    await next();
  };
};