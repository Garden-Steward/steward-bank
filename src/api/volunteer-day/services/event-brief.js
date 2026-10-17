'use strict';

/**
 * Event brief: what to expect at an event, how the day goes, what to bring.
 *
 * Three layers, resolved at READ time (never copied onto generated events, so
 * editing a template's brief reaches every future event it already made):
 *
 *   1. the event's own `brief`     — optional override, field by field
 *   2. its recurring template's `brief`
 *   3. a Garden Steward starter for the event `type` — only when neither of
 *      the above has anything in it, so a garden's deliberate choices are
 *      never mixed with generic defaults
 *
 * Garden-wide logistics (meeting spot, parking, restroom, accessibility) are
 * NOT part of the brief: they live on `garden.visit_info` because they are
 * true of every event at that garden, recurring or not.
 *
 * Everything here except `loadSeries` is pure, so it is unit-testable without
 * a database.
 */

const TEXT_FIELDS = ['what_to_expect', 'good_for', 'food', 'duration_text'];
const LIST_FIELDS = ['agenda', 'bring_items'];
const BRIEF_FIELDS = [...TEXT_FIELDS, ...LIST_FIELDS];

const VISIT_FIELDS = ['meeting_spot', 'meeting_note', 'parking_transit', 'restroom', 'accessibility', 'kids_pets'];

const bring = (label) => ({ label, provided_by: 'volunteer' });
const provided = (label) => ({ label, provided_by: 'garden' });
const step = (label, detail = null) => ({ time_text: null, label, detail });

const WORKDAY_STARTER = {
  what_to_expect: 'No experience needed. We start together, split into small crews with someone who knows the job, and finish together. Come for an hour or stay the whole time.',
  agenda: [
    step('Arrive and meet the crew', "Names, a quick look around, and what we're working on today."),
    step('Work in small crews', 'Pick a job and switch whenever you like.'),
    step('Close together', 'A few minutes to see what got done.'),
  ],
  bring_items: [
    bring('Water bottle'),
    bring('Sun hat and sunscreen'),
    bring('Closed-toe shoes that can get muddy'),
    provided('Gloves'),
    provided('Tools'),
  ],
  good_for: 'All skill levels',
  food: null,
  duration_text: null,
};

// Keyed by volunteer-day `type`. A null or unknown type gets the workday.
const STARTER_BRIEFS = {
  general: WORKDAY_STARTER,
  land_work: WORKDAY_STARTER,
  cleanup: {
    ...WORKDAY_STARTER,
    what_to_expect: 'We spread out in small groups and leave the place better than we found it. No experience needed.',
    bring_items: [
      bring('Water bottle'),
      bring('Closed-toe shoes'),
      bring('Clothes that can get dirty'),
      provided('Gloves'),
      provided('Bags'),
    ],
  },
  art: {
    ...WORKDAY_STARTER,
    what_to_expect: 'Making something together for the garden. No art experience needed.',
    agenda: [
      step('Arrive and see the plan'),
      step('Make it together', 'Everyone gets a piece of the work.'),
      step('Step back and look'),
    ],
    bring_items: [
      bring('Clothes that can get paint on them'),
      bring('Water bottle'),
      provided('Art supplies'),
    ],
  },
  workshop: {
    ...WORKDAY_STARTER,
    what_to_expect: 'A hands-on session: a short demonstration, then time to try it yourself, with room for questions.',
    agenda: [
      step('Welcome and introductions'),
      step('Demonstration'),
      step('Try it yourself'),
      step('Questions and wrap-up'),
    ],
    bring_items: [
      bring('Something to take notes with'),
      bring('Water bottle'),
      provided('Materials for the session'),
    ],
  },
};

const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

const cleanText = (v) => (isBlank(v) ? null : String(v).trim());

const cleanAgenda = (items) => (Array.isArray(items) ? items : [])
  .filter((i) => i && !isBlank(i.label))
  .map((i) => ({ time_text: cleanText(i.time_text), label: cleanText(i.label), detail: cleanText(i.detail) }));

const cleanBring = (items) => (Array.isArray(items) ? items : [])
  .filter((i) => i && !isBlank(i.label))
  .map((i) => ({ label: cleanText(i.label), provided_by: i.provided_by === 'garden' ? 'garden' : 'volunteer' }));

