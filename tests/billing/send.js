'use strict';

/**
 * api::sms.sms `send` and its wrappers (sendSms, sendContactCard, handleSms).
 * Covers AC14-AC24 and AC32-AC34. Shares the global `strapi` booted for tests/app.test.js.
 *
 * Each test uses a unique ledger `source`, so reading rows back through the Document Service
 * (ledgerFind) also proves AC23: every row is published-visible.
 */

const { patch, patchService } = require('../helpers/patch');
const {
  UID, uniq, makeOrg, makeGarden, makeUser, ledgerFind, stubTransport, clearResolver,
} = require('./helpers');

const CARD_URL = 'https://steward.garden/contactcard.vcf';


describe('billing: send', () => {
  const sms = () => strapi.service('api::sms.sms');
  let org;
  let g;
  let u;

  beforeAll(async () => {
    org = await makeOrg();
    g = await makeGarden({ organization: org.documentId });
    u = await makeUser({ activeGarden: g.published.id });
  });

  beforeEach(clearResolver);

  const baseArgs = (source, overrides = {}) => ({
    to: u.phoneNumber, body: 'hello', garden: g.published, user: u, category: 'reminder', source, ...overrides,
  });

  describe('AC14: a successful send', () => {
    it('resolves the result and writes exactly one fully populated ledger row', async () => {
      const source = uniq('t');
      const transport = stubTransport(async () => ({ sid: 'SM1', numSegments: '2', numMedia: '0', simulated: false }));

      const result = await sms().send(baseArgs(source));

      expect(result).toEqual({ ok: true, sid: 'SM1', segments: 2, units: 2, blocked: false, simulated: false, error: null });
      expect(transport).toHaveBeenCalledTimes(1);

      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        to_number: u.phoneNumber,
        twilio_sid: 'SM1',
        segments: 2,
        units: 2,
        num_media: 0,
        direction: 'api',
        category: 'reminder',
        source,
        billable: true,
        blocked: false,
        simulated: false,
        organization_document_id: org.documentId,
        garden_document_id: g.documentId,
      });
      expect(rows[0].period).toBe(rows[0].sent_at.slice(0, 7));
      expect(rows[0].user.id).toBe(u.id);
    });
  });

  describe('AC15: unusable numSegments falls back to the estimate', () => {
    it.each([null, '0', 'abc'])('numSegments %p uses countSegments (2 segments for 200 chars)', async (numSegments) => {
      const source = uniq('t');
      stubTransport(async () => ({ sid: 'SM15', numSegments, numMedia: '0', simulated: false }));

      const result = await sms().send(baseArgs(source, { body: 'a'.repeat(200) }));

      expect(result.segments).toBe(2);
      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0].segments).toBe(2);
    });
  });

  describe('AC16: media', () => {
    it('charges MMS_UNITS whatever the segment count', async () => {
      const source = uniq('t');
      stubTransport(async () => ({ sid: 'SM16', numSegments: '3', numMedia: '1', simulated: false }));

      const result = await sms().send(baseArgs(source, { body: 'a'.repeat(400), mediaUrl: 'https://example.test/a.jpg' }));

      expect(result.units).toBe(3);
      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ num_media: 1, units: 3 });
    });
  });

  describe('AC17: billability and category normalization', () => {
    it('stores category "system" as not billable', async () => {
      const source = uniq('t');
      stubTransport();

      await sms().send(baseArgs(source, { category: 'system' }));

      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ category: 'system', billable: false });
    });

    it.each([undefined, 'bogus'])('records category %p as billable "transactional" with one warning naming the source', async (category) => {
      const source = uniq('t');
      stubTransport();
      const warn = patch(strapi.log, 'warn', jest.fn());

      await sms().send(baseArgs(source, { category }));

      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ category: 'transactional', billable: true });
      const naming = warn.mock.calls.filter((c) => String(c[0]).includes(source));
      expect(naming).toHaveLength(1);
    });
  });

  describe('AC18: a rejecting transport', () => {
    const err = Object.assign(new Error('unsub'), { code: 21610 });

    it('resolves ok:false with the error and writes no row', async () => {
      const source = uniq('t');
      stubTransport(async () => { throw err; });

      const result = await sms().send(baseArgs(source));

      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(false);
      expect(result.error).toBe(err);
      expect(await ledgerFind({ source })).toHaveLength(0);
    });

    it('rejects with the same error object when throwOnError is set', async () => {
      const source = uniq('t');
      stubTransport(async () => { throw err; });

      await expect(sms().send(baseArgs(source, { throwOnError: true }))).rejects.toBe(err);
      expect(await ledgerFind({ source })).toHaveLength(0);
    });
  });

  describe('AC19: metering never blocks delivery', () => {
    it('still calls the transport once and resolves ok:true when the resolver and the ledger both throw', async () => {
      const source = uniq('t');
      const transport = stubTransport();
      patchService('api::billing.resolver', 'resolveContext', jest.fn().mockRejectedValue(new Error('x')));
      patchService('api::billing.usage', 'record', jest.fn().mockRejectedValue(new Error('y')));

      const result = await sms().send(baseArgs(source));

      expect(transport).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });
  });

  describe('AC20: the gate seam', () => {
    it('resolves blocked without calling beforeSend or the transport, and records a blocked row', async () => {
      const source = uniq('t');
      const transport = stubTransport();
      patchService('api::billing.usage', 'canSend', jest.fn().mockResolvedValue({ allowed: false }));
      const beforeSend = jest.fn();

      const result = await sms().send(baseArgs(source, { throwOnError: true, beforeSend }));

      expect(result).toMatchObject({ ok: false, blocked: true });
      expect(transport).not.toHaveBeenCalled();
      expect(beforeSend).not.toHaveBeenCalled();

      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ blocked: true, billable: false, twilio_sid: null });
    });
  });

  describe('AC21: beforeSend ordering', () => {
    it('runs after canSend and before the transport', async () => {
      const source = uniq('t');
      const order = [];
      stubTransport(async () => {
        order.push('transport');
        return { sid: 'SM21', numSegments: '1', numMedia: '0', simulated: false };
      });
      patchService('api::billing.usage', 'canSend', jest.fn(async () => {
        order.push('canSend');
        return { allowed: true };
      }));

      await sms().send(baseArgs(source, { beforeSend: async () => { order.push('beforeSend'); } }));

      expect(order).toEqual(['canSend', 'beforeSend', 'transport']);
    });

    it('still sends when beforeSend throws', async () => {
      const source = uniq('t');
      const transport = stubTransport();

      const result = await sms().send(baseArgs(source, { beforeSend: async () => { throw new Error('boom'); } }));

      expect(transport).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });
  });

  describe('AC22: dry-run with the real transport', () => {
    it('resolves simulated with no sid and records a simulated row', async () => {
      const source = uniq('t');

      const result = await sms().send(baseArgs(source));

      expect(result).toMatchObject({ ok: true, simulated: true, sid: null });
      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ simulated: true, twilio_sid: null });
    });
  });

  describe('AC24: an unknown user id', () => {
    it('still writes the row, with user null', async () => {
      const source = uniq('t');
      stubTransport();

      const result = await sms().send(baseArgs(source, { garden: undefined, user: { id: 999999 } }));

      expect(result.ok).toBe(true);
      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0].user).toBeNull();
    });
  });

  describe('AC32: sendSms', () => {
    it('returns a promise that resolves the send result', async () => {
      const source = uniq('t');
      stubTransport(async () => ({ sid: 'SM32', numSegments: '1', numMedia: '0', simulated: false }));

      const p = sms().sendSms(u.phoneNumber, 'hi', undefined, { category: 'system', source });

      expect(typeof p.then).toBe('function');
      await expect(p).resolves.toEqual({ ok: true, sid: 'SM32', segments: 1, units: 1, blocked: false, simulated: false, error: null });
    });

    it('rejects when the transport rejects', async () => {
      const source = uniq('t');
      stubTransport(async () => { throw new Error('twilio down'); });

      await expect(sms().sendSms(u.phoneNumber, 'hi', undefined, { category: 'system', source })).rejects.toThrow('twilio down');
    });

    it('resolves { blocked: true } when the gate blocks', async () => {
      const source = uniq('t');
      stubTransport();
      patchService('api::billing.usage', 'canSend', jest.fn().mockResolvedValue({ allowed: false }));

      await expect(sms().sendSms(u.phoneNumber, 'hi', undefined, { category: 'system', source }))
        .resolves.toMatchObject({ blocked: true });
    });
  });

  describe('AC33: sendContactCard', () => {
    it('sends the card as an MMS and attributes it through the active garden', async () => {
      const transport = stubTransport();

      await sms().sendContactCard(u.phoneNumber, { user: { id: u.id } });

      expect(transport).toHaveBeenCalledWith({ to: u.phoneNumber, body: '', mediaUrl: CARD_URL });
      const rows = await ledgerFind({ source: 'sms.contact-card', to_number: u.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'transactional',
        num_media: 1,
        units: 3,
        organization_document_id: org.documentId,
      });
    });

    it('rejects when the transport rejects', async () => {
      stubTransport(async () => { throw new Error('twilio down'); });

      await expect(sms().sendContactCard(u.phoneNumber, { user: { id: u.id } })).rejects.toThrow('twilio down');
    });
  });

  describe('AC34: handleSms', () => {
    let G;
    let task;

    beforeAll(async () => {
      G = await makeGarden({ organization: (await makeOrg()).documentId });
      const created = await strapi.db.query(UID.TASK).create({
        data: { title: uniq('task'), garden: g.published.id, publishedAt: new Date() },
      });
      task = await strapi.db.query(UID.TASK).findOne({ where: { id: created.id }, populate: ['garden'] });
      task.primary_image = { url: 'https://example.test/t.jpg' };
    });

    const messagesFor = (body) => strapi.db.query(UID.MESSAGE).findMany({
      where: { user: u.id, body },
      populate: ['user', 'garden', 'garden_task'],
    });

    const smsParams = (body, source, overrides = {}) => ({
      task, body, type: 'question', previous: 'p', user: u, meta_data: { k: 1 }, garden: G.published, category: 'reminder', source, ...overrides,
    });

    it('writes the message row exactly as before and sends to the user with the task image', async () => {
      const source = uniq('t');
      const body = uniq('body');
      const transport = stubTransport();

      await sms().handleSms(smsParams(body, source));

      const messages = await messagesFor(body);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ type: 'question', body, previous: 'p', meta_data: { k: 1 } });
      expect(messages[0].user.id).toBe(u.id);
      expect(messages[0].garden_task.id).toBe(task.id);
      // The message garden is the task's garden, not the attribution garden passed in params.
      expect(messages[0].garden.id).toBe(task.garden.id);
      expect(messages[0].garden.id).toBe(g.published.id);
      expect(messages[0].garden.id).not.toBe(G.published.id);

      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledWith({ to: u.phoneNumber, body, mediaUrl: 'https://example.test/t.jpg' });

      // The ledger row is attributed to the garden passed in params.
      const rows = await ledgerFind({ source });
      expect(rows).toHaveLength(1);
      expect(rows[0].garden_document_id).toBe(G.documentId);
    });

    it('does not reject when the transport rejects', async () => {
      const source = uniq('t');
      const body = uniq('body');
      stubTransport(async () => { throw new Error('twilio down'); });

      await expect(sms().handleSms(smsParams(body, source))).resolves.toMatchObject({ ok: false, blocked: false });
    });

    it('creates no message row when the gate blocks', async () => {
      const source = uniq('t');
      const body = uniq('body');
      const transport = stubTransport();
      patchService('api::billing.usage', 'canSend', jest.fn().mockResolvedValue({ allowed: false }));

      const result = await sms().handleSms(smsParams(body, source));

      expect(result).toMatchObject({ ok: false, blocked: true });
      expect(transport).not.toHaveBeenCalled();
      expect(await messagesFor(body)).toHaveLength(0);
    });
  });
});
