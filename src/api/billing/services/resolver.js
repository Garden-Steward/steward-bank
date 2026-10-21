'use strict';

/**
 * Attribution resolver: turns whatever a send site has in hand (a garden, a task, an event,
 * a user) into { gardenDocumentId, organizationDocumentId } for the SMS ledger.
 *
 * Never rejects: any failure logs and resolves nulls, so a metering problem can't block a send.
 */

const TTL_MS = 5 * 60 * 1000;
const NULLS = () => ({ gardenDocumentId: null, organizationDocumentId: null });

// Module state, shared across every lookup of the service.
const orgByGardenDoc = new Map(); // gardenDocumentId -> { value: orgDocId|null, expiresAt }
const docByGardenRow = new Map(); // garden row id (number) -> { value: gardenDocumentId, expiresAt }

const cacheGet = (map, key) => {
  const hit = map.get(key);
  return hit && Date.now() < hit.expiresAt ? hit : null;
};
const cacheSet = (map, key, value) => map.set(key, { value, expiresAt: Date.now() + TTL_MS });

// A reference "yields" when it carries a value at all.
const yields = (v) => v !== undefined && v !== null && v !== false && v !== '';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

module.exports = ({ strapi }) => {
  // Garden reference held by `holder[key]`. A partially loaded holder (key absent) is
  // lazy-loaded by id; a key that is present but empty means "no garden here".
  const gardenRefFrom = async (holder, key, uid) => {
    if (!holder || typeof holder !== 'object') return undefined;
    if (hasOwn(holder, key)) return yields(holder[key]) ? holder[key] : undefined;
    if (holder.id == null) return undefined;
    const row = await strapi.db.query(uid).findOne({
      where: { id: holder.id },
      select: ['id'],
      populate: { [key]: { select: ['id', 'documentId'] } },
    });
    return row ? row[key] : undefined;
  };

  const pickGardenRef = async ({ garden, user, task, event }) => {
    if (yields(garden)) return garden;
    let ref = await gardenRefFrom(task, 'garden', 'api::garden-task.garden-task');
    if (yields(ref)) return ref;
    ref = await gardenRefFrom(event, 'garden', 'api::volunteer-day.volunteer-day');
    if (yields(ref)) return ref;
    ref = await gardenRefFrom(user, 'activeGarden', 'plugin::users-permissions.user');
    return yields(ref) ? ref : undefined;
  };

  const gardenDocumentIdFor = async (ref) => {
    let rowId = null;
    if (ref && typeof ref === 'object') {
      if (ref.documentId) return ref.documentId;
      if (ref.id == null) return null;
      rowId = Number(ref.id);
    } else if (typeof ref === 'number') {
      rowId = ref;
    } else if (typeof ref === 'string') {
      if (!/^\d+$/.test(ref)) return ref; // already a documentId
      rowId = Number(ref);
    } else {
      return null;
    }

    const cached = cacheGet(docByGardenRow, rowId);
    if (cached) return cached.value;
    const row = await strapi.db.query('api::garden.garden').findOne({
      where: { id: rowId },
      select: ['documentId'],
    });
    if (!row || !row.documentId) return null;
    cacheSet(docByGardenRow, rowId, row.documentId);
    return row.documentId;
  };

  const organizationDocumentIdFor = async (gardenDocumentId) => {
    const cached = cacheGet(orgByGardenDoc, gardenDocumentId);
    if (cached) return cached.value;
    const rows = await strapi.db.query('api::garden.garden').findMany({
      where: { documentId: gardenDocumentId },
      select: ['id', 'documentId', 'publishedAt'],
      populate: { organization: { select: ['documentId'] } },
    });
    const published = rows.find((r) => r.publishedAt);
    const draft = rows.find((r) => !r.publishedAt);
    const org = (published && published.organization && published.organization.documentId)
      || (draft && draft.organization && draft.organization.documentId)
      || null;
    cacheSet(orgByGardenDoc, gardenDocumentId, org);
    return org;
  };

  return {
    async resolveContext({ garden, user, task, event } = {}) {
      try {
        const ref = await pickGardenRef({ garden, user, task, event });
        if (!yields(ref)) return NULLS();
        const gardenDocumentId = await gardenDocumentIdFor(ref);
        if (!gardenDocumentId) return NULLS();
        const organizationDocumentId = await organizationDocumentIdFor(gardenDocumentId);
        return { gardenDocumentId, organizationDocumentId };
      } catch (err) {
        strapi.log.error('[billing.resolver] ' + err.message);
        return NULLS();
      }
    },

    clearCache() {
      orgByGardenDoc.clear();
      docByGardenRow.clear();
    },
  };
};