/**
 * Normalize a brief component row (as db.query returns it: with `id`s and
 * possibly empty strings or empty repeatables) into the public shape.
 * Always returns every field; empties are null / [].
 */
function cleanBrief(brief) {
  const b = brief || {};
  return {
    what_to_expect: cleanText(b.what_to_expect),
    agenda: cleanAgenda(b.agenda),
    bring_items: cleanBring(b.bring_items),
    good_for: cleanText(b.good_for),
    food: cleanText(b.food),
    duration_text: cleanText(b.duration_text),
  };
}

const fieldHasContent = (brief, field) => (LIST_FIELDS.includes(field)
  ? brief[field].length > 0
  : brief[field] != null);

/** True when a (cleaned or raw) brief has at least one non-empty field. */
function hasContent(brief) {
  if (!brief) return false;
  const clean = cleanBrief(brief);
  return BRIEF_FIELDS.some((f) => fieldHasContent(clean, f));
}

/**
 * Field-by-field overlay: a non-empty field in `top` replaces the same field
 * in `base` wholesale (lists are replaced, never concatenated).
 */
function overlay(base, top) {
  const b = cleanBrief(base);
  const t = cleanBrief(top);
  const out = {};
  BRIEF_FIELDS.forEach((f) => {
    out[f] = fieldHasContent(t, f) ? t[f] : b[f];
  });
  return out;
}

function starterFor(type) {
  return cleanBrief(STARTER_BRIEFS[type] || STARTER_BRIEFS.general);
}

/**
 * @returns {{ brief: object, source: 'event'|'template'|'starter' }}
 */
function resolveBrief({ eventBrief, templateBrief, type }) {
  const eventHas = hasContent(eventBrief);
  const templateHas = hasContent(templateBrief);

  if (!eventHas && !templateHas) {
    return { brief: starterFor(type), source: 'starter' };
  }
  return {
    brief: overlay(templateHas ? templateBrief : null, eventHas ? eventBrief : null),
    source: eventHas ? 'event' : 'template',
  };
}

/** Public shape of a garden's visit info, or null when nothing is filled in. */
function cleanVisitInfo(visitInfo) {
  if (!visitInfo) return null;
  const out = {};
  VISIT_FIELDS.forEach((f) => { out[f] = cleanText(visitInfo[f]); });
  return VISIT_FIELDS.some((f) => out[f] != null) ? out : null;
}

const SERIES_FIELDS = ['id', 'documentId', 'title', 'startDatetime'];

module.exports = ({ strapi }) => ({
  STARTER_BRIEFS,
  cleanBrief,
  hasContent,
  overlay,
  starterFor,
  resolveBrief,
  cleanVisitInfo,

  /**
   * Other events from the same recurring template: the next few upcoming ones,
   * and the most recent earlier one that has photos (for a "last time" recap).
   *
   * Matches the template by documentId, not numeric id: the template is
   * draft/publish, so instances may point at either of its rows. Only
   * published, live (not canceled or disabled) instances count.
   *
   * @returns {Promise<{ upcoming: object[], previous: object|null } | null>}
   *          null when the event is not from a template.
   */
  async loadSeries(event, { upcomingLimit = 3, lookback = 6 } = {}) {
    const templateDocumentId = event?.recurring_template?.documentId;
    if (!templateDocumentId || !event.startDatetime) return null;

    const base = {
      recurring_template: { documentId: templateDocumentId },
      publishedAt: { $notNull: true },
      canceled: false,
      disabled: false,
    };

    const upcoming = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: { ...base, startDatetime: { $gt: event.startDatetime } },
      select: SERIES_FIELDS,
      orderBy: { startDatetime: 'asc' },
      limit: upcomingLimit,
    });

    const earlier = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: { ...base, startDatetime: { $lt: event.startDatetime } },
      select: [...SERIES_FIELDS, 'photo_album_url'],
      populate: { featured_gallery: true },
      orderBy: { startDatetime: 'desc' },
      limit: lookback,
    });

    const previous = earlier.find((e) => (Array.isArray(e.featured_gallery) && e.featured_gallery.length > 0)
      || !isBlank(e.photo_album_url)) || null;

    return { upcoming, previous };
  },
});

// Exported for unit tests that run without a Strapi instance.
module.exports.pure = {
  STARTER_BRIEFS, cleanBrief, hasContent, overlay, starterFor, resolveBrief, cleanVisitInfo,
};
