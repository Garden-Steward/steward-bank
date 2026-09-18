#!/usr/bin/env node
/**
 * Explains, for every recurring task, whether the daily cron will generate a
 * task tomorrow — and if not, exactly which step it falls down on.
 *
 * Two failures this is built to spot, both of them silent:
 *
 *   1. Strapi v5 keeps a draft row and a published row per recurring task. The
 *      cron iterates one; a schedule attached in the admin can be related to
 *      the other. The day's task is then generated with nobody on it.
 *   2. A task with no volunteers is invisible to every reminder cron, so
 *      nothing ever closes it — and while it sits open, every later day is
 *      skipped as "already have one". Generation stops for good.
 *
 * This boots Strapi, which is not a neutral act:
 *   - Strapi arms and STARTS the cron jobs inside strapi.load(). We set
 *     CRON_ENABLED=false below, before Strapi is required, so none of this
 *     app's jobs are registered and nothing is texted.
 *   - strapi.load() also runs schema sync, which issues DDL. Run this on the
 *     DEPLOYED image (fly ssh console), where the schema already matches, and
 *     never from a laptop or a branch whose schema differs from production.
 *
 * It makes no writes of its own and sends nothing.
 *
 * Usage (against prod):
 *   fly ssh console -C "node scripts/diagnose-task-generation.js"
 */

// Must be set before @strapi/strapi is required, so config/server.js reads it.
process.env.CRON_ENABLED = 'false';

const { createStrapi } = require('@strapi/strapi');
const { utcToZonedTime, format } = require('date-fns-tz');
const { differenceInDays } = require('date-fns');

const TZ = 'America/Los_Angeles';
const pt = (d) => (d ? format(utcToZonedTime(new Date(d), TZ), 'EEE MMM d yyyy, h:mmaaa', { timeZone: TZ }) : '-');

const OPEN = ['INITIALIZED', 'PENDING', 'INTERESTED', 'STARTED', 'ISSUE', 'RESOLVED'];

