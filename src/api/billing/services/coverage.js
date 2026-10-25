'use strict';

/**
 * Org coverage for SMS billing attribution: every garden should belong to an organization.
 * provisionForGardenCreate is a Document Service middleware body (registered in src/index.js).
 */

const ORG = 'api::organization.organization';
const GARDEN = 'api::garden.garden';

const nonEmpty = (x) => (Array.isArray(x) ? x.length > 0 : (x != null && x !== ''));

const hasOrganization = (v) => {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') {
    if ('connect' in v || 'set' in v || 'disconnect' in v) return nonEmpty(v.connect) || nonEmpty(v.set);
    return true;
  }
  return true;
};

const CLASSES = ['OK', 'ORPHAN', 'PUBLISHED_UNLINKED', 'DRAFT_UNLINKED', 'MISMATCH', 'ORG_UNPUBLISHED'];

/** documentId -> { draftId, publishedId } for the given org documentIds. */
const loadOrgVersions = async (strapi, documentIds) => {
  const versions = {};
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length) return versions;
  const rows = await strapi.db.query(ORG).findMany({
    where: { documentId: { $in: ids } },
    select: ['id', 'documentId', 'publishedAt'],
  });
  for (const r of rows) {
    const v = versions[r.documentId] || (versions[r.documentId] = { draftId: null, publishedId: null });
    if (r.publishedAt) v.publishedId = r.id;
    else v.draftId = r.id;
  }
  return versions;
};

