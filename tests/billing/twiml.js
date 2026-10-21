'use strict';

/**
 * TwiML replies from POST /api/sms (message.fetchSms) are metered as outbound ledger rows.
 * Covers AC42-AC45. Shares the global `strapi` booted for tests/app.test.js.
 */

const { patch } = require('../helpers/patch');
const { grantPrivileges } = require('../helpers/strapi');
const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { countSegments } = require('../../src/utils/sms-segments');
const {
  UID, makeOrg, makeGarden, makeUser, http, ledgerFind, ledgerCount, clearResolver,
} = require('./helpers');

// Pre-change TwiML, computed from twilio 3.84.1 on 54ca1e3 (hard-coded on purpose, AC45).
const SMILES_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You\'re cute, but I\'m just a bot ;)</Message></Response>';
const UNKNOWN_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>I don\'t understand. You can always try OPTIONS to find out more things to do with our service.</Message></Response>';
const SMILES_TEXT = 'You\'re cute, but I\'m just a bot ;)';

const unescapeXml = (s) => s.replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
const messageText = (xml) => unescapeXml(xml.match(/<Message>([\s\S]*?)<\/Message>/)[1]);

describe('billing: twiml', () => {
  let org;
  let g;
  let u;

  const post = (from, body) => http().post('/api/sms').type('form').send({ From: from, Body: body });
  const replyRows = (user) => ledgerFind({ to_number: user.phoneNumber, source: 'webhook.reply' });

  beforeAll(async () => {
    await grantPrivileges(2, 'api::message.message', ['fetchSms']);
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
  });

  beforeEach(async () => {
    clearResolver();
    // A fresh user per test keeps validateQuestion empty. Username differs from the phone and the email is real.
    u = await makeUser({ activeGarden: g.published.id, gardens: [g.published.id] });
  });

  afterEach(clearResolver);

  describe('AC42: a plain text reply', () => {
    it('answers 200 with the same text and writes exactly one twiml_reply row', async () => {
      const res = await post(u.phoneNumber, 'smiles');

      expect(res.status).toBe(200);
      expect(res.text).toBe(SMILES_TWIML);
      expect(messageText(res.text)).toBe(SMILES_TEXT);

      const rows = await replyRows(u);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        direction: 'twiml_reply',
        category: 'transactional',
        source: 'webhook.reply',
        twilio_sid: null,
        to_number: u.phoneNumber,
        segments: countSegments(SMILES_TEXT).segments,
        num_media: 0,
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
        simulated: strapi.service('api::sms.transport').isDryRun(),
      });
      expect(rows[0].simulated).toBe(true);
      expect(rows[0].user.id).toBe(u.id);
    });
  });

  describe('AC43: a reply that uses the media branch', () => {
    it('records num_media 1 and units 3', async () => {
      patch(SmsHelper, 'finishTask', jest.fn().mockResolvedValue({
        body: 'Nice work!',
        type: 'reply',
        task: { primary_image: { formats: { medium: { url: 'https://example.test/m.jpg' } } } },
      }));

      const res = await post(u.phoneNumber, 'done');

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Media>https://example.test/m.jpg</Media>');

      const rows = await replyRows(u);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        direction: 'twiml_reply',
        num_media: 1,
        units: 3,
        organization_document_id: org.documentId,
      });
    });
  });

  describe('AC44: STOP and START send no reply', () => {
    it('leaves the ledger untouched for each', async () => {
      const count = () => ledgerCount({ to_number: u.phoneNumber });
      expect(await count()).toBe(0);

      const stop = await post(u.phoneNumber, 'STOP');
      expect(stop.status).toBe(200);
      expect(await count()).toBe(0);

      const start = await post(u.phoneNumber, 'START');
      expect(start.status).toBe(200);
      expect(await count()).toBe(0);
    });
  });

  describe('F2: replies Twilio blocks are not metered', () => {
    it('writes no row for other opt-out keywords, which get a reply Twilio never sends', async () => {
      for (const word of ['UNSUBSCRIBE', 'Cancel', 'stopall', 'quit.']) {
        const res = await post(u.phoneNumber, word);
        expect(res.status).toBe(200);
      }
      expect(await ledgerCount({ to_number: u.phoneNumber })).toBe(0);
    });

    it('writes no row when the sender is already opted out, and the TwiML is unchanged', async () => {
      await strapi.db.query(UID.USER).update({ where: { id: u.id }, data: { sms_opted_out_at: new Date() } });
      const res = await post(u.phoneNumber, 'smiles');
      expect(res.text).toBe(SMILES_TWIML);
      expect(await ledgerCount({ to_number: u.phoneNumber })).toBe(0);
    });
  });

  describe('AC45: the TwiML output is unchanged', () => {
    it('is byte-equal to the pre-change fixture for "smiles"', async () => {
      const res = await post(u.phoneNumber, 'smiles');
      expect(res.text).toBe(SMILES_TWIML);
    });

    it('is byte-equal to the pre-change fixture for unknown text', async () => {
      const res = await post(u.phoneNumber, 'purple monkey dishwasher');
      expect(res.text).toBe(UNKNOWN_TWIML);
    });
  });
});
