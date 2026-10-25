'use strict';

/**
 * Call-site metering for the volunteer-day sends (AC36 group path, AC38 sites #2-broadcast, #15, #16,
 * AC60 for POST /api/volunteer-days/sms/:id, and the volunteer-day half of AC13).
 * The cron reminder path (#2-reminder) is covered in cs-cron.js.
 */

const VdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper');
const eventHelper = require('../../src/api/volunteer-day/services/helper');
const { grantPrivileges } = require('../helpers/strapi');
const {
  UID, uniq, http, issueJwt, makeOrg, makeGarden, makeUser, ledgerFind, pollLedger, stubTransport, clearResolver,
} = require('./helpers');

describe('billing: cs-vday', () => {
  let jwt;

  // A fresh org, garden, three volunteers (one opted out) and a published event, so each test
  // reads only its own ledger rows.
  const fixture = async () => {
    const org = await makeOrg();
    const g = await makeGarden({ organization: org.documentId });
    const v1 = await makeUser({ gardens: [g.published.id] });
    const v2 = await makeUser({ gardens: [g.published.id] });
    const vOpt = await makeUser({ gardens: [g.published.id], sms_opted_out_at: new Date() });
    const event = await strapi.documents(UID.EVENT).create({
      data: {
        title: uniq('Vday'),
        garden: g.documentId,
        startDatetime: new Date(Date.now() + 7 * 86400000).toISOString(),
        canceled: false,
        disabled: false,
      },
      status: 'published',
    });
    return { org, g, v1, v2, vOpt, event };
  };

  const publishedEventRow = (documentId) => strapi.db.query(UID.EVENT).findOne({
    where: { documentId, publishedAt: { $notNull: true } },
    populate: ['garden'],
  });

  const postGroupSms = (documentId) => http()
    .post(`/api/volunteer-days/sms/${documentId}`)
    .set('Authorization', `Bearer ${jwt}`)
    .send({});

  beforeAll(async () => {
    await grantPrivileges(1, 'api::volunteer-day.volunteer-day', ['groupSms']);
    jwt = issueJwt(await makeUser());
  });

  beforeEach(clearResolver);
  afterEach(clearResolver);

  describe('AC36: POST /api/volunteer-days/sms/:id', () => {
    it('texts the garden volunteers (not the opted-out one) and writes one broadcast row each', async () => {
      const { org, g, v1, v2, vOpt, event } = await fixture();
      const transport = stubTransport();

      const res = await postGroupSms(event.documentId);

      expect(res.status).toBe(200);
      // AC60: the response is still a plain array of phone-number strings.
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((phone) => typeof phone === 'string')).toBe(true);
      expect(new Set(res.body)).toEqual(new Set([v1.phoneNumber, v2.phoneNumber]));
      expect(res.body).not.toContain(vOpt.phoneNumber);

      const calls = transport.mock.calls.map((c) => c[0]);
      expect(calls).toHaveLength(2);
      expect(new Set(calls.map((c) => c.to))).toEqual(new Set([v1.phoneNumber, v2.phoneNumber]));
      const bodies = new Set(calls.map((c) => c.body));
      expect(bodies.size).toBe(1);
      const [body] = [...bodies];
      expect(body).toContain(event.title);
      expect(body).toContain(g.title);
      expect(body).toBe(VdayHelper.buildUpcomingDayCopy(await publishedEventRow(event.documentId)));

      const rows = await ledgerFind({ organization_document_id: org.documentId });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.to_number))).toEqual(new Set([v1.phoneNumber, v2.phoneNumber]));
      for (const row of rows) {
        expect(row).toMatchObject({
          source: 'volunteer-day.group',
          category: 'broadcast',
          direction: 'api',
          garden_document_id: g.documentId,
          organization_document_id: org.documentId,
          billable: true,
          blocked: false,
          simulated: false,
        });
      }
    });

    it('in dry-run (no stub) still returns every texted volunteer and records simulated rows', async () => {
      const { org, v1, v2, vOpt, event } = await fixture();

      const res = await postGroupSms(event.documentId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(new Set(res.body)).toEqual(new Set([v1.phoneNumber, v2.phoneNumber]));
      expect(res.body).not.toContain(vOpt.phoneNumber);

      const rows = await ledgerFind({ organization_document_id: org.documentId });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({ source: 'volunteer-day.group', category: 'broadcast', simulated: true });
        expect(row.twilio_sid).toBeNull();
      }
    });
  });

  describe('AC38 #16: rsvpEvent', () => {
    it('writes a transactional event.rsvp row attributed to the garden org passed from the controller', async () => {
      const { org, g, v1, event } = await fixture();
      stubTransport();
      const row = await publishedEventRow(event.documentId);

      await eventHelper.rsvpEvent(row.id, { event: row, user: v1, userId: v1.id });

      const rows = await pollLedger({ source: 'event.rsvp', to_number: v1.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'transactional',
        source: 'event.rsvp',
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].user.id).toBe(v1.id);
    });
  });
});