module.exports = ({ strapi }) => ({
  /** Creates an org for a new garden that has none. Never blocks garden creation. */
  async provisionForGardenCreate(context, next) {
    if (context.uid !== GARDEN || context.action !== 'create') return next();
    const data = context.params?.data;
    if (!data || hasOrganization(data.organization)) return next();

    let org;
    try {
      org = await strapi.documents(ORG).create({ data: { title: data.title }, status: 'published' });
    } catch (err) {
      strapi.log.error(`[billing.coverage] could not auto-create org for new garden: ${err.message}`);
      return next();
    }

    data.organization = org.documentId;
    try {
      return await next();
    } catch (err) {
      try {
        await strapi.documents(ORG).delete({ documentId: org.documentId });
      } catch (e) {
        strapi.log.error(`[billing.coverage] could not remove org ${org.documentId} after failed garden create: ${e.message}`);
      }
      throw err;
    }
  },

  /** Read-only: classifies every garden document by its organization link. */
  async audit() {
    const rows = await strapi.db.query(GARDEN).findMany({
      select: ['id', 'documentId', 'title', 'sms_slug', 'publishedAt'],
      populate: { organization: { select: ['id', 'documentId', 'publishedAt'] } },
      orderBy: { id: 'asc' },
    });
    const summary = { total: 0, noDocumentId: 0 };
    for (const k of CLASSES) summary[k] = 0;

    const byDoc = new Map();
    for (const r of rows) {
      if (!r.documentId) { summary.noDocumentId++; continue; }
      const g = byDoc.get(r.documentId) || { draft: null, published: null };
      if (r.publishedAt) g.published = r; else g.draft = r;
      byDoc.set(r.documentId, g);
    }

    const orgDocIds = [];
    for (const { draft, published } of byDoc.values()) {
      orgDocIds.push(draft?.organization?.documentId, published?.organization?.documentId);
    }
    const orgVersions = await loadOrgVersions(strapi, orgDocIds);

    const gardens = [];
    for (const [documentId, { draft, published }] of byDoc) {
      const draftOrg = draft?.organization?.documentId ?? null;
      const publishedOrg = published?.organization?.documentId ?? null;
      let classification;
      if (!draftOrg && !publishedOrg) classification = 'ORPHAN';
      else if (draftOrg && publishedOrg && draftOrg !== publishedOrg) classification = 'MISMATCH';
      else if (!orgVersions[publishedOrg || draftOrg]?.publishedId) classification = 'ORG_UNPUBLISHED';
      else if (published && !publishedOrg) classification = 'PUBLISHED_UNLINKED';
      else if (draft && !draftOrg) classification = 'DRAFT_UNLINKED';
      else classification = 'OK';
      const src = published || draft;
      gardens.push({
        documentId,
        title: src.title,
        sms_slug: src.sms_slug,
        hasPublished: !!published,
        publishedOrg,
        draftOrg,
        classification,
        draftRowId: draft?.id ?? null,
        publishedRowId: published?.id ?? null,
      });
      summary.total++;
      summary[classification]++;
    }
    return { gardens, summary };
  },

  /**
   * Links gardens that have no organization. Dry run unless apply is true.
   * Writes only the organization relation, via db.query on the specific garden rows
   * (documents().update/publish would publish pending draft edits).
   */
  async backfill({ apply = false, map = {} } = {}) {
    const { gardens } = await this.audit();
    const actions = [];
    const skipped = [];

    const wanted = [];
    for (const g of gardens) {
      wanted.push(g.draftOrg, g.publishedOrg, map[g.documentId]);
    }
    const orgVersions = await loadOrgVersions(strapi, wanted);

    for (const g of gardens) {
      const base = { gardenDocumentId: g.documentId, gardenTitle: g.title };
      const rowsOf = (v) => {
        const links = [];
        if (g.draftRowId != null) links.push({ version: 'draft', gardenRowId: g.draftRowId, orgRowId: v ? v.draftId : null });
        if (g.publishedRowId != null) links.push({ version: 'published', gardenRowId: g.publishedRowId, orgRowId: v ? v.publishedId : null });
        return links;
      };

      // A map entry wins over the garden's classification, so gardens that already
      // have their own org can be consolidated under a shared one.
      const target = map[g.documentId];
      if (target) {
        const v = orgVersions[target];
        if (!v || !v.draftId || !v.publishedId) {
          skipped.push({ gardenDocumentId: g.documentId, organizationDocumentId: target, reason: 'map target org not found or not published' });
          continue;
        }
        const alreadyLinked =
          (g.draftRowId == null || g.draftOrg === target) && (g.publishedRowId == null || g.publishedOrg === target);
        if (alreadyLinked) continue;
        const previousOrgs = [...new Set([g.draftOrg, g.publishedOrg].filter(Boolean))];
        actions.push({
          type: g.classification === 'ORPHAN' ? 'link-mapped-org' : 'repoint-mapped-org',
          ...base,
          organizationDocumentId: target,
          previousOrgs,
          links: rowsOf(v),
        });
        continue;
      }

      if (g.classification === 'ORPHAN') {
        actions.push({ type: 'create-org', ...base, organizationDocumentId: null, links: rowsOf(null) });
      } else if (g.classification === 'PUBLISHED_UNLINKED') {
        const v = orgVersions[g.draftOrg];
        actions.push({
          type: 'link-published-row',
          ...base,
          organizationDocumentId: g.draftOrg,
          links: [{ version: 'published', gardenRowId: g.publishedRowId, orgRowId: v ? v.publishedId : null }],
        });
      } else if (g.classification === 'DRAFT_UNLINKED') {
        const v = orgVersions[g.publishedOrg];
        if (!v || !v.draftId) {
          skipped.push({ gardenDocumentId: g.documentId, organizationDocumentId: g.publishedOrg, reason: 'org has no draft row' });
          continue;
        }
        actions.push({
          type: 'link-draft-row',
          ...base,
          organizationDocumentId: g.publishedOrg,
          links: [{ version: 'draft', gardenRowId: g.draftRowId, orgRowId: v.draftId }],
        });
      }
    }

    // Map entries that name no garden would otherwise be dropped silently.
    const known = new Set(gardens.map((g) => g.documentId));
    for (const [gardenDocumentId, organizationDocumentId] of Object.entries(map)) {
      if (!known.has(gardenDocumentId)) {
        skipped.push({ gardenDocumentId, organizationDocumentId, reason: 'map garden not found' });
      }
    }

    if (apply) {
      for (const action of actions) {
        if (action.type === 'create-org') {
          const org = await strapi.documents(ORG).create({ data: { title: action.gardenTitle }, status: 'published' });
          const v = (await loadOrgVersions(strapi, [org.documentId]))[org.documentId] || {};
          action.organizationDocumentId = org.documentId;
          for (const link of action.links) {
            link.orgRowId = link.version === 'published' ? (v.publishedId ?? null) : (v.draftId ?? null);
          }
        }
        for (const link of action.links) {
          await strapi.db.query(GARDEN).update({ where: { id: link.gardenRowId }, data: { organization: link.orgRowId } });
        }
      }
    }

    return { apply, actions, skipped };
  },
});
