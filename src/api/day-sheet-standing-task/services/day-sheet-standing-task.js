'use strict';
const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::day-sheet-standing-task.day-sheet-standing-task';

// The five hardcoded lines a fresh garden sees before any manager curates the list.
const DEFAULT_STANDING_TASKS = [
  { title: 'Start a fire in the cob oven', note: null },
  { title: 'Weed pathways', note: null },
  { title: 'Find what needs harvesting and make harvest bundles', note: null },
  { title: 'Clear trash from the triangle garden area', note: null },
  { title: 'Prune back or pull out dead growth', note: null },
];

const err = (message) => Object.assign(new Error(message), { standingValidationError: true });

module.exports = createCoreService(UID, ({ strapi }) => ({
  // Exposed off the service object (not off the module) so tests can read it
  // via strapi.service(UID).DEFAULT_STANDING_TASKS.
  DEFAULT_STANDING_TASKS,

  /**
   * Content-derived key, deliberately not index- or row-id-derived: reordering
   * the list doesn't shift which row an exclusion refers to, deleting a row
   * makes its key stop matching, and editing a title makes the old key stop
   * matching so the row prints again (fail-safe direction).
   */
  computeKey(title) {
    const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  },

  async getList() {
    const row = await strapi.documents(UID).findFirst({ populate: { standing_tasks: true } });
    const items = this.toItems(row?.standing_tasks);
    if (items.length === 0) {
      return {
        items: DEFAULT_STANDING_TASKS.map((i) => ({ key: this.computeKey(i.title), title: i.title, note: null })),
        source: 'default',
      };
    }
    return { items, source: 'single-type' };
  },

  /**
   * Shared validation for every write path. Throws a tagged error the
   * controllers turn into a 400. Never echoes submitted text back, since these
   * messages reach the caller.
   */
  validateItems(items) {
    if (!Array.isArray(items)) throw err('standing_tasks must be an array');
    if (items.length > 30) throw err('standing_tasks may contain at most 30 items');

    return items.map((item, n) => {
      const rawTitle = item?.title;
      if (typeof rawTitle !== 'string') throw err('Item ' + n + ': title is required');
      const title = rawTitle
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (title.length === 0) throw err('Item ' + n + ': title is required');
      if (title.length > 120) throw err('Item ' + n + ': title must be 120 characters or fewer');

      const rawNote = item?.note;
      let note = null;
      if (rawNote !== null && rawNote !== undefined && rawNote !== '') {
        if (typeof rawNote !== 'string') throw err('Item ' + n + ': note must be a string');
        note = rawNote.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
        if (note.length > 500) throw err('Item ' + n + ': note must be 500 characters or fewer');
      }

      return { title, note };
    });
  },

  /** Shape stored component rows into the {key,title,note} the sheet prints. */
  toItems(raw) {
    return (Array.isArray(raw) ? raw : [])
      .filter((i) => typeof i?.title === 'string' && i.title.trim() !== '')
      .map((i) => ({
        key: this.computeKey(i.title),
        title: i.title,
        note: (typeof i.note === 'string' && i.note !== '') ? i.note : null,
      }));
  },

  /**
   * The list a given garden prints, resolved in order of specificity:
   *
   *   1. the garden's own list, once a manager has saved one
   *   2. the legacy org-wide list, so gardens that predate per-garden lists
   *      keep printing exactly what they printed before
   *   3. the five built-in defaults, so a brand new garden still prints
   *      something useful
   *
   * Step 2 is what makes this migration invisible: nothing changes for an
   * existing garden until someone edits it, and that first save is what moves
   * the list from shared to owned.
   */
  async getListForGarden(garden) {
    if (garden) {
      // Garden has draft/publish on, so it can exist as two rows sharing a
      // documentId. Read across both, preferring the DRAFT: that is the row the
      // Documents API writes, so it always holds the newest edit. Unlike tasks,
      // where the published row wins, publishing is not part of this flow.
      const rows = await strapi.db.query('api::garden.garden').findMany({
        where: { documentId: garden.documentId },
        populate: { standing_tasks: true },
      });
      const preferred = rows.find((r) => r.publishedAt == null) || rows[0];
      const items = this.toItems(preferred?.standing_tasks);
      if (items.length > 0) return { items, source: 'garden' };
    }
    return this.getList();
  },

  /** Replace one garden's list wholesale. Order is the order it prints. */
  async replaceListForGarden(garden, items) {
    const cleaned = this.validateItems(items);
    // The Documents API, not db.query: the low-level layer expects component
    // ids rather than objects and rejects a fresh array outright.
    //
    // Deliberately no publish() here. Publishing a garden validates the whole
    // record, so a garden missing an unrelated required field — sms_slug, say —
    // would fail, and editing a checklist has no business being blocked by that.
    // The read above prefers the draft for exactly this reason.
    await strapi.documents('api::garden.garden').update({
      documentId: garden.documentId,
      data: { standing_tasks: cleaned },
    });
    return this.getListForGarden(garden);
  },

  async replaceList(items) {
    const cleaned = this.validateItems(items);
    const row = await strapi.documents(UID).findFirst();
    if (!row) {
      await strapi.documents(UID).create({ data: { standing_tasks: cleaned } });
    } else {
      await strapi.documents(UID).update({ documentId: row.documentId, data: { standing_tasks: cleaned } });
    }
    return this.getList();
  },
}));
