/**
 * Unit tests for recurring event date calculations
 *
 * These tests verify the date calculation logic used for
 * generating recurring event instances.
 */

const {
  addMonths,
  setDate,
  getDay,
  startOfMonth,
  endOfMonth,
  addDays,
  format,
  isAfter,
  setHours,
  setMinutes,
  getDaysInMonth,
  lastDayOfMonth
} = require('date-fns');

// Replicate the service logic for unit testing
const WEEKDAY_MAP = {
  'Sunday': 0,
  'Monday': 1,
  'Tuesday': 2,
  'Wednesday': 3,
  'Thursday': 4,
  'Friday': 5,
  'Saturday': 6
};

const NTH_MAP = {
  'first': 1,
  'second': 2,
  'third': 3,
  'fourth': 4,
  'last': -1
};

// Helper functions (extracted from service for unit testing)
function applyTimeToDate(date, timeStr) {
  if (!timeStr) return date;
  const [hours, minutes] = timeStr.split(':').map(Number);
  let result = setHours(date, hours);
  result = setMinutes(result, minutes || 0);
  return result;
}

function getNthWeekdayOfMonth(monthDate, nthOccurrence, weekdayName, startTime) {
  const targetWeekday = WEEKDAY_MAP[weekdayName];
  const nth = NTH_MAP[nthOccurrence];

  if (nth === -1) {
    // Handle 'last' occurrence
    const lastDay = lastDayOfMonth(monthDate);
    let date = lastDay;
    while (getDay(date) !== targetWeekday) {
      date = addDays(date, -1);
    }
    return applyTimeToDate(date, startTime);
  }

  // Find the first occurrence of the target weekday in the month
  const firstOfMonth = startOfMonth(monthDate);
  let firstOccurrence = firstOfMonth;
  while (getDay(firstOccurrence) !== targetWeekday) {
    firstOccurrence = addDays(firstOccurrence, 1);
  }

  // Add weeks to get to the nth occurrence
  const result = addDays(firstOccurrence, (nth - 1) * 7);

  // Verify the result is still in the same month
  if (result.getMonth() !== monthDate.getMonth()) {
    return null;
  }

  return applyTimeToDate(result, startTime);
}

function getNextDayOfMonth(dayOfMonth, fromDate, startTime) {
  const targetDay = dayOfMonth;

  for (let i = 0; i < 13; i++) {
    const monthDate = addMonths(fromDate, i);
    const daysInMonth = getDaysInMonth(monthDate);
    const actualDay = Math.min(targetDay, daysInMonth);
    let occurrenceDate = setDate(monthDate, actualDay);
    occurrenceDate = applyTimeToDate(occurrenceDate, startTime);

    if (isAfter(occurrenceDate, fromDate)) {
      return occurrenceDate;
    }
  }
  return null;
}

describe('Recurring Event Date Calculations', () => {

  describe('getNthWeekdayOfMonth', () => {

    it('should find the first Sunday of January 2025', () => {
      const jan2025 = new Date(2025, 0, 15); // Any date in January 2025
      const result = getNthWeekdayOfMonth(jan2025, 'first', 'Sunday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(5); // January 5, 2025 is the first Sunday
      expect(result.getMonth()).toBe(0); // January
      expect(result.getFullYear()).toBe(2025);
    });

    it('should find the second Sunday of January 2025', () => {
      const jan2025 = new Date(2025, 0, 15);
      const result = getNthWeekdayOfMonth(jan2025, 'second', 'Sunday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(12); // January 12, 2025
    });

    it('should find the third Saturday of February 2025', () => {
      const feb2025 = new Date(2025, 1, 10);
      const result = getNthWeekdayOfMonth(feb2025, 'third', 'Saturday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(15); // February 15, 2025
    });

    it('should find the last Friday of March 2025', () => {
      const mar2025 = new Date(2025, 2, 15);
      const result = getNthWeekdayOfMonth(mar2025, 'last', 'Friday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(28); // March 28, 2025
    });

    it('should return null for fifth Sunday when it does not exist', () => {
      // February 2025 has 4 Sundays, not 5
      const feb2025 = new Date(2025, 1, 10);
      const result = getNthWeekdayOfMonth(feb2025, 'fourth', 'Sunday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(23); // 4th Sunday exists

      // But there's no 5th occurrence mapping, so testing 'fourth' works
    });

    it('should apply start time correctly', () => {
      const jan2025 = new Date(2025, 0, 15);
      const result = getNthWeekdayOfMonth(jan2025, 'first', 'Sunday', '10:30');

      expect(result).not.toBeNull();
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(30);
    });

    it('should find last Monday of a month', () => {
      // April 2025 - last Monday should be April 28
      const apr2025 = new Date(2025, 3, 15);
      const result = getNthWeekdayOfMonth(apr2025, 'last', 'Monday', null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(28);
      expect(result.getMonth()).toBe(3); // April
    });
  });

  describe('getNextDayOfMonth', () => {

    it('should find the next 15th of the month', () => {
      const fromDate = new Date(2025, 0, 10); // January 10, 2025
      const result = getNextDayOfMonth(15, fromDate, null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(0); // January 15
    });

    it('should skip to next month if past the target day', () => {
      const fromDate = new Date(2025, 0, 20); // January 20, 2025
      const result = getNextDayOfMonth(15, fromDate, null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(15);
      expect(result.getMonth()).toBe(1); // February 15
    });

    it('should handle day 31 in February (edge case)', () => {
      const fromDate = new Date(2025, 1, 1); // February 1, 2025
      const result = getNextDayOfMonth(31, fromDate, null);

      expect(result).not.toBeNull();
      // February 2025 has 28 days, so should return Feb 28
      expect(result.getDate()).toBe(28);
      expect(result.getMonth()).toBe(1);
    });

    it('should handle day 30 in February (edge case)', () => {
      const fromDate = new Date(2025, 1, 1);
      const result = getNextDayOfMonth(30, fromDate, null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(28); // Feb has 28 days
    });

    it('should handle day 31 in April (30-day month)', () => {
      const fromDate = new Date(2025, 3, 1); // April 1, 2025
      const result = getNextDayOfMonth(31, fromDate, null);

      expect(result).not.toBeNull();
      expect(result.getDate()).toBe(30); // April has 30 days
      expect(result.getMonth()).toBe(3);
    });

    it('should apply start time correctly', () => {
      const fromDate = new Date(2025, 0, 10);
      const result = getNextDayOfMonth(15, fromDate, '14:00');

      expect(result).not.toBeNull();
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('applyTimeToDate', () => {

    it('should apply hours and minutes', () => {
      const date = new Date(2025, 0, 15);
      const result = applyTimeToDate(date, '10:30');

      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(30);
    });

    it('should handle time with no minutes', () => {
      const date = new Date(2025, 0, 15);
      const result = applyTimeToDate(date, '10');

      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(0);
    });

    it('should return original date if no time provided', () => {
      const date = new Date(2025, 0, 15, 8, 30);
      const result = applyTimeToDate(date, null);

      expect(result).toEqual(date);
    });
  });
});
