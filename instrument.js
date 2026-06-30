'use strict';

const Sentry = require('@sentry/node');

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

function tracesSampleRateFromEnv() {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (raw === undefined || raw === '') return 1.0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(1, Math.max(0, n));
}

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [Sentry.koaIntegration()],
    tracesSampleRate: tracesSampleRateFromEnv(),
    sendDefaultPii: true,
  });
}

module.exports = { sentryEnabled };
