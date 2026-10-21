'use strict';

/**
 * Call-site metering for the cron-helper sends (AC36 cron path, AC38 sites #2-reminder and #4).
 */

const Helper = require('../../config/helpers/cron-helper');
const { patch } = require('../helpers/patch');
const {
  UID, uniq, makeOrg, makeGarden, makeUser, ledgerFind, pollLedger, stubTransport, clearResolver,
} = require('./helpers');

describe('billing: cs-cron', () => {
  beforeEach(clearResolver);
  afterEach(clearResolver);

  describe('AC36: sendVdayReminder', () => {
    it('texts the garden volunteers (not the opted-out one) and writes reminder rows', async () => {
      const org = await makeOrg();
      const g = await makeGarden({ organization: org.documentId });
      const v1 = await makeUser({ gardens: [g.published.id] });
      const v2 = await makeUser({ gardens: [g.published.id] });
      const vOpt = await makeUser({ gardens: [g.published.id], sms_opted_out_at: new Date() });
      const ev = await strapi.documents(UID.EVENT).create({
        data: {
          title: uniq('Vday'),
          garden: g.documentId,
          startDatetime: new Date(Date.now() + 86400000).toISOString(),
          canceled: false,
          disabled: false,
        },
        status: 'published',
      });
      const vDay = await strapi.db.query(UID.EVENT).findOne({
        where: { documentId: ev.documentId, publishedAt: { $notNull: true } },
        populate: ['garden', 'garden.volunteers'],
      });
      stubTransport();

      const sent = await Helper.sendVdayReminder(vDay, 'reminder copy ' + uniq('c'));

      expect(new Set(sent)).toEqual(new Set([v1.phoneNumber, v2.phoneNumber]));
      expect(sent).not.toContain(vOpt.phoneNumber);

      const rows = await ledgerFind({ organization_document_id: org.documentId });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({
          source: 'volunteer-day.reminder',
          category: 'reminder',
          organization_document_id: org.documentId,
        });
      }
    });
  });

  describe('AC38 #4: sendWaterSms', () => {
    it('writes a reminder row with source cron.water', async () => {
      const org = await makeOrg();
      const g = await makeGarden({ organization: org.documentId });
      const v1 = await makeUser({ gardens: [g.published.id] });
      const created = await strapi.db.query(UID.TASK).create({
        data: {
          title: uniq('Water'),
          type: 'Water',
          task_status: 'INITIALIZED',
          garden: g.published.id,
          volunteers: [v1.id],
          publishedAt: new Date(),
        },
      });
      const task = await strapi.db.query(UID.TASK).findOne({
        where: { id: created.id },
        populate: ['garden', 'volunteers'],
      });
      patch(require('../../config/helpers/weather.js'), 'getGardenWeather', jest.fn().mockResolvedValue({ water: true }));
      stubTransport();

      await Helper.sendWaterSms(task, true);

      const rows = await pollLedger({ source: 'cron.water', to_number: v1.phoneNumber });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: 'reminder',
        source: 'cron.water',
        organization_document_id: org.documentId,
      });
    });
  });
});
