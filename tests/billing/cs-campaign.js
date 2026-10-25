'use strict';

/**
 * sms-campaign sends through api::sms.sms `send`: sendGroupMsg (#1), sendPollReminders (#8),
 * closePoll (#9) and sendRSVPAlert (#10), plus POST /api/sms-campaigns/sms/group.
 * Covers AC35, AC38 (sites #1, #8, #9, #10), AC41 and AC60. Shares the global `strapi` booted for tests/app.test.js.
 */

const { patch, patchService } = require('../helpers/patch');
const { grantPrivileges } = require('../helpers/strapi');
const {
  UID, uniq, http, issueJwt, makeOrg, makeGarden, makeUser, ledgerFind, pollLedger, stubTransport, clearResolver,
} = require('./helpers');

describe('billing: cs-campaign', () => {
  const svc = () => strapi.service('api::sms-campaign.sms-campaign');
  let org;
  let g;
  let gardenRow;

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
    gardenRow = g.published;
  });

  beforeEach(clearResolver);

  afterAll(async () => {
    if (typeof strapi === 'undefined' || !strapi.db) return;
    const rows = await strapi.db.query(UID.CAMPAIGN).findMany({ where: { garden: gardenRow.id }, select: ['id'] });
    if (rows.length) {
      await strapi.db.query(UID.CAMPAIGN).deleteMany({ where: { id: { $in: rows.map((r) => r.id) } } });
    }
  });

  const campaignFor = (copy) => strapi.db.query(UID.CAMPAIGN).findOne({
    where: { body: copy, garden: gardenRow.id },
    orderBy: { id: 'desc' },
    populate: { sent: true },
  });
  const sentIds = (campaign) => campaign.sent.map((u) => u.id).sort((x, y) => x - y);
  const messageCount = (users) => strapi.db.query(UID.MESSAGE).count({
    where: { user: { id: { $in: users.map((u) => u.id) } } },
  });

  describe('AC35: sendGroupMsg (#1)', () => {
    it('texts only the active volunteers, records them and writes one broadcast row each', async () => {
      const paused = await makeUser({ paused: true });
      const optedOut = await makeUser({ sms_opted_out_at: new Date() });
      const noPhone = await makeUser({ phoneNumber: null });
      const a1 = await makeUser();
      const a2 = await makeUser();
      const copy = uniq('copy');
      const transport = stubTransport();
      const msgsBefore = await messageCount([a1, a2]);

      const sentInfo = await svc().sendGroupMsg(
        [paused, optedOut, noPhone, a1, a2],
        copy,
        gardenRow,
        { type: 'alert', sender: a1.id, alert: false },
      );

      expect(transport).toHaveBeenCalledTimes(2);
      expect(transport.mock.calls.map((c) => c[0].to)).toEqual([a1.phoneNumber, a2.phoneNumber]);
      expect(transport.mock.calls.every((c) => c[0].body === copy)).toBe(true);
      expect(sentInfo).toEqual([a1.phoneNumber, a2.phoneNumber]);

      const campaign = await campaignFor(copy);
      expect(sentIds(campaign)).toEqual([a1.id, a2.id]);

      const rows = await ledgerFind({ source: 'sms-campaign.group', to_number: { $in: [a1.phoneNumber, a2.phoneNumber] } });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.category).toBe('broadcast');
        expect(row.organization_document_id).toBe(org.documentId);
      }

      expect(await messageCount([a1, a2])).toBe(msgsBefore);
    });

    it('records an opt-out for a 21610 rejection and leaves that volunteer out of everything', async () => {
      const a1 = await makeUser();
      const a2 = await makeUser();
      const copy = uniq('copy');
      stubTransport(async ({ to }) => {
        if (to === a1.phoneNumber) throw { code: 21610 };
        return { sid: 'SMstub', numSegments: '1', numMedia: '0', simulated: false };
      });

      const sentInfo = await svc().sendGroupMsg(
        [a1, a2],
        copy,
        gardenRow,
        { type: 'alert', sender: a2.id, alert: false },
      );

      const a1Row = await strapi.db.query(UID.USER).findOne({ where: { id: a1.id } });
      expect(a1Row.sms_opted_out_at).toBeTruthy();
      expect(sentInfo).toEqual([a2.phoneNumber]);
      const campaign = await campaignFor(copy);
      expect(sentIds(campaign)).toEqual([a2.id]);
      expect(await ledgerFind({ source: 'sms-campaign.group', to_number: a1.phoneNumber })).toHaveLength(0);
      expect(await ledgerFind({ source: 'sms-campaign.group', to_number: a2.phoneNumber })).toHaveLength(1);
    });

    it('treats a gate block as neither sent nor an opt-out', async () => {
      const a1 = await makeUser();
      const a2 = await makeUser();
      const copy = uniq('copy');
      const transport = stubTransport();
      // a1 is sent first
      patchService('api::billing.usage', 'canSend', jest.fn()
        .mockResolvedValueOnce({ allowed: false })
        .mockResolvedValue({ allowed: true, remaining: null, reason: null }));
      const handleSendError = patch(require('../../src/utils/sms-opt-out'), 'handleSendError', jest.fn());

      const sentInfo = await svc().sendGroupMsg(
        [a1, a2],
        copy,
        gardenRow,
        { type: 'alert', sender: a2.id, alert: false },
      );

      expect(sentInfo).toEqual([a2.phoneNumber]);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(handleSendError).toHaveBeenCalledTimes(0);
      const a1Row = await strapi.db.query(UID.USER).findOne({ where: { id: a1.id } });
      expect(a1Row.sms_opted_out_at).toBeNull();
      const campaign = await campaignFor(copy);
      expect(sentIds(campaign)).toEqual([a2.id]);
    });
  });

  describe('AC41 / AC38: poll and RSVP sends (#8, #9, #10)', () => {
    beforeEach(() => { stubTransport(); });

    it('#8 sendPollReminders writes a reminder row attributed to the campaign garden org', async () => {
      const voter = await makeUser();
      await strapi.db.query(UID.CAMPAIGN).create({
        data: {
          publishedAt: null,
          type: 'poll',
          send_reminder: true,
          reminder_sent: null,
          closes_at: new Date(Date.now() + 24 * 3600 * 1000),
          garden: gardenRow.id,
          body: uniq('poll'),
          sent: [voter.id],
        },
      });

      await svc().sendPollReminders();

      const rows = await ledgerFind({ source: 'poll.reminder', to_number: voter.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('reminder');
      expect(rows[0].organization_document_id).toBe(org.documentId);
    });

    it('#9 closePoll writes a transactional row for the sender attributed to the campaign garden org', async () => {
      const sender = await makeUser();
      const voter = await makeUser();
      const campaign = await strapi.db.query(UID.CAMPAIGN).create({
        data: {
          publishedAt: null,
          type: 'poll',
          garden: gardenRow.id,
          body: uniq('poll'),
          sender: sender.id,
          poll_options: [{ label: 'a', text_option: 'x' }],
          option_a: [voter.id],
        },
      });

      await svc().closePoll(campaign.id);

      const rows = await ledgerFind({ source: 'poll.close', to_number: sender.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('transactional');
      expect(rows[0].organization_document_id).toBe(org.documentId);
    });

    it('#10 sendRSVPAlert writes a transactional row for the sender (getLatestCampaign now populates garden)', async () => {
      const sender = await makeUser();
      const rsvper = await makeUser();
      await strapi.db.query(UID.CAMPAIGN).create({
        data: {
          publishedAt: null,
          type: 'rsvp',
          alert: true,
          garden: gardenRow.id,
          body: uniq('rsvp'),
          sender: sender.id,
          sent: [rsvper.id],
          confirmed: [],
        },
      });

      const c = await svc().getLatestCampaign(rsvper, ['rsvp']);
      expect(c.garden.id).toBe(gardenRow.id);

      await svc().sendRSVPAlert(rsvper, c);

      // sendRSVPAlert does not await its send
      const rows = await pollLedger({ source: 'campaign.rsvp-alert', to_number: sender.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('transactional');
      expect(rows[0].organization_document_id).toBe(org.documentId);
    });
  });

  describe('AC60: POST /api/sms-campaigns/sms/group', () => {
    it('still answers 200 with an array of phone-number strings', async () => {
      const manager = await makeUser();
      const v1 = await makeUser();
      const v2 = await makeUser();
      await strapi.db.query(UID.GARDEN).update({
        where: { id: gardenRow.id },
        data: { volunteers: [v1.id, v2.id] },
      });
      await grantPrivileges(1, 'api::sms-campaign.sms-campaign', ['groupSms']);
      stubTransport();

      const res = await http()
        .post('/api/sms-campaigns/sms/group')
        .set('Authorization', `Bearer ${issueJwt(manager)}`)
        .send({ body: uniq('copy'), interest: 'Everyone', garden: gardenRow.id, type: 'alert', sender: manager.id, alert: false });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((x) => typeof x === 'string')).toBe(true);
      expect([...res.body].sort()).toEqual([v1.phoneNumber, v2.phoneNumber].sort());
    });
  });
});
