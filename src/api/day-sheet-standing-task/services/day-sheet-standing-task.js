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
    const raw = Array.isArray(row?.standing_tasks) ? row.standing_tasks : [];
    const items = raw
      .filter((i) => typeof i?.title === 'string' && i.title.trim() !== '')
      .map((i) => ({
        key: this.computeKey(i.title),
        title: i.title,
        note: (typeof i.note === 'string' && i.note !== '') ? i.note : null,
      }));
    if (items.length === 0) {
      return {
        items: DEFAULT_STANDING_TASKS.map((i) => ({ key: this.computeKey(i.title), title: i.title, note: null })),
        source: 'default',
      };
    }
    return { items, source: 'single-type' };
  },

  async replaceList(items) {
    if (!Array.isArray(items)) throw err('standing_tasks must be an array');
    if (items.length > 30) throw err('standing_tasks may contain at most 30 items');

    const cleaned = items.map((item, n) => {
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

    const row = await strapi.documents(UID).findFirst();
    if (!row) {
      await strapi.documents(UID).create({ data: { standing_tasks: cleaned } });
    } else {
      await strapi.documents(UID).update({ documentId: row.documentId, data: { standing_tasks: cleaned } });
    }
    return this.getList();
  },
}));
