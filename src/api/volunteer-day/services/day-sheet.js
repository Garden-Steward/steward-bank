'use strict';

/**
 * Assembly service for the printable volunteer day sheet. Single source of
 * truth for both the JSON endpoint and the printable HTML endpoint (Task 6) —
 * both call `assemble()` and nothing else, so the two responses can never
 * drift from each other.
 *
 * All DB access for this feature lives here. The pure renderer in
 * `day-sheet-render.js` never touches `strapi`.
 */

const { renderDaySheetHtml } = require('./day-sheet-render');

const STANDING_UID = 'api::day-sheet-standing-task.day-sheet-standing-task';

const paramError = (message) => Object.assign(new Error(message), { sheetParamError: true });

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Shared plumbing for `exclude` and `hideTasks`: repeated query params are
 * concatenated before splitting, an absent/empty value means "nothing",
 * every token must match `pattern`, and the result is deduped (order
 * preserved) and capped at 30 entries.
 */
function parseTokenList(raw, pattern, message) {
  if (raw === undefined) return [];

  let joined;
  if (typeof raw === 'string') {
    joined = raw;
  } else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    joined = raw.join(',');
  } else {
    // Nested/object query form, e.g. exclude[a]=b — not a string, not a string array.
    throw paramError(message);
  }

  const trimmed = joined.trim();
  if (trimmed === '') return [];

  const tokens = trimmed.split(',');
  const seen = new Set();
  const result = [];
  tokens.forEach((token) => {
    if (!pattern.test(token)) throw paramError(message);
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  });

  if (result.length > 30) throw paramError(message);
  return result;
}

function parseExcludeParam(raw) {
  return parseTokenList(raw, /^[0-9a-f]{8}$/, 'Invalid exclude parameter');
}

function parseHideTasksParam(raw) {
  return parseTokenList(raw, /^[0-9]{1,9}$/, 'Invalid hideTasks parameter').map(Number);
}

function parseExtraParam(raw) {
  const message = 'Invalid extra parameter';
  if (raw === undefined) return [];

  let entries;
  if (typeof raw === 'string') {
    entries = [raw];
  } else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    entries = raw;
  } else {
    // Nested/object query form, e.g. extra[a]=b — not a string, not a string array.
    throw paramError(message);
  }

  if (entries.length > 5) throw paramError(message);

  const result = [];
  let combinedLength = 0;
  entries.forEach((entry) => {
    const cleaned = entry.replace(CONTROL_CHARS, '').trim();
    if (cleaned === '') return; // dropped, not an error
    if (cleaned.length > 120) throw paramError(message);
    combinedLength += cleaned.length;
    result.push(cleaned);
  });

  if (combinedLength > 400) throw paramError(message);
  return result;
}

