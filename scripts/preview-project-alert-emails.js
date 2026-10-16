'use strict';

/**
 * Render the project-alert emails with sample data into one HTML page, so
 * the copy can be read without signing up and approving a project.
 *
 *   yarn preview:emails   →  email-previews/project-alerts.html
 */

const fs = require('fs');
const path = require('path');
const service = require('../src/api/project-alert/services/project-alert')({ strapi: {} });
const { escapeHtml } = require('../src/utils/html');

const sub = {
  email: 'neighbor@example.com',
  scope: 'zip',
  zip: '94607',
  display_label: '94607',
  unsubscribe_token: 'SAMPLE-TOKEN',
};
const project = {
  title: 'Rain garden beds',
  slug: 'rain-garden-beds',
  short_description: 'Building raised beds that catch runoff from the parking lot.',
  garden: { slug: 'oak-street', title: 'Oak Street Garden' },
};

const link = 'https://steward.garden/set-password?code=SAMPLE';
const emails = [
  ['Welcome: new to Garden Steward', 'First signup from an address with no account. A placeholder account is created; the link sets its password.',
    service.welcomeEmail(sub, { accountUrl: link, existing: false })],
  ['Welcome: already has an account', 'First signup from an address that already has an account (they may never have set a password).',
    service.welcomeEmail(sub, { accountUrl: link, existing: true })],
  ['Welcome: signed in', 'First signup made while signed in to the site.',
    service.welcomeEmail(sub, { accountUrl: null, existing: true })],
  ['New project alert', 'Sent to each matching subscriber once a pitch is approved and the 10-minute undo window closes.',
    service.projectEmail(project, sub)],
];

const sections = emails.map(([name, when, { subject, html }]) => `
<section>
  <h2>${escapeHtml(name)}</h2>
  <p class="when">${escapeHtml(when)}</p>
  <div class="mail">
    <div class="meta"><b>From:</b> noreply@steward.garden<br><b>To:</b> ${escapeHtml(sub.email)}<br><b>Subject:</b> ${escapeHtml(subject)}</div>
    <div class="body">${html}</div>
  </div>
</section>`).join('\n');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Project alert emails</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #f3f4f6; margin: 0; padding: 24px 16px; color: #111827; }
  h1 { max-width: 640px; margin: 0 auto 4px; font-size: 22px; }
  .intro { max-width: 640px; margin: 0 auto 24px; color: #4b5563; font-size: 14px; }
  section { max-width: 640px; margin: 0 auto 32px; }
  h2 { font-size: 16px; margin: 0 0 2px; }
  .when { margin: 0 0 8px; color: #6b7280; font-size: 13px; }
  .mail { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .meta { padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; line-height: 1.6; }
  .body { padding: 8px 16px; font-size: 15px; line-height: 1.5; }
</style></head>
<body>
<h1>Project alert emails</h1>
<p class="intro">Sample data: a subscriber to zip 94607. Rendered from src/api/project-alert/services/project-alert.js.</p>
${sections}
</body></html>
`;

const outDir = path.join(__dirname, '..', 'email-previews');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'project-alerts.html');
fs.writeFileSync(outFile, page);
console.log(`Wrote ${outFile}`);
