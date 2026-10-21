'use strict';

/**
 * Pure core for scripts/reconcile-twilio-usage.js. No Strapi, no Twilio
 * require: the caller passes in a Twilio client and a getTotals function, so
 * this is unit-testable and src/ stays free of Twilio client construction.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const USAGE = 'Usage: node scripts/reconcile-twilio-usage.js [--period YYYY-MM] [--max-drift 0.02]';

function currentPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function monthRange(period) {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    startDate: `${period}-01`,
    endDate: `${period}-${String(last).padStart(2, '0')}`,
  };
}

function parseArgs(argv = []) {
  let period = currentPeriod();
  let maxDrift = 0.02;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--period') {
      period = argv[++i];
      if (typeof period !== 'string' || !PERIOD_RE.test(period)) {
        throw new Error(`Invalid --period "${period}". ${USAGE}`);
      }
    } else if (arg === '--max-drift') {
      const raw = argv[++i];
      maxDrift = raw === undefined || raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(maxDrift) || maxDrift < 0) {
        throw new Error(`Invalid --max-drift "${raw}". ${USAGE}`);
      }
    } else {
      throw new Error(`Unknown argument "${arg}". ${USAGE}`);
    }
  }

  return { period, maxDrift };
}

async function fetchTwilioTotals(client, period) {
  const range = monthRange(period);
  const sms = await client.usage.records.list({ category: 'sms-outbound', ...range });
  const mms = await client.usage.records.list({ category: 'mms-outbound', ...range });
  return {
    smsSegments: sms.reduce((sum, r) => sum + (Number(r.usage) || 0), 0),
    mmsCount: mms.reduce((sum, r) => sum + (Number(r.count) || 0), 0),
  };
}

function drift(ledger, twilio) {
  if (twilio === 0) return ledger === 0 ? 0 : 1;
  return (ledger - twilio) / twilio;
}

async function reconcile({ period, maxDrift = 0.02, twilioClient, getTotals }) {
  const twilio = await fetchTwilioTotals(twilioClient, period);
  const ledger = await getTotals({ period });

  const attributed = (ledger.attributed && ledger.attributed.segments) || 0;
  const unattributed = (ledger.unattributed && ledger.unattributed.segments) || 0;
  const total = attributed + unattributed;
  const unattributedShare = total ? unattributed / total : 0;

  const driftSms = drift(ledger.smsSegments, twilio.smsSegments);
  const driftMms = drift(ledger.mmsCount, twilio.mmsCount);

  return {
    period,
    maxDrift,
    twilio,
    ledger,
    drift: { sms: driftSms, mms: driftMms },
    unattributedShare,
    exitCode: Math.abs(driftSms) > maxDrift ? 1 : 0,
  };
}

const pct = (n) => `${n < 0 ? '-' : n > 0 ? '+' : ''}${Math.abs(n * 100).toFixed(2)}%`;
const json = (o) => JSON.stringify(o || {});

function formatReport(result) {
  const { period, maxDrift, twilio, ledger, drift: d, unattributedShare } = result;
  const att = ledger.attributed || { rows: 0, segments: 0, units: 0 };
  const unatt = ledger.unattributed || { rows: 0, segments: 0, units: 0 };
  const pass = result.exitCode === 0;

  return [
    `Twilio usage reconcile for ${period}`,
    '',
    `SMS segments  twilio=${twilio.smsSegments}  ledger=${ledger.smsSegments}  drift=${pct(d.sms)}`,
    `MMS count     twilio=${twilio.mmsCount}  ledger=${ledger.mmsCount}  drift=${pct(d.mms)}`,
    '',
    `By category:   ${json(ledger.byCategory)}`,
    `By direction:  ${json(ledger.byDirection)}`,
    `Attributed:    rows=${att.rows} segments=${att.segments} units=${att.units}`,
    `Unattributed:  rows=${unatt.rows} segments=${unatt.segments} units=${unatt.units}`,
    `Unattributed share of segments: ${(unattributedShare * 100).toFixed(2)}%`,
    '',
    pass ? 'PASS' : `FAIL (|sms drift| > ${(maxDrift * 100).toFixed(2)}%)`,
    '',
    'Known drift sources:',
    "  - Twilio's own opt-out/help auto-replies (STOP/START confirmations) are billed outbound but never pass through our code.",
    '  - Sends from other systems on the same Twilio account.',
    '  - UTC day-boundary skew between Twilio usage dates and ledger timestamps.',
  ].join('\n');
}

module.exports = {
  currentPeriod,
  monthRange,
  parseArgs,
  fetchTwilioTotals,
  drift,
  reconcile,
  formatReport,
};
