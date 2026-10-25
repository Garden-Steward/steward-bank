'use strict';

/**
 * SmsHelper call sites that text someone: the contact card (#13), pass-to-next (#11) and
 * transfer (#12). Covers AC38 for those sites. Shares the global `strapi` booted for
 * tests/app.test.js.
 *
 * Each site is awaited by SmsHelper, so a plain ledgerFind is enough (no polling).
 */

const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { patch, patchService } = require('../helpers/patch');
const {
  UID, uniq, makeOrg, makeGarden, makeUser, ledgerFind, stubTransport, clearResolver,
} = require('./helpers');

describe('billing: cs-sms-helper', () => {
  let org;
  let g;

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
  });

  beforeEach(clearResolver);

  describe('#13 contact card (sms.contact-card)', () => {
    it('meters the card as a transactional MMS for the new volunteer, with their org', async () => {
      const u = await makeUser({ activeGarden: g.published.id, gardens: [g.published.id] });
      const transport = stubTransport();
      // The welcome email is fire-and-forget and not under test here.
      patch(SmsHelper, 'sendWelcomeEmail', jest.fn());

      const response = await SmsHelper.saveVolunteerName(u, 'billing cardholder');

      expect(response.type).toBe('complete');
      expect(transport).toHaveBeenCalledTimes(1);

      const rows = await ledgerFind({ source: 'sms.contact-card', to_number: u.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'transactional',
        num_media: 1,
        units: 3,
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(u.id);
    });
  });

  describe('#11 pass to next volunteer (sms.pass) and #12 transfer (sms.transfer)', () => {
    let task;
    let cur;
    let next;

    beforeEach(async () => {
      task = await strapi.db.query(UID.TASK).create({
        data: { title: uniq('Billing pass task'), garden: g.published.id, publishedAt: new Date() },
      });
      cur = await makeUser();
      next = await makeUser();

      patchService('api::message.message', 'validateQuestion', jest.fn().mockResolvedValue({
        body: 'q',
        type: 'question',
        garden_task: { id: task.id, title: task.title, recurring_task: { id: 1 } },
      }));
      patch(SmsHelper, 'getSchedulerFromTask', jest.fn().mockResolvedValue({ backup_volunteers: [cur, next] }));
      // No `garden` key on purpose: the resolver has to lazy-load it from the task row.
      patchService('api::garden-task.garden-task', 'updateGardenTaskUser', jest.fn().mockResolvedValue({
        id: task.id, title: task.title, recurring_task: { id: 1, instruction: null },
      }));
      patchService('api::instruction.instruction', 'checkInstruction', jest.fn().mockReturnValue(false));
    });

    it('meters the pass text to the next volunteer, attributed through the task garden', async () => {
      const transport = stubTransport();

      const result = await SmsHelper.passToNextVolunteer(cur);

      expect(result.type).toBe('complete');
      expect(transport).toHaveBeenCalledTimes(1);

      const rows = await ledgerFind({ source: 'sms.pass', to_number: next.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'transactional',
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(next.id);
    });

    it('meters the transfer text to the chosen backup volunteer', async () => {
      const transport = stubTransport();

      // getBackupVolunteer drops the current user, so backup #1 is `next`.
      const result = await SmsHelper.transferTask(cur, 1);

      expect(result.type).toBe('complete');
      expect(transport).toHaveBeenCalledTimes(1);

      const rows = await ledgerFind({ source: 'sms.transfer', to_number: next.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'transactional',
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(next.id);
    });
  });
});
