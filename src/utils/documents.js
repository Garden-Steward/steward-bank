'use strict';

/**
 * Strapi v5 draft & publish stores the draft and published versions of an entry
 * as two separate rows sharing one documentId. The query engine returns raw
 * rows, so anything published comes back twice — and the two rows carry
 * different relation links, because a relation resolves to one specific row.
 *
 * Collapse each document down to a single row, preferring the published one so
 * its relations line up with what the REST API hands the front-end.
 * Rows without a documentId (older/hand-inserted data) are always kept.
 *
 * @param {arr} rows raw query-engine rows
 * @returns {arr} one row per document
 */
function dedupeByDocument(rows) {
  const byDocument = new Map();
  const orphans = [];

  for (const row of rows || []) {
    if (!row?.documentId) {
      if (row) {
        orphans.push(row);
      }
      continue;
    }
    const existing = byDocument.get(row.documentId);
    if (!existing || (!existing.publishedAt && row.publishedAt)) {
      byDocument.set(row.documentId, row);
    }
  }

  return [...byDocument.values(), ...orphans];
}

/**
 * The ids of every row that makes up an entity's document, i.e. its draft and
 * its published version.
 *
 * A relation stored against one of those rows does not match a filter written
 * against the other, so anything matching entities up by relation id has to ask
 * for all of them. Falls back to the row it was handed when there is no
 * documentId to look up.
 *
 * @param {string} uid content-type uid, e.g. 'api::garden.garden'
 * @param {obj} entity a row of the document
 * @returns {arr} row ids
 */
async function documentRowIds(uid, entity) {
  if (!entity?.id) {
    return [];
  }
  if (!entity.documentId) {
    return [entity.id];
  }

  const rows = await strapi.db.query(uid).findMany({
    where: { documentId: entity.documentId },
    select: ['id'],
  });

  return rows?.length ? rows.map((row) => row.id) : [entity.id];
}

/**
 * Give a published-only document the draft row v5 expects it to have.
 *
 * Rows inserted with `strapi.db.query().create({ publishedAt })` exist only as
 * a published row. A REST/document-service update edits the draft and then
 * re-publishes by deleting the published row and cloning the draft — so with no
 * draft to clone, the new published row comes out with every relation empty
 * (garden, hero image, RSVPs...) and a new numeric id. discardDraft() builds the
 * draft from the published row, relations included, so run it first.
 *
 * @param {string} uid content-type uid
 * @param {string} documentId
 * @returns {bool} true when a draft had to be created
 */
async function ensureDraft(uid, documentId) {
  if (!documentId) {
    return false;
  }
  const rows = await strapi.db.query(uid).findMany({
    where: { documentId },
    select: ['id', 'publishedAt'],
  });
  const hasPublished = rows.some((row) => row.publishedAt);
  const hasDraft = rows.some((row) => !row.publishedAt);
  if (!hasPublished || hasDraft) {
    return false;
  }
  await strapi.documents(uid).discardDraft({ documentId });
  return true;
}

/**
 * ensureDraft() for every published-only document of a content type.
 *
 * @param {string} uid content-type uid
 * @returns {number} drafts created
 */
async function backfillDrafts(uid) {
  const rows = await strapi.db.query(uid).findMany({ select: ['documentId', 'publishedAt'] });
  const published = new Set();
  const drafted = new Set();
  for (const row of rows) {
    if (!row.documentId) continue;
    (row.publishedAt ? published : drafted).add(row.documentId);
  }

  let created = 0;
  for (const documentId of published) {
    if (drafted.has(documentId)) continue;
    try {
      await strapi.documents(uid).discardDraft({ documentId });
      created += 1;
    } catch (err) {
      strapi.log.error(`[backfillDrafts] ${uid} ${documentId}: ${err.message}`);
    }
  }
  return created;
}

module.exports = { dedupeByDocument, documentRowIds, ensureDraft, backfillDrafts };
