'use strict';

/**
 * api::billing.coverage audit() and backfill(). Covers AC54 (second half), AC55, AC56, AC57.
 * Runs last (tests/billing/index.js): backfill({ apply: true }) is DB-wide.
 */

const { UID, uniq, makeOrg, makeGarden, gardenRows, clearResolver } = require('./helpers');

const coverage = () => strapi.service('api::billing.coverage');
const unlink = (id) => strapi.db.query(UID.GARDEN).update({ where: { id }, data: { organization: null } });
const relink = (id, orgRowId) => strapi.db.query(UID.GARDEN).update({ where: { id }, data: { organization: orgRowId } });

const counts = async () => {
  const gardenMeta = strapi.db.metadata.get(UID.GARDEN);
  const n = async (table) => Number((await strapi.db.connection(table).count({ n: '*' }).first()).n);
  expect(gardenMeta.attributes.organization.joinTable.name).toBe('gardens_organization_lnk');
  return {
    gardens: await n(gardenMeta.tableName),
    orgs: await n(strapi.db.metadata.get(UID.ORG).tableName),
    links: await n(gardenMeta.attributes.organization.joinTable.name),
  };
};

const orgDocCount = async () => {
  const rows = await strapi.db.query(UID.ORG).findMany({ select: ['documentId'] });
  return new Set(rows.map((r) => r.documentId)).size;
};

const orgRowsOf = (documentId) => strapi.db.query(UID.ORG).findMany({ where: { documentId }, select: ['id', 'documentId', 'title', 'publishedAt'] });

