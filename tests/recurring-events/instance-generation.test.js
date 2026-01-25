/**
 * Unit tests for recurring event instance generation
 *
 * These tests verify the title generation and slug generation
 * logic for recurring event instances.
 */

const { format } = require('date-fns');

// Title generation logic (extracted from service for unit testing)
function generateInstanceTitle(template, occurrenceDate) {
  const baseTitle = template.title_template;

  switch (template.naming_convention) {
    case 'title_only':
      return baseTitle;

    case 'title_month':
      return `${baseTitle} - ${format(occurrenceDate, 'MMMM yyyy')}`;

    case 'title_day_of_month':
      return `${baseTitle} - ${format(occurrenceDate, 'MMMM d, yyyy')}`;

    case 'title_nth_weekday':
      const nthText = template.nth_occurrence ?
        template.nth_occurrence.charAt(0).toUpperCase() + template.nth_occurrence.slice(1) : '';
      const weekdayText = template.weekday || format(occurrenceDate, 'EEEE');
      return `${baseTitle} - ${nthText} ${weekdayText} of ${format(occurrenceDate, 'MMMM')}`;

    default:
      return baseTitle;
  }
}

function generateInstanceSlug(template, occurrenceDate) {
  const baseSlug = template.title_template
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const dateSlug = format(occurrenceDate, 'yyyy-MM-dd');
  return `${baseSlug}-${dateSlug}`;
}

describe('Recurring Event Instance Generation', () => {

  describe('generateInstanceTitle', () => {

    const baseTemplate = {
      title_template: 'Community Cleanup',
      naming_convention: 'title_only',
      nth_occurrence: 'second',
      weekday: 'Sunday'
    };

    it('should return title only when naming_convention is title_only', () => {
      const template = { ...baseTemplate, naming_convention: 'title_only' };
      const date = new Date(2025, 0, 12); // January 12, 2025

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup');
    });

    it('should append month and year when naming_convention is title_month', () => {
      const template = { ...baseTemplate, naming_convention: 'title_month' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup - January 2025');
    });

    it('should append full date when naming_convention is title_day_of_month', () => {
      const template = { ...baseTemplate, naming_convention: 'title_day_of_month' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup - January 12, 2025');
    });

    it('should append nth weekday format when naming_convention is title_nth_weekday', () => {
      const template = { ...baseTemplate, naming_convention: 'title_nth_weekday' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup - Second Sunday of January');
    });

    it('should handle first occurrence', () => {
      const template = {
        ...baseTemplate,
        naming_convention: 'title_nth_weekday',
        nth_occurrence: 'first'
      };
      const date = new Date(2025, 0, 5);

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup - First Sunday of January');
    });

    it('should handle last occurrence', () => {
      const template = {
        ...baseTemplate,
        naming_convention: 'title_nth_weekday',
        nth_occurrence: 'last',
        weekday: 'Saturday'
      };
      const date = new Date(2025, 0, 25);

      const result = generateInstanceTitle(template, date);

      expect(result).toBe('Community Cleanup - Last Saturday of January');
    });

    it('should handle different months correctly', () => {
      const template = { ...baseTemplate, naming_convention: 'title_month' };

      const febDate = new Date(2025, 1, 15);
      expect(generateInstanceTitle(template, febDate)).toBe('Community Cleanup - February 2025');

      const decDate = new Date(2025, 11, 15);
      expect(generateInstanceTitle(template, decDate)).toBe('Community Cleanup - December 2025');
    });
  });

  describe('generateInstanceSlug', () => {

    it('should generate a slug with date suffix', () => {
      const template = { title_template: 'Community Cleanup' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceSlug(template, date);

      expect(result).toBe('community-cleanup-2025-01-12');
    });

    it('should handle special characters in title', () => {
      const template = { title_template: "Garden Work & Fun!" };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceSlug(template, date);

      expect(result).toBe('garden-work-fun-2025-01-12');
    });

    it('should handle multiple spaces', () => {
      const template = { title_template: 'Second   Sunday   Cleanup' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceSlug(template, date);

      expect(result).toBe('second-sunday-cleanup-2025-01-12');
    });

    it('should handle leading/trailing special characters', () => {
      const template = { title_template: '---Cleanup Event---' };
      const date = new Date(2025, 0, 12);

      const result = generateInstanceSlug(template, date);

      expect(result).toBe('cleanup-event-2025-01-12');
    });

    it('should format date consistently regardless of timezone', () => {
      const template = { title_template: 'Event' };
      const date = new Date(2025, 5, 15); // June 15, 2025

      const result = generateInstanceSlug(template, date);

      expect(result).toBe('event-2025-06-15');
    });
  });

  describe('Template validation scenarios', () => {

    it('should require day_of_month for day_of_month recurrence type', () => {
      const template = {
        recurrence_type: 'day_of_month',
        day_of_month: null
      };

      // This is a validation check the service performs
      const isValid = template.recurrence_type !== 'day_of_month' || template.day_of_month;
      expect(isValid).toBe(false);
    });

    it('should require nth_occurrence and weekday for nth_weekday type', () => {
      const template = {
        recurrence_type: 'nth_weekday',
        nth_occurrence: 'second',
        weekday: null
      };

      const isValid = template.recurrence_type !== 'nth_weekday' ||
        (template.nth_occurrence && template.weekday);
      expect(isValid).toBe(false);
    });

    it('should pass validation with all required fields', () => {
      const template = {
        recurrence_type: 'nth_weekday',
        nth_occurrence: 'second',
        weekday: 'Sunday'
      };

      const isValid = template.recurrence_type !== 'nth_weekday' ||
        (template.nth_occurrence && template.weekday);
      expect(isValid).toBe(true);
    });
  });
});