module.exports = ({ strapi }) => ({
  /**
   * Resolve an event by its NUMERIC id, matching `getById`'s precedent.
   * Returns null when there is no such row; the controller 404s.
   */
  async resolveEvent(eventId) {
    return strapi.db.query('api::volunteer-day.volunteer-day').findOne({
      where: { id: eventId },
      populate: { garden: true },
    });
  },

  /**
   * D2a — the sharp edge. `garden-task` has draftAndPublish: true, so a
   * single logical task can exist as a draft row and a published row with
   * the same documentId. Walking the event's tasks relation off whichever
   * event row the numeric id happened to hit under- or over-reports, so
   * instead: pull every row (draft + published) for every event row sharing
   * this event's documentId, then dedupe by task documentId, preferring the
   * published row (falling back to the draft when only a draft exists, and
   * to the lower numeric id when both/neither are published).
   */
  async loadTasks(event) {
    const eventRows = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: { documentId: event.documentId },
      select: ['id'],
    });

    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
          where: {
            volunteer_day: { id: { $in: eventRows.map((r) => r.id) } },
            recurring_task: { $null: true },
          },
          populate: { volunteers: { select: ['id'] } },
        });

    return this.dedupeByDocumentId(tasks);
  },

  /**
   * Collapse rows sharing a documentId to one, preferring the published row,
   * falling back to the draft when only a draft exists, and to the lower
   * numeric id when both or neither are published.
   */
  dedupeByDocumentId(tasks) {
    const byDocumentId = new Map();
    tasks.forEach((task) => {
      const existing = byDocumentId.get(task.documentId);
      if (!existing) {
        byDocumentId.set(task.documentId, task);
        return;
      }
      const incomingPublished = task.publishedAt != null;
      const existingPublished = existing.publishedAt != null;
      if (incomingPublished === existingPublished) {
        if (task.id < existing.id) byDocumentId.set(task.documentId, task);
      } else if (incomingPublished) {
        byDocumentId.set(task.documentId, task);
      }
      // else: incoming is an unpublished draft and the stored row is already
      // published — keep the stored (published) row.
    });

    return Array.from(byDocumentId.values());
  },

  /**
   * High=0, Normal=1, Low=2 (null/unknown -> 1), tie-broken on ascending
   * numeric id. Deterministic; does not rely on relation populate order.
   * Returns a new array; does not mutate the input.
   */
  sortTasks(tasks) {
    const rank = { High: 0, Normal: 1, Low: 2 };
    return [...tasks].sort((a, b) => {
      const rankA = rank[a.priority] ?? 1;
      const rankB = rank[b.priority] ?? 1;
      if (rankA !== rankB) return rankA - rankB;
      return a.id - b.id;
    });
  },

  /**
   * Builds the `data` object shared by the JSON and HTML endpoints.
   * `standing` and `tasks` are always the FULL lists — never pre-filtered by
   * `excludeKeys` / `hiddenTaskIds`; the renderer applies those. Returns
   * null when `resolveEvent` returns falsy (the controller 404s).
   */
  async assemble(eventId, { excludeKeys = [], extras = [], hiddenTaskIds = [] } = {}) {
    const event = await this.resolveEvent(eventId);
    if (!event) return null;

    const rawTasks = await this.loadTasks(event);

    return this.buildPayload({
      header: {
        id: event.id,
        documentId: event.documentId,
        title: event.title,
        startDatetime: event.startDatetime,
        canceled: event.canceled === true,
        garden: event.garden,
      },
      rawTasks,
      anchor: 'event',
      printPath: `/api/volunteer-days/by-id/${event.id}/day-sheet.html`,
      excludeKeys,
      extras,
      hiddenTaskIds,
    });
  },

  /**
   * Resolve a garden by slug. Returns null when there is no such row; the
   * controller 404s.
   */
  async resolveGarden(slug) {
    return strapi.db.query('api::garden.garden').findOne({ where: { slug } });
  },

  /**
   * Every task a garden currently has open, regardless of which volunteer day
   * it hangs off — this is what the public tasks page shows, so it is what its
   * print button has to produce.
   *
   * The same draft/publish dedupe as `loadTasks` applies: a task can exist as
   * two rows sharing a documentId, and counting it twice would print it twice.
   * Statuses that mean the work is over are dropped rather than printed with a
   * line through them.
   */
  async loadGardenTasks(garden) {
    const gardenRows = await strapi.db.query('api::garden.garden').findMany({
      where: { documentId: garden.documentId },
      select: ['id'],
    });

    const tasks = await strapi.db.query('api::garden-task.garden-task').findMany({
          where: {
            garden: { id: { $in: gardenRows.map((r) => r.id) } },
            recurring_task: { $null: true },
          },
          populate: { volunteers: { select: ['id'] } },
        });

    const done = ['FINISHED', 'ABANDONED', 'SKIPPED'];
    return this.dedupeByDocumentId(
      tasks.filter((t) => !done.includes(String(t.status || '').toUpperCase()))
    );
  },

  /**
   * The garden-anchored sheet. Same standing list, same ordering, same
   * renderer as the event sheet — only the task source and the header differ.
   */
  async assembleForGarden(slug, { excludeKeys = [], extras = [], hiddenTaskIds = [] } = {}) {
    const garden = await this.resolveGarden(slug);
    if (!garden) return null;

    const rawTasks = await this.loadGardenTasks(garden);

    return this.buildPayload({
      header: {
        id: null,
        documentId: garden.documentId,
        // The garden's name is the heading; the renderer drops the subtitle
        // when it would just repeat it.
        title: garden.title,
        startDatetime: null,
        canceled: false,
        garden,
      },
      rawTasks,
      anchor: 'garden',
      printPath: `/api/gardens/${garden.slug}/day-sheet.html`,
      excludeKeys,
      extras,
      hiddenTaskIds,
    });
  },

  /**
   * Shared shaping for both anchors. `standing` and `tasks` are always the FULL
   * lists — never pre-filtered by `excludeKeys` / `hiddenTaskIds`; the renderer
   * applies those.
   */
  async buildPayload({ header, rawTasks, anchor, printPath, excludeKeys, extras, hiddenTaskIds }) {
    const sortedTasks = this.sortTasks(rawTasks);

    // Resolved from the sheet's garden, so a manager editing their garden's
    // checklist changes what that garden prints and nothing else. Falls back to
    // the legacy org-wide list, then the built-in defaults.
    const { items: standing, source: standingSource } = await strapi
      .service(STANDING_UID)
      .getListForGarden(header.garden);

    // PII (D2b): volunteers is populated solely to count it and is never
    // spread into the payload. Every field is built explicitly — no raw
    // task/event spread — so no volunteer identity or contact info can leak
    // through here.
    const tasks = sortedTasks.map((t) => ({
      id: t.id,
      documentId: t.documentId,
      title: t.title,
      priority: ['High', 'Normal', 'Low'].includes(t.priority) ? t.priority : 'Normal',
      type: t.type ?? null,
      status: t.status ?? null,
      overview: t.overview ?? null,
      volunteer_count: Array.isArray(t.volunteers) ? t.volunteers.length : 0,
      max_volunteers: typeof t.max_volunteers === 'number' ? t.max_volunteers : null,
    }));

    const garden = header.garden
      ? {
        id: header.garden.id,
        documentId: header.garden.documentId,
        title: header.garden.title,
        slug: header.garden.slug,
      }
      : null;

    return {
      event: {
        id: header.id,
        documentId: header.documentId,
        title: header.title,
        startDatetime: header.startDatetime,
        canceled: header.canceled,
        garden,
      },
      standing,
      tasks,
      excludedKeys: excludeKeys,
      hiddenTaskIds,
      extras,
      meta: {
        anchor,
        standingSource,
        standingCount: standing.length,
        taskCount: tasks.length,
        generatedAt: new Date().toISOString(),
        printPath,
      },
    };
  },

  /** Thin wrapper over the pure renderer — nothing else. */
  renderHtml(sheet) {
    return renderDaySheetHtml(sheet);
  },

  /**
   * The one shared param validator for both endpoints. Returns
   * { excludeKeys, extras, hiddenTaskIds }, all normalized (deduped,
   * trimmed, order-preserving), or throws a tagged error whose message is
   * exactly one of 'Invalid exclude parameter' / 'Invalid extra parameter' /
   * 'Invalid hideTasks parameter' — never any part of the input. Validated
   * in that order so behaviour is deterministic when more than one param is
   * bad.
   */
  parseSheetParams(query) {
    const q = query || {};
    const excludeKeys = parseExcludeParam(q.exclude);
    const extras = parseExtraParam(q.extra);
    const hiddenTaskIds = parseHideTasksParam(q.hideTasks);
    return { excludeKeys, extras, hiddenTaskIds };
  },
});
