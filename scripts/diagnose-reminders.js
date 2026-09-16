#!/usr/bin/env node
/**
 * Explains, for every volunteer day in the next 10 days, whether the reminder
 * cron would text anyone for it - and if not, which check it falls down on.
 *
 * Read-only: it sends nothing and writes nothing.
 *
 * Usage (against prod):
 *   fly ssh console -C "node scripts/diagnose-reminders.js"
 */

const { createStrapi } = require('@strapi/strapi');
const { addDays } = require('date-fns');
const { utcToZonedTime, format } = require('date-fns-tz');

const TZ = 'America/Los_Angeles';
const pt = (d) => (d ? format(utcToZonedTime(new Date(d), TZ), 'EEE MMM d, h:mmaaa', { timeZone: TZ }) : '-');

async function diagnose() {
  const strapi = await createStrapi().load();

  try {
    const VdayHelper = require('../src/api/volunteer-day/controllers/VdayHelper');

    const now = new Date();
    console.log(`\nNow: ${pt(now)} Pacific  (${now.toISOString()})`);
    console.log(`Cron 'sendVolunteerReminder' runs 8:05am Pacific daily.\n`);

    // 1. Everything in the next 10 days, with NO filters at all.
    const all = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: { startDatetime: { $gte: now.toISOString(), $lt: addDays(now, 10).toISOString() } },
      populate: ['garden'],
      orderBy: { startDatetime: 'asc' },
    });

    if (!all.length) {
      console.log('No volunteer days at all in the next 10 days.');
      console.log('=> Nothing to remind about. Check that events/recurring instances are being created.\n');
      return;
    }

    console.log(`${all.length} volunteer day row(s) in the next 10 days (unfiltered):\n`);
    for (const v of all) {
      console.log(`  [${v.id}] "${v.title}"  ${pt(v.startDatetime)}`);
      console.log(`        documentId=${v.documentId || 'MISSING'} publishedAt=${v.publishedAt ? 'published' : 'DRAFT'}`);
      console.log(`        canceled=${JSON.stringify(v.canceled)} disabled=${JSON.stringify(v.disabled)} garden=${v.garden?.id ?? 'NONE'}`);

      const notes = [];
      if (v.canceled === null || v.canceled === undefined) notes.push('canceled is NULL - dropped by the old {$ne:true} filter');
      if (v.disabled === null || v.disabled === undefined) notes.push('disabled is NULL - dropped by the old {$ne:true} filter');
      if (!v.garden) notes.push('NO GARDEN - nobody can be resolved to text');
      if (!v.documentId) notes.push('no documentId');
      if (notes.length) console.log(`        !! ${notes.join('; ')}`);
      console.log('');
    }

    // 2. What each reminder window returns right now.
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
