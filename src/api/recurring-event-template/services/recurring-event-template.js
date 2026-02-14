'use strict';

/**
 * recurring-event-template service
 *
 * Handles date calculations and instance generation for recurring volunteer events.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const {
  addMonths,
  setDate,
  getDay,
  startOfMonth,
  endOfMonth,
  addDays,
  format,
  isAfter,
  isBefore,
  setHours,
  setMinutes,
  getDaysInMonth,
  lastDayOfMonth
} = require('date-fns');
const { zonedTimeToUtc } = require('date-fns-tz');

// All recurring event times are in Pacific timezone
const TIMEZONE = 'America/Los_Angeles';

// Weekday name to number mapping (0 = Sunday, 6 = Saturday)
const WEEKDAY_MAP = {
  'Sunday': 0,
  'Monday': 1,
  'Tuesday': 2,
  'Wednesday': 3,
  'Thursday': 4,
  'Friday': 5,
  'Saturday': 6
};

// Nth occurrence to number mapping
const NTH_MAP = {
  'first': 1,
  'second': 2,
  'third': 3,
  'fourth': 4,
  'last': -1
};

module.exports = createCoreService('api::recurring-event-template.recurring-event-template', ({ strapi }) => ({

  /**
   * Calculate the nth weekday of a given month
   * @param {Date} monthDate - Any date in the target month
   * @param {string} nthOccurrence - 'first', 'second', 'third', 'fourth', or 'last'
   * @param {string} weekdayName - 'Sunday', 'Monday', etc.
   * @param {string} startTime - Time string in HH:mm format (optional)
   * @returns {Date} The calculated date with time applied
   */
  getNthWeekdayOfMonth(monthDate, nthOccurrence, weekdayName, startTime) {
    const targetWeekday = WEEKDAY_MAP[weekdayName];
    const nth = NTH_MAP[nthOccurrence];

    if (nth === -1) {
      // Handle 'last' occurrence
      const lastDay = lastDayOfMonth(monthDate);
      let date = lastDay;

      // Walk backwards to find the last occurrence of the target weekday
      while (getDay(date) !== targetWeekday) {
        date = addDays(date, -1);
      }

      return this.applyTimeToDate(date, startTime);
    }

    // Find the first occurrence of the target weekday in the month
    const firstOfMonth = startOfMonth(monthDate);
    let firstOccurrence = firstOfMonth;

    // Find the first occurrence of the target weekday
    while (getDay(firstOccurrence) !== targetWeekday) {
      firstOccurrence = addDays(firstOccurrence, 1);
    }

    // Add weeks to get to the nth occurrence
    const result = addDays(firstOccurrence, (nth - 1) * 7);

    // Verify the result is still in the same month
    if (result.getMonth() !== monthDate.getMonth()) {
      strapi.log.warn(`getNthWeekdayOfMonth: ${nthOccurrence} ${weekdayName} doesn't exist in ${format(monthDate, 'MMMM yyyy')}`);
      return null;
    }

    return this.applyTimeToDate(result, startTime);
  },

  /**
   * Apply a time string to a date
   * @param {Date} date - The date to apply time to
   * @param {string} timeStr - Time string in HH:mm format (optional)
   * @returns {Date} Date with time applied
   */
  applyTimeToDate(date, timeStr) {
    if (!timeStr) return date;

    const [hours, minutes] = timeStr.split(':').map(Number);
    let result = setHours(date, hours);
    result = setMinutes(result, minutes || 0);
    return result;
  },

  /**
   * Calculate the next occurrence date from a template
   * @param {Object} template - The recurring event template
   * @param {Date} fromDate - Date to calculate from
   * @returns {Date} The next occurrence date
   */
  getNextOccurrenceDate(template, fromDate) {
    const from = fromDate || new Date();

    if (template.recurrence_type === 'day_of_month') {
      return this.getNextDayOfMonth(template, from);
    } else if (template.recurrence_type === 'nth_weekday') {
      return this.getNextNthWeekday(template, from);
    }

    strapi.log.error(`Unknown recurrence_type: ${template.recurrence_type}`);
    return null;
  },

  /**
   * Calculate next occurrence for day_of_month recurrence type
   * @param {Object} template - The recurring event template
   * @param {Date} fromDate - Date to calculate from
   * @returns {Date} The next occurrence date
   */
  getNextDayOfMonth(template, fromDate) {
    const targetDay = template.day_of_month;
    let candidateDate = new Date(fromDate);

    // Start checking from the current month
    for (let i = 0; i < 13; i++) {
      const monthDate = addMonths(candidateDate, i);
      const daysInMonth = getDaysInMonth(monthDate);

      // Handle edge case: if target day doesn't exist in month (e.g., Feb 30)
      const actualDay = Math.min(targetDay, daysInMonth);
      let occurrenceDate = setDate(monthDate, actualDay);
      occurrenceDate = this.applyTimeToDate(occurrenceDate, template.start_time);

      // If this occurrence is in the future (after fromDate), return it
      if (isAfter(occurrenceDate, fromDate)) {
        return occurrenceDate;
      }
    }

    strapi.log.warn(`Could not find next occurrence for template ${template.id}`);
    return null;
  },

  /**
   * Calculate next occurrence for nth_weekday recurrence type
   * @param {Object} template - The recurring event template
   * @param {Date} fromDate - Date to calculate from
   * @returns {Date} The next occurrence date
   */
  getNextNthWeekday(template, fromDate) {
    let candidateMonth = new Date(fromDate);

    // Check up to 13 months out
    for (let i = 0; i < 13; i++) {
      const monthToCheck = addMonths(candidateMonth, i);
      const occurrenceDate = this.getNthWeekdayOfMonth(
        monthToCheck,
        template.nth_occurrence,
        template.weekday,
        template.start_time
      );

      if (occurrenceDate && isAfter(occurrenceDate, fromDate)) {
        return occurrenceDate;
      }
    }

    strapi.log.warn(`Could not find next occurrence for template ${template.id}`);
    return null;
  },

  /**
   * Generate a title for an event instance based on template naming convention
   * @param {Object} template - The recurring event template
   * @param {Date} occurrenceDate - The date of the occurrence
   * @returns {string} The generated title
   */
  generateInstanceTitle(template, occurrenceDate) {
    const baseTitle = template.title_template;

    switch (template.naming_convention) {
      case 'title_only':
        return baseTitle;

      case 'title_month':
        return `${baseTitle} - ${format(occurrenceDate, 'MMMM')}`;

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
  },

  /**
   * Generate a slug for an event instance
   * @param {Object} template - The recurring event template
   * @param {Date} occurrenceDate - The date of the occurrence
   * @returns {string} The generated slug
   */
  generateInstanceSlug(template, occurrenceDate) {
    const baseSlug = template.title_template
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const dateSlug = format(occurrenceDate, 'yyyy-MM-dd');
    return `${baseSlug}-${dateSlug}`;
  },

  /**
   * Create a volunteer-day instance from a template
   * @param {Object} template - The recurring event template (with garden populated)
   * @param {Date} occurrenceDate - The date for the instance
   * @returns {Object} The created volunteer-day entry
   */
  /**
   * Convert a "Pacific-naive" date (where hours represent Pacific time)
   * to a proper UTC Date for database storage.
   *
   * When we call setHours(9) on a Date, it sets 9:00 UTC on the server.
   * But we mean 9:00 Pacific. This method re-interprets the date values
   * as Pacific time and returns the correct UTC equivalent.
   *
   * @param {Date} naiveDate - Date where hour/minute represent Pacific time
   * @returns {Date} Proper UTC Date
   */
  toPacificUTC(naiveDate) {
    // Build a string from the naive date's values (which represent Pacific time)
    const dateStr = format(naiveDate, 'yyyy-MM-dd HH:mm:ss');
    // zonedTimeToUtc interprets the string as Pacific time and returns UTC
    return zonedTimeToUtc(dateStr, TIMEZONE);
  },

  async createInstance(template, occurrenceDate) {
    const title = this.generateInstanceTitle(template, occurrenceDate);
    const slug = this.generateInstanceSlug(template, occurrenceDate);

    // Convert Pacific-naive date to proper UTC for storage
    const utcDate = this.toPacificUTC(occurrenceDate);

    strapi.log.info(`Creating recurring instance: "${title}" for ${format(occurrenceDate, 'yyyy-MM-dd HH:mm')} Pacific (UTC: ${utcDate.toISOString()})`);

    try {
      const newEvent = await strapi.entityService.create('api::volunteer-day.volunteer-day', {
        data: {
          title,
          slug,
          blurb: template.blurb,
          content: template.content,
          startDatetime: utcDate.toISOString(),
          endText: template.end_text,
          garden: template.garden?.id || template.garden,
          interest: template.interest || 'Everyone',
          accessibility: template.accessibility || 'Public',
          type: template.type,
          hero_image: template.hero_image?.id || template.hero_image,
          disabled: false,
          recurring_template: template.id,
          is_recurring_instance: true,
          publishedAt: new Date().toISOString() // Auto-publish
        }
      });

      strapi.log.info(`Created volunteer-day ${newEvent.id}: "${newEvent.title}"`);
      return newEvent;
    } catch (error) {
      strapi.log.error(`Failed to create instance for template ${template.id}: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get existing future instances for a template
   * @param {Object} template - The recurring event template
   * @returns {Array} Array of future volunteer-day entries
   */
  async getFutureInstances(template) {
    const now = new Date();

    const instances = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
      filters: {
        recurring_template: template.id,
        is_recurring_instance: true,
        startDatetime: { $gt: now.toISOString() }
      },
      sort: { startDatetime: 'asc' }
    });

    return instances;
  },

  /**
   * Process a single template - create instances up to max_future_instances
   * @param {Object} template - The recurring event template (with garden populated)
   * @returns {Object} Results object with created instances
   */
  async processTemplate(template) {
    const results = {
      templateId: template.id,
      templateTitle: template.title_template,
      created: [],
      skipped: [],
      errors: []
    };

    if (!template.is_active) {
      strapi.log.info(`Template ${template.id} is inactive, skipping`);
      results.skipped.push('Template is inactive');
      return results;
    }

    // Validate required fields based on recurrence type
    if (template.recurrence_type === 'day_of_month' && !template.day_of_month) {
      results.errors.push('day_of_month is required for day_of_month recurrence type');
      return results;
    }

    if (template.recurrence_type === 'nth_weekday' && (!template.nth_occurrence || !template.weekday)) {
      results.errors.push('nth_occurrence and weekday are required for nth_weekday recurrence type');
      return results;
    }

    // Get existing future instances
    const existingInstances = await this.getFutureInstances(template);
    const existingCount = existingInstances.length;
    const maxInstances = template.max_future_instances || 3;

    strapi.log.info(`Template ${template.id}: ${existingCount}/${maxInstances} future instances exist`);

    if (existingCount >= maxInstances) {
      results.skipped.push(`Already have ${existingCount} future instances (max: ${maxInstances})`);
      return results;
    }

    // Calculate how many instances we need to create
    const instancesToCreate = maxInstances - existingCount;

    // Find the latest existing instance date, or use first_occurrence_date
    let lastDate = new Date();
    if (existingInstances.length > 0) {
      lastDate = new Date(existingInstances[existingInstances.length - 1].startDatetime);
    } else if (template.first_occurrence_date) {
      // Start from day before first_occurrence_date to include it
      lastDate = addDays(new Date(template.first_occurrence_date), -1);
    }

    // Create instances
    for (let i = 0; i < instancesToCreate; i++) {
      try {
        const nextDate = this.getNextOccurrenceDate(template, lastDate);

        if (!nextDate) {
          results.errors.push(`Could not calculate occurrence #${i + 1}`);
          break;
        }

        // Check if an instance already exists for this date
        // Convert day boundaries from Pacific to UTC for the DB query
        const dayStartPacific = new Date(nextDate);
        dayStartPacific.setHours(0, 0, 0, 0);
        const dayEndPacific = new Date(nextDate);
        dayEndPacific.setHours(23, 59, 59, 999);

        const existingForDate = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
          filters: {
            recurring_template: template.id,
            startDatetime: {
              $gte: this.toPacificUTC(dayStartPacific).toISOString(),
              $lte: this.toPacificUTC(dayEndPacific).toISOString()
            }
          }
        });

        if (existingForDate.length > 0) {
          strapi.log.info(`Instance already exists for ${format(nextDate, 'yyyy-MM-dd')}, skipping`);
          results.skipped.push(`Instance for ${format(nextDate, 'yyyy-MM-dd')} already exists`);
          lastDate = nextDate;
          continue;
        }

        const newInstance = await this.createInstance(template, nextDate);
        results.created.push({
          id: newInstance.id,
          title: newInstance.title,
          date: format(nextDate, 'yyyy-MM-dd')
        });

        lastDate = nextDate;
      } catch (error) {
        results.errors.push(`Error creating instance #${i + 1}: ${error.message}`);
        strapi.log.error(`Error in processTemplate: ${error.message}`);
      }
    }

    return results;
  },

  /**
   * Process all active templates
   * @returns {Object} Summary of all processed templates
   */
  async processAllTemplates() {
    strapi.log.info('Starting processAllTemplates');

    const summary = {
      processedAt: new Date().toISOString(),
      totalTemplates: 0,
      totalCreated: 0,
      results: []
    };

    try {
      // Find all published and active templates
      const templates = await strapi.entityService.findMany(
        'api::recurring-event-template.recurring-event-template',
        {
          filters: {
            is_active: true,
            publishedAt: { $notNull: true }
          },
          populate: ['garden', 'hero_image']
        }
      );

      summary.totalTemplates = templates.length;
      strapi.log.info(`Found ${templates.length} active templates to process`);

      for (const template of templates) {
        const result = await this.processTemplate(template);
        summary.results.push(result);
        summary.totalCreated += result.created.length;
      }

      strapi.log.info(`processAllTemplates complete: ${summary.totalCreated} instances created`);

    } catch (error) {
      strapi.log.error(`processAllTemplates failed: ${error.message}`);
      summary.error = error.message;
    }

    return summary;
  },

  /**
   * Preview upcoming occurrences for a template without creating them
   * @param {Object} template - The recurring event template
   * @param {number} count - Number of occurrences to preview (default: 6)
   * @returns {Array} Array of preview objects
   */
  async previewOccurrences(template, count = 6) {
    const previews = [];
    let lastDate = new Date();

    // Start from first_occurrence_date if set and in the future
    if (template.first_occurrence_date) {
      const firstDate = new Date(template.first_occurrence_date);
      if (isAfter(firstDate, lastDate)) {
        lastDate = addDays(firstDate, -1);
      }
    }

    for (let i = 0; i < count; i++) {
      const nextDate = this.getNextOccurrenceDate(template, lastDate);

      if (!nextDate) break;

      previews.push({
        date: format(nextDate, 'yyyy-MM-dd'),
        time: format(nextDate, 'HH:mm'),
        title: this.generateInstanceTitle(template, nextDate),
        slug: this.generateInstanceSlug(template, nextDate)
      });

      lastDate = nextDate;
    }

    return previews;
  }
}));
