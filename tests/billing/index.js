'use strict';
const fs = require('fs');
const path = require('path');

// Fixed order. org-coverage must stay last: it runs a DB-wide backfill.
const ORDER = ['ledger', 'resolver', 'usage', 'send',
  'cs-campaign', 'cs-vday', 'cs-cron', 'cs-weekly', 'cs-tasks', 'cs-sms-helper', 'twiml', 'cs-system',
  'signature', 'org-create', 'usage-page', 'usage-page-http', 'org-coverage'];

for (const name of ORDER) {
  if (fs.existsSync(path.join(__dirname, `${name}.js`))) require(`./${name}`);
}
