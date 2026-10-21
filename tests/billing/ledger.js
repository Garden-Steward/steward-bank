'use strict';

/**
 * The ledger content type (api::sms-usage.sms-usage): schema shape (AC7) and
 * the fact that it exposes no REST surface or role permissions (AC8).
 */
const { http, issueJwt, makeUser } = require('./helpers');

const UID = 'api::sms-usage.sms-usage';

const EXPECTED_ATTRIBUTES = {
  organization_document_id: 'string',
  garden_document_id: 'string',
  user: 'relation',
  to_number: 'string',
  twilio_sid: 'string',
  source: 'string',
  period: 'string',
  segments: 'integer',
  num_media: 'integer',
  units: 'integer',
  encoding: 'enumeration',
  direction: 'enumeration',
  category: 'enumeration',
  sent_at: 'datetime',
  billable: 'boolean',
  blocked: 'boolean',
  simulated: 'boolean',
  stripe_reported_at: 'datetime',
  stripe_batch_id: 'string',
};

const EXPECTED_ENUMS = {
  encoding: ['gsm7', 'ucs2'],
  direction: ['api', 'twiml_reply'],
  category: ['broadcast', 'reminder', 'transactional', 'system'],
};

describe('billing: ledger', () => {
  describe('AC7: schema', () => {
    it('registers the model as a non-draft collection on sms_usages', () => {
      const model = strapi.getModel(UID);
      expect(model).toBeDefined();
      expect(model.options.draftAndPublish).toBe(false);
      expect(model.collectionName).toBe('sms_usages');
    });

    it.each(Object.entries(EXPECTED_ATTRIBUTES))('has attribute %s of type %s', (name, type) => {
      const attr = strapi.getModel(UID).attributes[name];
      expect(attr).toBeDefined();
      expect(attr.type).toBe(type);
    });

    it.each(Object.entries(EXPECTED_ENUMS))('enumeration %s has exactly the listed values', (name, values) => {
      expect(strapi.getModel(UID).attributes[name].enum).toEqual(values);
    });

    it('marks period, segments, units, direction, category and sent_at required', () => {
      const { attributes } = strapi.getModel(UID);
      ['period', 'segments', 'units', 'direction', 'category', 'sent_at'].forEach((name) => {
        expect(attributes[name].required).toBe(true);
      });
    });

    it('defaults num_media to 0, billable to true, blocked and simulated to false', () => {
      const { attributes } = strapi.getModel(UID);
      expect(attributes.num_media.default).toBe(0);
      expect(attributes.billable.default).toBe(true);
      expect(attributes.blocked.default).toBe(false);
      expect(attributes.simulated.default).toBe(false);
    });

    it('has a one-way manyToOne user relation', () => {
      const { user } = strapi.getModel(UID).attributes;
      expect(user.type).toBe('relation');
      expect(user.relation).toBe('manyToOne');
      expect(user.target).toBe('plugin::users-permissions.user');
      expect(user.inversedBy).toBeUndefined();
      expect(user.mappedBy).toBeUndefined();
    });

    it('has no attribute named status (reserved in Strapi v5)', () => {
      expect(strapi.getModel(UID).attributes.status).toBeUndefined();
    });
  });

  describe('AC8: no REST surface, no role permissions', () => {
    it('returns 404 for the collection and a single entry, anonymously', async () => {
      await http().get('/api/sms-usages').expect(404);
      await http().get('/api/sms-usages/1').expect(404);
    });

    it('returns 404 for the collection and a single entry, authenticated', async () => {
      const token = issueJwt(await makeUser());
      await http().get('/api/sms-usages').set('Authorization', `Bearer ${token}`).expect(404);
      await http().get('/api/sms-usages/1').set('Authorization', `Bearer ${token}`).expect(404);
    });

    it.each([1, 2])('role %i has no api::sms-usage entries in its permission tree', async (id) => {
      const role = await strapi.plugin('users-permissions').service('role').findOne(id);
      expect(role).toBeTruthy();
      expect(role.permissions['api::sms-usage']).toBeUndefined();
    });
  });
});
