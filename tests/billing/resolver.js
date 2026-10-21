'use strict';

/**
 * api::billing.resolver: garden / task / event / user -> { gardenDocumentId, organizationDocumentId }.
 * Covers AC25-AC29. Shares the global `strapi` booted for tests/app.test.js.
 */

const { patchQuery } = require('../helpers/patch');
const {
  UID, uniq, makeOrg, makeGarden, makeUser, clearResolver,
} = require('./helpers');

const NULLS = { gardenDocumentId: null, organizationDocumentId: null };

describe('billing: resolver', () => {
  const resolver = () => strapi.service('api::billing.resolver');

  beforeEach(clearResolver);
  afterEach(clearResolver);

  describe('AC25: any garden reference resolves to the same pair', () => {
    it('accepts a row object, a row id (number or string) or a documentId', async () => {
      const P = await makeOrg();
      const g = await makeGarden({ organization: P.documentId });
      const expected = { gardenDocumentId: g.documentId, organizationDocumentId: P.documentId };

      const refs = [
        g.draft,
        g.published,
        g.draft.id,
        g.published.id,
        String(g.published.id),
        g.documentId,
      ];
      for (const ref of refs) {
        clearResolver();
        await expect(resolver().resolveContext({ garden: ref })).resolves.toEqual(expected);
      }
    });
  });

  describe('AC26: org fallback and empty inputs', () => {
    it('falls back to the draft row org when the published row has none', async () => {
      const D = await makeOrg();
      const g = await makeGarden({ organization: D.documentId });
      await strapi.db.query(UID.GARDEN).update({
        where: { id: g.published.id },
        data: { organization: null },
      });

      await expect(resolver().resolveContext({ garden: g.documentId })).resolves.toEqual({
        gardenDocumentId: g.documentId,
        organizationDocumentId: D.documentId,
      });
    });

    it('returns a null org for an org-less garden', async () => {
      const g = await makeGarden({ organization: null });
      await expect(resolver().resolveContext({ garden: g.documentId })).resolves.toEqual({
        gardenDocumentId: g.documentId,
        organizationDocumentId: null,
      });
    });

    it('returns both null with no inputs', async () => {
      await expect(resolver().resolveContext({})).resolves.toEqual(NULLS);
      await expect(resolver().resolveContext()).resolves.toEqual(NULLS);
    });
  });

  describe('AC27: errors never escape', () => {
    it('resolves nulls when the garden findMany throws', async () => {
      const g = await makeGarden({ organization: null });
      patchQuery(UID.GARDEN, 'findMany', jest.fn().mockRejectedValue(new Error('boom')));

      await expect(resolver().resolveContext({ garden: g.documentId })).resolves.toEqual(NULLS);
    });
  });

  describe('AC28: precedence and lazy loading', () => {
    // Four gardens, four orgs.
    const makeLinked = async () => {
      const org = await makeOrg();
      const garden = await makeGarden({ organization: org.documentId });
      return { org, garden };
    };

    it('prefers garden, then task.garden, then event.garden, then user.activeGarden', async () => {
      const [a, b, c, d] = [await makeLinked(), await makeLinked(), await makeLinked(), await makeLinked()];
      const ctx = {
        garden: a.garden.published,
        task: { garden: b.garden.published },
        event: { garden: c.garden.published },
        user: { activeGarden: d.garden.published },
      };

      const orgOf = async (input) => (await resolver().resolveContext(input)).organizationDocumentId;
      expect(await orgOf(ctx)).toBe(a.org.documentId);

      const { garden: _garden, ...noGarden } = ctx;
      expect(await orgOf(noGarden)).toBe(b.org.documentId);

      const { task: _task, ...noTask } = noGarden;
      expect(await orgOf(noTask)).toBe(c.org.documentId);

      const { event: _event, ...noEvent } = noTask;
      expect(await orgOf(noEvent)).toBe(d.org.documentId);
    });

    it('lazy-loads task.garden when the task has no garden key', async () => {
      const { org, garden } = await makeLinked();
      const task = await strapi.db.query(UID.TASK).create({
        data: { title: uniq('t'), garden: garden.published.id, publishedAt: new Date() },
      });

      await expect(resolver().resolveContext({ task: { id: task.id } })).resolves.toEqual({
        gardenDocumentId: garden.documentId,
        organizationDocumentId: org.documentId,
      });
    });

    it('lazy-loads event.garden when the event has no garden key', async () => {
      const { org, garden } = await makeLinked();
      const created = await strapi.documents(UID.EVENT).create({
        data: {
          title: uniq('e'),
          garden: garden.documentId,
          startDatetime: new Date().toISOString(),
          canceled: false,
          disabled: false,
        },
        status: 'published',
      });
      const published = await strapi.db.query(UID.EVENT).findOne({
        where: { documentId: created.documentId, publishedAt: { $notNull: true } },
        select: ['id'],
      });

      await expect(resolver().resolveContext({ event: { id: published.id } })).resolves.toEqual({
        gardenDocumentId: garden.documentId,
        organizationDocumentId: org.documentId,
      });
    });

    it('lazy-loads user.activeGarden when the user has no activeGarden key', async () => {
      const { org, garden } = await makeLinked();
      const u = await makeUser({ activeGarden: garden.published.id });

      await expect(resolver().resolveContext({ user: { id: u.id } })).resolves.toEqual({
        gardenDocumentId: garden.documentId,
        organizationDocumentId: org.documentId,
      });
    });
  });

  describe('AC29: cache', () => {
    it('hits the garden findMany once per garden until cleared or expired', async () => {
      const org = await makeOrg();
      const g = await makeGarden({ organization: org.documentId });

      const repo = strapi.db.query(UID.GARDEN);
      const real = repo.findMany;
      const spy = patchQuery(UID.GARDEN, 'findMany', jest.fn((...a) => real.apply(repo, a)));

      await resolver().resolveContext({ garden: g.documentId });
      await resolver().resolveContext({ garden: g.documentId });
      expect(spy).toHaveBeenCalledTimes(1);

      resolver().clearCache();
      await resolver().resolveContext({ garden: g.documentId });
      expect(spy).toHaveBeenCalledTimes(2);

      // Past the 5 minute TTL.
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 301000);
      try {
        await resolver().resolveContext({ garden: g.documentId });
        expect(spy).toHaveBeenCalledTimes(3);
      } finally {
        nowSpy.mockRestore();
      }

      clearResolver();
    });
  });
});