describe('billing: org-coverage', () => {
  const fx = {};

  beforeAll(async () => {
    clearResolver();
    // OK
    const okOrg = await makeOrg();
    fx.ok = await makeGarden({ organization: okOrg.documentId });
    // ORPHAN, two rows
    fx.orphan = await makeGarden({ organization: null });
    // ORPHAN, title differs between draft and published
    fx.titleDiff = await makeGarden({ organization: null, title: uniq('Cov Title') });
    fx.titleDiffDraftTitle = `${fx.titleDiff.title} (draft edit)`;
    await strapi.db.query(UID.GARDEN).update({ where: { id: fx.titleDiff.draft.id }, data: { title: fx.titleDiffDraftTitle } });
    // ORPHAN, raw db.query create (AC54)
    const rawTitle = uniq('Cov Raw');
    const rawSlug = uniq('covraw');
    const rawRow = await strapi.db.query(UID.GARDEN).create({ data: { title: rawTitle, sms_slug: rawSlug, publishedAt: new Date() }, select: ['id', 'documentId'] });
    fx.raw = { documentId: rawRow.documentId, title: rawTitle, sms_slug: rawSlug };
    // PUBLISHED_UNLINKED
    fx.pubOrg = await makeOrg();
    fx.pubUnlinked = await makeGarden({ organization: fx.pubOrg.documentId });
    await unlink(fx.pubUnlinked.published.id);
    // DRAFT_UNLINKED
    fx.draftOrg = await makeOrg();
    fx.draftUnlinked = await makeGarden({ organization: fx.draftOrg.documentId });
    fx.draftUnlinkedDraftTitle = `${fx.draftUnlinked.title} (pending edit)`;
    await strapi.db.query(UID.GARDEN).update({ where: { id: fx.draftUnlinked.draft.id }, data: { organization: null, title: fx.draftUnlinkedDraftTitle } });
    // MISMATCH
    fx.mmA = await makeOrg();
    fx.mmB = await makeOrg();
    fx.mismatch = await makeGarden({ organization: fx.mmA.documentId });
    await relink(fx.mismatch.published.id, fx.mmB.publishedId);
    // ORG_UNPUBLISHED
    fx.unpubOrg = await makeOrg({ publish: false });
    fx.orgUnpublished = await makeGarden({ organization: fx.unpubOrg.documentId, publish: false });
    // MAPPED ORPHAN (AC57)
    fx.mapped = await makeGarden({ organization: null });
    fx.existingOrg = await makeOrg();
  });

  afterAll(clearResolver);

  const find = (audit, doc) => audit.gardens.find((g) => g.documentId === doc.documentId);

  it('AC54/AC55: audit classifies every fixture and writes nothing', async () => {
    const before = await counts();
    const audit = await coverage().audit();
    const after = await counts();
    expect(after).toEqual(before);

    const expected = [
      ['ok', 'OK'], ['orphan', 'ORPHAN'], ['titleDiff', 'ORPHAN'], ['raw', 'ORPHAN'],
      ['pubUnlinked', 'PUBLISHED_UNLINKED'], ['draftUnlinked', 'DRAFT_UNLINKED'],
      ['mismatch', 'MISMATCH'], ['orgUnpublished', 'ORG_UNPUBLISHED'], ['mapped', 'ORPHAN'],
    ];
    for (const [key, cls] of expected) {
      expect(find(audit, fx[key])?.classification).toBe(cls);
    }
    for (const k of ['total', 'OK', 'ORPHAN', 'PUBLISHED_UNLINKED', 'DRAFT_UNLINKED', 'MISMATCH', 'ORG_UNPUBLISHED', 'noDocumentId']) {
      expect(typeof audit.summary[k]).toBe('number');
    }
    expect(audit.summary.total).toBe(audit.gardens.length);
  });

  it('AC56: a dry run changes nothing and plans the expected actions', async () => {
    const before = await counts();
    const res = await coverage().backfill({ apply: false, map: { [fx.mapped.documentId]: fx.existingOrg.documentId } });
    expect(res.apply).toBe(false);
    expect(await counts()).toEqual(before);

    const act = (doc) => res.actions.find((a) => a.gardenDocumentId === doc.documentId);
    expect(act(fx.orphan).type).toBe('create-org');
    expect(act(fx.titleDiff).type).toBe('create-org');
    expect(act(fx.raw).type).toBe('create-org');
    expect(act(fx.pubUnlinked).type).toBe('link-published-row');
    expect(act(fx.draftUnlinked).type).toBe('link-draft-row');
    expect(act(fx.mapped).type).toBe('link-mapped-org');
    expect(act(fx.ok)).toBeUndefined();
    expect(act(fx.mismatch)).toBeUndefined();
    expect(act(fx.orgUnpublished)).toBeUndefined();
  });

  it('AC56/AC57: apply links orphans, published and draft rows without touching other fields', async () => {
    const audit = await coverage().audit();
    const mappedDoc = fx.mapped.documentId;
    const orphansBefore = audit.gardens.filter((g) => g.classification === 'ORPHAN' && g.documentId !== mappedDoc);
    const docsBefore = await orgDocCount();
    // makeGarden's middleware-created (then unlinked) org may already carry this title; apply must not add another.
    const mappedTitleOrgsBefore = (await strapi.db.query(UID.ORG).findMany({ where: { title: fx.mapped.title } })).length;
    const mismatchBefore = await gardenRows(fx.mismatch.documentId);
    const unpubBefore = await gardenRows(fx.orgUnpublished.documentId);

    const res = await coverage().backfill({ apply: true, map: { [mappedDoc]: fx.existingOrg.documentId } });
    expect(res.apply).toBe(true);
    expect(await orgDocCount()).toBe(docsBefore + orphansBefore.length);

    // Fixture orphans: new org, draft -> draft row, published -> published row, titled exactly as the garden
    for (const [key, expectedTitle] of [['orphan', fx.orphan.title], ['titleDiff', fx.titleDiff.title], ['raw', fx.raw.title]]) {
      const rows = await gardenRows(fx[key].documentId);
      const links = [rows.draft, rows.published].filter(Boolean);
      expect(links.length).toBeGreaterThan(0);
      const orgDoc = links[0].organization.documentId;
      const orgRows = await orgRowsOf(orgDoc);
      expect(orgRows).toHaveLength(2);
      const orgDraft = orgRows.find((o) => !o.publishedAt);
      const orgPub = orgRows.find((o) => o.publishedAt);
      expect(orgPub.title).toBe(expectedTitle);
      expect(orgDraft.title).toBe(expectedTitle);
      if (rows.draft) expect(rows.draft.organization.id).toBe(orgDraft.id);
      if (rows.published) expect(rows.published.organization.id).toBe(orgPub.id);
    }

    // Title-differs garden keeps both titles
    const td = await strapi.db.query(UID.GARDEN).findMany({ where: { documentId: fx.titleDiff.documentId }, select: ['id', 'title', 'publishedAt'] });
    expect(td.find((r) => !r.publishedAt).title).toBe(fx.titleDiffDraftTitle);
    expect(td.find((r) => r.publishedAt).title).toBe(fx.titleDiff.title);

    // Mapped orphan
    const mappedRows = await gardenRows(mappedDoc);
    expect(mappedRows.draft.organization.id).toBe(fx.existingOrg.draftId);
    expect(mappedRows.published.organization.id).toBe(fx.existingOrg.publishedId);
    expect(await strapi.db.query(UID.ORG).findMany({ where: { title: fx.mapped.title } })).toHaveLength(mappedTitleOrgsBefore);

    // PUBLISHED_UNLINKED
    const pu = await gardenRows(fx.pubUnlinked.documentId);
    expect(pu.published.organization.id).toBe(fx.pubOrg.publishedId);
    expect(pu.draft.organization.id).toBe(fx.pubOrg.draftId);

    // DRAFT_UNLINKED: draft linked, published row and the pending draft edit untouched
    const du = await gardenRows(fx.draftUnlinked.documentId);
    expect(du.draft.organization.id).toBe(fx.draftOrg.draftId);
    expect(du.published.organization.id).toBe(fx.draftOrg.publishedId);
    const duRows = await strapi.db.query(UID.GARDEN).findMany({ where: { documentId: fx.draftUnlinked.documentId }, select: ['id', 'title', 'publishedAt'] });
    expect(duRows.find((r) => !r.publishedAt).title).toBe(fx.draftUnlinkedDraftTitle);
    expect(duRows.find((r) => r.publishedAt).title).toBe(fx.draftUnlinked.title);

    // MISMATCH and ORG_UNPUBLISHED unchanged
    const mmAfter = await gardenRows(fx.mismatch.documentId);
    expect(mmAfter.draft.organization.id).toBe(mismatchBefore.draft.organization.id);
    expect(mmAfter.published.organization.id).toBe(mismatchBefore.published.organization.id);
    const unpubAfter = await gardenRows(fx.orgUnpublished.documentId);
    expect(unpubAfter.draft.organization.id).toBe(unpubBefore.draft.organization.id);
    expect(unpubAfter.published).toBeNull();
  });

  it('AC56: a second apply is a no-op', async () => {
    const res = await coverage().backfill({ apply: true });
    expect(res.actions).toHaveLength(0);
    const audit = await coverage().audit();
    expect(audit.summary.ORPHAN).toBe(0);
    expect(audit.summary.PUBLISHED_UNLINKED).toBe(0);
    expect(audit.summary.DRAFT_UNLINKED).toBe(0);
  });

  it('F1: a map entry re-points gardens that already have their own org, and reports entries it cannot use', async () => {
    const shared = await makeOrg();
    const ownA = await makeOrg();
    const a = await makeGarden({ organization: ownA.documentId });
    const ownB = await makeOrg();
    const b = await makeGarden({ organization: ownB.documentId });
    const bOwnOrg = ownB.documentId;
    const map = {
      [a.documentId]: shared.documentId,
      [b.documentId]: shared.documentId,
      'no-such-garden': shared.documentId,
    };

    const dry = await coverage().backfill({ apply: false, map });
    const act = (g) => dry.actions.find((x) => x.gardenDocumentId === g.documentId);
    expect(act(a)).toMatchObject({ type: 'repoint-mapped-org', organizationDocumentId: shared.documentId, previousOrgs: [ownA.documentId] });
    expect(act(b)).toMatchObject({ type: 'repoint-mapped-org', previousOrgs: [bOwnOrg] });
    expect(dry.skipped).toContainEqual({ gardenDocumentId: 'no-such-garden', organizationDocumentId: shared.documentId, reason: 'map garden not found' });

    await coverage().backfill({ apply: true, map });
    for (const g of [a, b]) {
      const rows = await gardenRows(g.documentId);
      expect(rows.draft.organization.id).toBe(shared.draftId);
      expect(rows.published.organization.id).toBe(shared.publishedId);
      expect(rows.published.title).toBe(g.title);
    }

    // Idempotent: the same map plans nothing for gardens already under the target.
    const again = await coverage().backfill({ apply: false, map });
    expect(again.actions.filter((x) => [a.documentId, b.documentId].includes(x.gardenDocumentId))).toHaveLength(0);
  });
});