async function diagnose() {
  const strapi = await createStrapi().load();

  try {
    const { dedupeByDocument, documentRowIds } = require('../src/utils/documents');

    const now = new Date();
    const today = now.toLocaleString('default', { weekday: 'long' });
    console.log(`\nNow: ${pt(now)} Pacific — ${today}`);
    console.log(`Cron 'createRecurringTasks' runs daily at 14:00 UTC.\n`);

    const rawRecurring = await strapi.db.query('api::recurring-task.recurring-task').findMany({
      populate: ['garden', 'schedulers', 'schedulers.volunteer'],
      orderBy: { id: 'asc' },
    });
    const recurringTasks = dedupeByDocument(rawRecurring);

    if (!recurringTasks.length) {
      console.log('No recurring tasks at all. Nothing would ever be generated.\n');
      return;
    }

    console.log(`${recurringTasks.length} recurring task(s), from ${rawRecurring.length} raw row(s):\n`);

    for (const recTask of recurringTasks) {
      const rowIds = await documentRowIds('api::recurring-task.recurring-task', recTask);
      const rows = await strapi.db.query('api::recurring-task.recurring-task').findMany({
        where: { id: { $in: rowIds } },
        select: ['id', 'publishedAt'],
      });

      console.log(`[${recTask.id}] "${recTask.title}"  garden=${recTask.garden?.title ?? 'NONE'}  type=${recTask.scheduler_type ?? 'unset'}`);
      console.log(`      document rows: ${rows.map(r => `id${r.id}:${r.publishedAt ? 'published' : 'draft'}`).join(' ')}`);
      console.log(`      the cron iterates row id${recTask.id}`);

      const problems = [];

      if (!recTask.garden) problems.push('NO GARDEN — weather and volunteer lookups have nothing to work from');

      // --- which rows do the schedules actually point at? ---
      const schedulersOnThisRow = await strapi.db.query('api::scheduler.scheduler').findMany({
        where: { recurring_task: recTask.id },
        populate: { volunteer: true },
      });
      const schedulersOnDocument = await strapi.db.query('api::scheduler.scheduler').findMany({
        where: { recurring_task: { id: { $in: rowIds } } },
        populate: { volunteer: true },
      });

      if (recTask.scheduler_type === 'Daily Primary' || recTask.scheduler_type === 'Weekly Shuffle') {
        console.log(`      schedulers: ${schedulersOnDocument.length} on the document, ${schedulersOnThisRow.length} on the row the cron reads`);
        if (schedulersOnDocument.length && !schedulersOnThisRow.length) {
          problems.push('SCHEDULE ON THE OTHER ROW — before the fix, the cron found no volunteer here and generated an empty task');
        }
        if (!schedulersOnDocument.length) {
          problems.push('NO SCHEDULERS anywhere on this document — nobody is ever assigned');
        }
        const todays = schedulersOnDocument.filter(s => s.day === today);
        console.log(`      today (${today}): ${todays.length ? todays.map(s => s.volunteer?.firstName ?? 'no volunteer set').join(', ') : 'nobody scheduled'}`);
      }

      if (recTask.scheduler_type === 'Weekly Shuffle') {
        const schedule = await strapi.db.query('api::weekly-schedule.weekly-schedule').findOne({
          where: { recurring_task: { id: { $in: rowIds } } },
          orderBy: { createdAt: 'DESC' },
          populate: ['assignees', 'assignees.assignee'],
        });
        if (!schedule) {
          problems.push('NO WEEKLY ROSTER has ever been drawn for this document');
        } else {
          const age = differenceInDays(now, new Date(schedule.createdAt));
          const filled = (schedule.assignees || []).filter(a => a.assignee).length;
          console.log(`      latest roster: "${schedule.Week}" drawn ${pt(schedule.createdAt)} (${age}d ago), ${filled}/${schedule.assignees?.length ?? 0} days filled`);
          if (age > 7) problems.push(`ROSTER IS ${age} DAYS OLD — the weekly draw is not running`);
          if (!filled) problems.push('ROSTER HAS NOBODY ON IT');
        }
      }

      // --- what is blocking creation right now? ---
      const openTasks = await strapi.db.query('api::garden-task.garden-task').findMany({
        where: { recurring_task: { id: { $in: rowIds } }, task_status: { $in: OPEN } },
        populate: ['volunteers'],
        orderBy: { id: 'desc' },
      });
      const blocking = dedupeByDocument(openTasks)[0];

      const lastGenerated = await strapi.db.query('api::garden-task.garden-task').findOne({
        where: { recurring_task: { id: { $in: rowIds } } },
        orderBy: { createdAt: 'DESC' },
      });
      console.log(`      last task generated: ${lastGenerated ? `[${lastGenerated.id}] ${pt(lastGenerated.createdAt)} (${differenceInDays(now, new Date(lastGenerated.createdAt))}d ago)` : 'NEVER'}`);

      if (blocking) {
        const age = differenceInDays(now, new Date(blocking.createdAt));
        const takers = blocking.volunteers?.length ?? 0;
        console.log(`      open task blocking creation: [${blocking.id}] ${blocking.task_status}, made ${pt(blocking.createdAt)} (${age}d ago), ${takers} volunteer(s)`);
        if (!takers && age >= 1) {
          problems.push(`STUCK — this task has no volunteers, so no reminder cron will ever close it, and it has blocked every day for ${age} days`);
        } else if (age >= 2) {
          problems.push(`open task is ${age} days old and still blocking new ones`);
        }
      } else {
        console.log('      nothing open — the next cron run is free to generate');
      }

      if (problems.length) {
        problems.forEach(p => console.log(`      !! ${p}`));
      } else {
        console.log('      ok');
      }
      console.log('');
    }

    console.log('A "STUCK" line is cleared automatically by the next cron run once the');
    console.log('fix is deployed: the empty task is retired as SKIPPED and the day\'s');
    console.log('task is generated in its place.\n');
  } finally {
    await strapi.destroy();
  }
}

diagnose()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
