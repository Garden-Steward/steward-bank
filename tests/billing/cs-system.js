'use strict';

/**
 * Call sites #19 (sms-login code) and #20 (vacation check-in): both are `system` sends,
 * so their ledger rows must carry billable false. Covers AC39 and AC40.
 *
 * No transport stub: the real transport runs in dry-run (NODE_ENV=test), so the rows are simulated.
 */

const { subDays } = require('date-fns');
const {
  UID, makeOrg, makeGarden, makeUser, pollLedger, clearResolver,
} = require('./helpers');

describe('billing: cs-system', () => {
  let org;
  let g;

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
  });

  beforeEach(clearResolver);

  it('AC39: an sms-login code is a billable-false system row attributed to the user and their org', async () => {
    const u = await makeUser({ activeGarden: g.published.id });

    // 10 digits, as a client would type it; requestCode normalizes to the stored E.164 number.
    const result = await strapi.service('api::auth.sms-login').requestCode(u.phoneNumber.slice(2));
    expect(result).toEqual({ invalid: false, outcome: 'sent' });

    // The send is fire-and-forget, so poll for the row.
    const rows = await pollLedger({ source: 'auth.sms-login', to_number: u.phoneNumber });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'system',
      billable: false,
      direction: 'api',
      source: 'auth.sms-login',
      to_number: u.phoneNumber,
      organization_document_id: org.documentId,
      garden_document_id: g.documentId,
    });
    expect(rows[0].user.id).toBe(u.id);
  });

  it('AC40: a vacation check-in is a billable-false system row attributed to the user and their org', async () => {
    const u = await makeUser({
      paused: true,
      paused_at: subDays(new Date(), 16),
      last_vacation_check_sent: null,
      vacation_reminder_count: 0,
      activeGarden: g.published.id,
    });

    try {
      await strapi.service('api::message.vacation-checkin').sendVacationCheckIns();

      const rows = await pollLedger({ source: 'vacation.checkin', to_number: u.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'system',
        billable: false,
        direction: 'api',
        source: 'vacation.checkin',
        to_number: u.phoneNumber,
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(u.id);
    } finally {
      // Paused users are picked up by every later sendVacationCheckIns run, so don't leave this one behind.
      await strapi.db.query(UID.USER).delete({ where: { id: u.id } });
    }
  });
});
