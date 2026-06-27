'use strict';

/**
 * Backfills the default welcome email template onto any garden
 * that doesn't already have one set.
 * Safe to re-run — only touches gardens with empty subject or body.
 */

const { WELCOME_EMAIL } = require('../src/api/email/defaultTemplates');

async function seedGardenWelcomeEmail(strapi) {
  console.log('[seedGardenWelcomeEmail] Backfilling default welcome email template...');

  const gardens = await strapi.entityService.findMany('api::garden.garden', {
    fields: ['id', 'title', 'welcome_email_subject', 'welcome_email_body'],
  });

  let updated = 0;

  for (const garden of gardens) {
    const needsSubject = !garden.welcome_email_subject;
    const needsBody = !garden.welcome_email_body;

    if (!needsSubject && !needsBody) continue;

    const patch = {};
    if (needsSubject) patch.welcome_email_subject = WELCOME_EMAIL.subject;
    if (needsBody) patch.welcome_email_body = WELCOME_EMAIL.body;

    await strapi.entityService.update('api::garden.garden', garden.id, { data: patch });
    console.log(`  [${garden.id}] "${garden.title}" — set ${Object.keys(patch).join(', ')}`);
    updated++;
  }

  console.log(`[seedGardenWelcomeEmail] Done. ${updated} garden(s) updated, ${gardens.length - updated} already had a template.`);
}

module.exports = seedGardenWelcomeEmail;
