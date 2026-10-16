/**
 * Unit tests for the pure event-brief resolution. No Strapi needed.
 */

const { pure } = require('../../src/api/volunteer-day/services/event-brief');

const { resolveBrief, hasContent, cleanBrief, cleanVisitInfo, STARTER_BRIEFS } = pure;

const templateBrief = {
  id: 7,
  what_to_expect: 'Template paragraph',
  agenda: [{ id: 1, time_text: '9:30', label: 'Coffee', detail: '' }],
  bring_items: [{ id: 2, label: 'Water', provided_by: 'volunteer' }, { id: 3, label: 'Gloves', provided_by: 'garden' }],
  good_for: 'Everyone',
  food: '',
  duration_text: null,
};

describe('event brief: cleanBrief / hasContent', () => {
  it('normalizes a component row: strips ids, turns blanks into null, drops unlabeled items', () => {
    const clean = cleanBrief({
      what_to_expect: '  ',
      agenda: [{ id: 1, label: '' }, { id: 2, label: ' Arrive ', time_text: '', detail: null }],
      bring_items: [{ id: 3, label: 'Hat', provided_by: 'nonsense' }],
    });
    expect(clean).toEqual({
      what_to_expect: null,
      agenda: [{ time_text: null, label: 'Arrive', detail: null }],
      bring_items: [{ label: 'Hat', provided_by: 'volunteer' }],
      good_for: null,
      food: null,
      duration_text: null,
    });
  });

  it('treats null, {} and an all-empty component row as no content', () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent({})).toBe(false);
    expect(hasContent({ id: 4, what_to_expect: '', agenda: [], bring_items: [{ label: ' ' }] })).toBe(false);
  });

  it('a single filled field counts as content', () => {
    expect(hasContent({ food: 'Potluck' })).toBe(true);
    expect(hasContent({ agenda: [{ label: 'Arrive' }] })).toBe(true);
  });
});

describe('event brief: resolveBrief', () => {
  it('falls back to the starter for the event type when neither layer has content', () => {
    const { brief, source } = resolveBrief({ eventBrief: null, templateBrief: { id: 1 }, type: 'workshop' });
    expect(source).toBe('starter');
    expect(brief.what_to_expect).toBe(STARTER_BRIEFS.workshop.what_to_expect);
  });

  it('uses the general starter for a null or unknown type', () => {
    expect(resolveBrief({ type: null }).brief.what_to_expect).toBe(STARTER_BRIEFS.general.what_to_expect);
    expect(resolveBrief({ type: 'mystery' }).brief.what_to_expect).toBe(STARTER_BRIEFS.general.what_to_expect);
  });

  it('uses the template brief as-is when the event has no override, and never mixes in starter fields', () => {
    const { brief, source } = resolveBrief({ eventBrief: null, templateBrief, type: 'general' });
    expect(source).toBe('template');
    expect(brief.what_to_expect).toBe('Template paragraph');
    expect(brief.agenda).toEqual([{ time_text: '9:30', label: 'Coffee', detail: null }]);
    // food was left empty on the template: it stays empty, the starter does not fill it
    expect(brief.food).toBeNull();
  });

  it('event fields override template fields one by one; lists are replaced, not merged', () => {
    const { brief, source } = resolveBrief({
      eventBrief: { food: 'Pizza this time', bring_items: [{ label: 'Shovel', provided_by: 'volunteer' }] },
      templateBrief,
      type: 'general',
    });
    expect(source).toBe('event');
    expect(brief.food).toBe('Pizza this time');
    expect(brief.bring_items).toEqual([{ label: 'Shovel', provided_by: 'volunteer' }]);
    expect(brief.what_to_expect).toBe('Template paragraph');
    expect(brief.agenda).toHaveLength(1);
  });

  it('an event override with no template stands on its own', () => {
    const { brief, source } = resolveBrief({ eventBrief: { good_for: 'Kids' }, templateBrief: null, type: 'general' });
    expect(source).toBe('event');
    expect(brief.good_for).toBe('Kids');
    expect(brief.agenda).toEqual([]);
  });

  it('every starter resolves to the full public shape', () => {
    Object.keys(STARTER_BRIEFS).forEach((type) => {
      const { brief } = resolveBrief({ type });
      expect(Object.keys(brief).sort()).toEqual(
        ['agenda', 'bring_items', 'duration_text', 'food', 'good_for', 'what_to_expect'],
      );
      expect(brief.bring_items.length).toBeGreaterThan(0);
    });
  });
});

describe('event brief: cleanVisitInfo', () => {
  it('returns null when nothing is filled in', () => {
    expect(cleanVisitInfo(null)).toBeNull();
    expect(cleanVisitInfo({ id: 9, meeting_spot: '', restroom: '  ' })).toBeNull();
  });

  it('returns every field, trimmed, without the component id', () => {
    expect(cleanVisitInfo({ id: 9, meeting_spot: ' Front gate ' })).toEqual({
      meeting_spot: 'Front gate',
      meeting_note: null,
      parking_transit: null,
      restroom: null,
      accessibility: null,
      kids_pets: null,
    });
  });
});
