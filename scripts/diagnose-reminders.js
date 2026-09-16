#!/usr/bin/env node
/**
 * Explains, for every volunteer day in the next 10 days, whether the reminder
 * cron would text anyone for it - and if not, which check it falls down on.
 *
 * This boots Strapi, which is not a neutral act:
 *   - Strapi arms and STARTS the cron jobs inside strapi.load(). Left to run
 *     across an hour boundary this process would fire pollReminders and send
 *     real SMS. We set CRON_ENABLED=false below, before Strapi is required, so
 *     none of this app's jobs are registered. Strapi's own internal jobs
 *     (telemetry, upload metrics) still run; none of them send anything.
 *   - strapi.load() also runs schema sync, which issues DDL. Run this on the
 *     DEPLOYED image (fly ssh console), where the schema already matches, and
 *     never from a laptop or a branch whose schema differs from production.
 *
 * It makes no writes of its own and sends nothing.
 *
 * Usage (against prod):
 *   fly ssh console -C "node scripts/diagnose-reminders.js"
 */

// Must be set before @strapi/strapi is required, so config/server.js reads it.
process.env.CRON_ENABLED = 'false';

const { createStrapi } = require('@strapi/strapi');
const { addDays, addHours } = require('date-fns');
const { utcToZonedTime, format } = require('date-fns-tz');

const TZ = 'America/Los_Angeles';
const pt = (d) => (d ? format(utcToZonedTime(new Date(d), TZ), 'EEE MMM d, h:mmaaa', { timeZone: TZ }) : '-');

async function diagnose() {
  const strapi = await createStrapi().load();

  try {
    const VdayHelper = require('../src/api/volunteer-day/controllers/VdayHelper');
    const { dedupeByDocument } = require('../src/utils/documents');

    const now = new Date();
    console.log(`\nNow: ${pt(now)} Pacific  (${now.toISOString()})`);
    console.log(`Cron 'sendVolunteerReminder' runs 8:05am Pacific daily.\n`);

    // 1. Everything in the next 10 days, with NO filters at all.
    const rawRows = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: { startDatetime: { $gte: now.toISOString(), $lt: addDays(now, 10).toISOString() } },
      populate: ['garden'],
      orderBy: { startDatetime: 'asc' },
    });
    // v5 keeps a draft and a published row per event; collapse them the same way
    // the reminder queries do, or every event is listed twice.
    const all = dedupeByDocument(rawRows);

    if (!all.length) {
      console.log('No volunteer days at all in the next 10 days.');
      console.log('=> Nothing to remind about. Check that events/recurring instances are being created.\n');
      return;
    }

    console.log(`${all.length} event(s) in the next 10 days, from ${rawRows.length} raw row(s) (unfiltered):\n`);
    for (const v of all) {
      console.log(`  [${v.id}] "${v.title}"  ${pt(v.startDatetime)}`);
      console.log(`        documentId=${v.documentId || 'MISSING'} publishedAt=${v.publishedAt ? 'published' : 'DRAFT'}`);
      console.log(`        canceled=${JSON.stringify(v.canceled)} disabled=${JSON.stringify(v.disabled)} garden=${v.garden?.id ?? 'NONE'}`);

      const notes = [];
      if (v.canceled === null || v.canceled === undefined) notes.push('canceled is NULL - invisible to a {$ne:true} filter; tolerated once this fix ships');
      if (v.disabled === null || v.disabled === undefined) notes.push('disabled is NULL - invisible to a {$ne:true} filter; tolerated once this fix ships');
      if (!v.garden) notes.push('NO GARDEN - nobody can be resolved to text');
      if (!v.documentId) notes.push('no documentId');
      if (notes.length) console.log(`        !! ${notes.join('; ')}`);
      console.log('');
    }

    // 2. What each reminder window returns right now.
    // Printed so an event that matches neither window is explained rather than
    // just missing from both lists.
    console.log('Reminder windows as of right now (they move with each cron run):');
    console.log(`  7-day      : ${pt(addDays(now, 7))}  ->  ${pt(addDays(now, 8))}`);
    console.log(`  day-before : ${pt(addHours(now, 14))}  ->  ${pt(addHours(now, 44))}`);
    console.log('  (the cron runs 8:05am Pacific, so these are the windows only at that hour)\n');

    const windows = {
      'getUpcomingVdays (7-day)': await VdayHelper.getUpcomingVdays(),
      'getTomorrowVdays (day-before)': await VdayHelper.getTomorrowVdays(),
    };

    for (const [name, rows] of Object.entries(windows)) {
      console.log(`${name}: ${rows.length} event(s) matched right now`);
      for (const v of rows) {
        const group = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(v);
        const withPhone = group.filter((u) => u.phoneNumber);
        console.log(`   [${v.id}] "${v.title}" ${pt(v.startDatetime)} -> ${group.length} volunteer(s), ${withPhone.length} with a phone number`);
        if (!withPhone.length) {
          console.log(`        !! would text NOBODY`);
        }
      }
      console.log('');
    }

    // 3. Roster health - the unsubscribe-on-Twilio-error path can empty these.
    const gardens = await strapi.db.query('api::garden.garden').findMany({
      where: { publishedAt: { $notNull: true } },
      populate: ['volunteers'],
    });
    console.log('Garden rosters (published rows):');
    for (const g of gardens) {
      const n = (g.volunteers || []).length;
      console.log(`   [${g.id}] ${g.title} (${g.sms_slug}): ${n} volunteer(s)${n === 0 ? '   !! EMPTY' : ''}`);
    }
    console.log('');

    // 4. Twilio config presence (values are never printed).
    const twilio = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIONUM'];
    console.log('Twilio env:', twilio.map((k) => `${k}=${process.env[k] ? 'set' : 'MISSING'}`).join('  '));
    console.log('');
  } finally {
    await strapi.destroy();
  }
}

diagnose()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('diagnose-reminders failed:', err);
    process.exit(1);
  });
