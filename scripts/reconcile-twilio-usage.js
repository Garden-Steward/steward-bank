#!/usr/bin/env node
/**
 * Compares the SMS usage ledger (sms-usage) against Twilio's own usage records
 * for a calendar month (UTC) and reports the drift.
 *
 * Read-only: it writes nothing and sends nothing. The Twilio client built here
 * is the usage API only, the one client allowed outside the SMS transport.
 *
 * Booting Strapi runs schema sync, so run this on the DEPLOYED image. Cron is
 * disabled below (before Strapi is required) so no jobs fire.
 *
 * Exit codes: 0 = within --max-drift, 1 = drift exceeded, 2 = bad args/config.
 *
 * Usage (against prod):
 *   fly ssh console -C "node scripts/reconcile-twilio-usage.js [--period YYYY-MM] [--max-drift 0.02]"
 */

// Must be set before @strapi/strapi is required, so config/server.js reads it.
process.env.CRON_ENABLED = 'false';

const { parseArgs, reconcile, formatReport } = require('./lib/reconcile-usage');

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.log(err.message);
    process.exit(2);
  }

  const { createStrapi } = require('@strapi/strapi');
  const strapi = await createStrapi().load(); // loads .env

  let exitCode = 2;
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set.');
    } else {
      const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const result = await reconcile({
        ...args,
        twilioClient,
        getTotals: (a) => strapi.service('api::billing.usage').getTotals(a),
      });
      console.log(formatReport(result));
      exitCode = result.exitCode;
    }
  } catch (err) {
    console.log(`Reconcile failed: ${err.message}`);
    exitCode = 2;
  } finally {
    await strapi.destroy();
  }
  process.exit(exitCode);
}

main();
