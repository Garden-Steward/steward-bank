'use strict';

/**
 * Weekly-schedule send (call site #3): POST /api/weekly-schedules/:id/send.
 * Covers AC37 and AC60 (REST response shape) for the weekly-schedule client.
 * Shares the global `strapi` booted for tests/app.test.js.
 */

const { grantPrivileges } = require('../helpers/strapi');
const { patchService } = require('../helpers/patch');
const {
  UID, uniq, http, issueJwt, makeOrg, makeGarden, makeUser,
  ledgerFind, ledgerCount, setEnv, stubTransport, clearResolver,
} = require('./helpers');

const SCHEDULE_UID = 'api::weekly-schedule.weekly-schedule';
const RECURRING_UID = 'api::recurring-task.recurring-task';

describe('billing: cs-weekly', () => {
  let org;
  let g;
  let a1;
  let a2;
  let rt;
  let rtTitle;
  let ws;
  let jwt;

  const post = () => http()
    .post(`/api/weekly-schedules/${ws.documentId}/send`)
    .set('Authorization', `Bearer ${jwt}`);

  const weeklyRows = (extra = {}) => ledgerFind({
    source: 'weekly-schedule',
    to_number: { $in: [a1.phoneNumber, a2.phoneNumber] },
    ...extra,
  });

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
    a1 = await makeUser();
    a2 = await makeUser();

    rtTitle = uniq('RT');
    rt = await strapi.documents(RECURRING_UID).create({
      data: { title: rtTitle, garden: g.documentId },
      status: 'published',
    });
    ws = await strapi.documents(SCHEDULE_UID).create({
      data: {
        Week: uniq('Week'),
        recurring_task: rt.documentId,
        assignees: [
          { day: 'Monday', assignee: a1.id },
          { day: 'Tuesday', assignee: a2.id },
          { day: 'Wednesday' },
        ],
      },
    });

    await grantPrivileges(1, SCHEDULE_UID, ['send']);
    jwt = issueJwt(a1);
  });

  beforeEach(clearResolver);

  describe('AC37 / AC60: a manual send', () => {
    it('meters one reminder per filled assignee, records the campaign with its garden, and keeps the response shape', async () => {
      const transport = stubTransport();

      const res = await post();

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['sent', 'success']);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.sent)).toBe(true);
      res.body.sent.forEach((n) => expect(typeof n).toBe('string'));
      expect(res.body.sent).toEqual([a1.phoneNumber, a2.phoneNumber]);

      expect(transport).toHaveBeenCalledTimes(2);

      const rows = await weeklyRows();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.to_number).sort()).toEqual([a1.phoneNumber, a2.phoneNumber].sort());
      rows.forEach((r) => {
        expect(r).toMatchObject({
          source: 'weekly-schedule',
          category: 'reminder',
          organization_document_id: org.documentId,
          garden_document_id: g.documentId,
        });
      });

      const campaigns = await strapi.db.query(UID.CAMPAIGN).findMany({
        where: { type: 'recurring-task', body: { $contains: rtTitle } },
        populate: ['garden'],
      });
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].garden).toBeTruthy();
      expect(campaigns[0].garden.documentId).toBe(g.documentId);
    });
  });

  describe('staging', () => {
    it('never calls send when ENVIRONMENT is stg', async () => {
      const restore = setEnv({ ENVIRONMENT: 'stg' });
      try {
        const sendSpy = patchService('api::sms.sms', 'send', jest.fn());

        const res = await post();

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, sent: [] });
        expect(sendSpy).toHaveBeenCalledTimes(0);
      } finally {
        restore();
      }
    });
  });

  describe('abort-on-error', () => {
    it('stops at the first rejected assignee and never attempts the next', async () => {
      const before = await ledgerCount({ source: 'weekly-schedule', to_number: { $in: [a1.phoneNumber, a2.phoneNumber] } });
      const transport = stubTransport(async () => { throw { code: 30003 }; });

      const res = await post();

      expect(res.status).toBe(500);
      expect(transport).toHaveBeenCalledTimes(1);
      const after = await ledgerCount({ source: 'weekly-schedule', to_number: { $in: [a1.phoneNumber, a2.phoneNumber] } });
      expect(after).toBe(before);
    });
  });
});
