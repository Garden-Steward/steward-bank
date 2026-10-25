'use strict';

/**
 * Auto-created org on garden create (api::billing.coverage.provisionForGardenCreate).
 * Covers AC51-AC53 and the first half of AC54. Shares the global `strapi` booted for tests/app.test.js.
 */

const { UID, uniq, makeOrg, gardenRows, clearResolver } = require('./helpers');

const orgRows = (where) => strapi.db.query(UID.ORG).findMany({ where });
const orgCount = () => strapi.db.query(UID.ORG).count({});

describe('billing: org-create', () => {
  beforeEach(clearResolver);
  afterEach(clearResolver);

  describe('AC51: a garden without an organization gets one', () => {
    const cases = [
      ['no organization key', 'Coverage A', 'cova', {}],
      ['organization: null', 'Coverage B', 'covb', { organization: null }],
      ['empty connect/disconnect', 'Coverage C', 'covc', { organization: { connect: [], disconnect: [] } }],
    ];

    it.each(cases)('%s', async (_label, baseTitle, slugPrefix, extra) => {
      const title = uniq(baseTitle);
      const doc = await strapi.documents(UID.GARDEN).create({
        data: { title, sms_slug: uniq(slugPrefix), ...extra },
      });

      const orgs = await orgRows({ title });
      expect(orgs).toHaveLength(2);
      const docIds = new Set(orgs.map((o) => o.documentId));
      expect(docIds.size).toBe(1);
      const [orgDocId] = [...docIds];
      expect(orgs.filter((o) => !o.publishedAt)).toHaveLength(1);
      expect(orgs.filter((o) => o.publishedAt)).toHaveLength(1);

      const draft = (await gardenRows(doc.documentId)).draft;
      expect(draft.organization.documentId).toBe(orgDocId);

      await strapi.documents(UID.GARDEN).publish({ documentId: doc.documentId });
      const published = (await gardenRows(doc.documentId)).published;
      expect(published.organization.documentId).toBe(orgDocId);
      expect(published.organization.publishedAt).not.toBeNull();

      clearResolver();
      const ctx = await strapi.service('api::billing.resolver').resolveContext({ garden: doc.documentId });
      expect(ctx.organizationDocumentId).toBe(orgDocId);
    });
  });

  describe('AC52: an explicit organization is respected', () => {
    it('creates no org when one is passed as a documentId or connect', async () => {
      const existing = await makeOrg();
      const before = await orgCount();

      await strapi.documents(UID.GARDEN).create({
        data: { title: uniq('Explicit A'), sms_slug: uniq('expa'), organization: existing.documentId },
      });
      await strapi.documents(UID.GARDEN).create({
        data: { title: uniq('Explicit B'), sms_slug: uniq('expb'), organization: { connect: [existing.documentId] } },
      });

      expect(await orgCount()).toBe(before);
    });
  });

  describe('AC53: a failed garden create leaves no orphan org', () => {
    it('removes the auto-created org when the garden create rejects', async () => {
      // Draft creates skip unique validation, so both creates publish; the duplicate fails in the internal publish.
      const slug = uniq('dup');
      await strapi.documents(UID.GARDEN).create({
        data: { title: uniq('Dup First'), sms_slug: slug },
        status: 'published',
      });
      const before = await orgCount();

      const secondTitle = uniq('Dup Second');
      await expect(strapi.documents(UID.GARDEN).create({
        data: { title: secondTitle, sms_slug: slug },
        status: 'published',
      })).rejects.toThrow();

      expect(await orgCount()).toBe(before);
      expect(await orgRows({ title: secondTitle })).toHaveLength(0);
    });
  });

  describe('AC54 (first half): db.query creates are not intercepted', () => {
    it('creates no org', async () => {
      const before = await orgCount();
      await strapi.db.query(UID.GARDEN).create({
        data: { title: uniq('Raw'), sms_slug: uniq('raw'), publishedAt: new Date() },
      });
      expect(await orgCount()).toBe(before);
    });
  });
});
