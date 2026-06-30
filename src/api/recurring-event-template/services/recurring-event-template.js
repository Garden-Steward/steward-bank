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

  getNthWeekdayOfMonth(monthDate, nthOccurrence, weekdayName, startTime) {
    const targetWeekday = WEEKDAY_MAP[weekdayName];
    const nth = NTH_MAP[nthOccurrence];

    if (nth === -1) {
      const lastDay = lastDayOfMonth(monthDate);
      let date = lastDay;

      while (getDay(date) !== targetWeekday) {
        date = addDays(date, -1);
      }

      return this.applyTimeToDate(date, startTime);
    }

    const firstOfMonth = startOfMonth(monthDate);
    let firstOccurrence = firstOfMonth;

    while (getDay(firstOccurrence) !== targetWeekday) {
      firstOccurrence = addDays(firstOccurrence, 1);
    }

    const result = addDays(firstOccurrence, (nth - 1) * 7);

    if (result.getMonth() !== monthDate.getMonth()) {
      strapi.log.warn(`getNthWeekdayOfMonth: ${nthOccurrence} ${weekdayName} doesn't exist in ${format(monthDate, 'MMMM yyyy')}`);
      return null;
    }

    return this.applyTimeToDate(result, startTime);
  },

  applyTimeToDate(date, timeStr) {
    if (!timeStr) return date;

    const [hours, minutes] = timeStr.split(':').map(Number);
    let result = setHours(date, hours);
    result = setMinutes(result, minutes || 0);
    return result;
  },

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

  getNextDayOfMonth(template, fromDate) {
    const targetDay = template.day_of_month;
    let candidateDate = new Date(fromDate);

    for (let i = 0; i < 13; i++) {
      const monthDate = addMonths(candidateDate, i);
      const daysInMonth = getDaysInMonth(monthDate);

      const actualDay = Math.min(targetDay, daysInMonth);
      let occurrenceDate = setDate(monthDate, actualDay);
      occurrenceDate = this.applyTimeToDate(occurrenceDate, template.start_time);

      if (isAfter(occurrenceDate, fromDate)) {
        return occurrenceDate;
      }
    }

    strapi.log.warn(`Could not find next occurrence for template ${template.id}`);
    return null;
  },

  getNextNthWeekday(template, fromDate) {
    let candidateMonth = new Date(fromDate);

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

  generateInstanceSlug(template, occurrenceDate) {
    const baseSlug = template.title_template
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const dateSlug = format(occurrenceDate, 'yyyy-MM-dd');
    return `${baseSlug}-${dateSlug}`;
  },

  toPacificUTC(naiveDate) {
    const dateStr = format(naiveDate, 'yyyy-MM-dd HH:mm:ss');
    return zonedTimeToUtc(dateStr, TIMEZONE);
  },

  async createInstance(template, occurrenceDate) {
    const title = this.generateInstanceTitle(template, occurrenceDate);
    const slug = this.generateInstanceSlug(template, occurrenceDate);

    const utcDate = this.toPacificUTC(occurrenceDate);

    strapi.log.info(`Creating recurring instance: "${title}" for ${format(occurrenceDate, 'yyyy-MM-dd HH:mm')} Pacific (UTC: ${utcDate.toISOString()})`);

    try {
      const newEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
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
          publishedAt: new Date().toISOString()
        }
      });

      strapi.log.info(`Created volunteer-day ${newEvent.id}: "${newEvent.title}"`);
      return newEvent;
    } catch (error) {
      strapi.log.error(`Failed to create instance for template ${template.id}: ${error.message}`);
      throw error;
    }
  },

  async getFutureInstances(template) {
    const now = new Date();

    const instances = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
      where: {
        recurring_template: template.id,
        is_recurring_instance: true,
        startDatetime: { $gt: now.toISOString() }
      },
      orderBy: { startDatetime: 'asc' }
    });

    return instances;
  },

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

    if (template.recurrence_type === 'day_of_month' && !template.day_of_month) {
      results.errors.push('day_of_month is required for day_of_month recurrence type');
      return results;
    }

    if (template.recurrence_type === 'nth_weekday' && (!template.nth_occurrence || !template.weekday)) {
      results.errors.push('nth_occurrence and weekday are required for nth_weekday recurrence type');
      return results;
    }

    const existingInstances = await this.getFutureInstances(template);
    const existingCount = existingInstances.length;
    const maxInstances = template.max_future_instances || 3;

    strapi.log.info(`Template ${template.id}: ${existingCount}/${maxInstances} future instances exist`);

    if (existingCount >= maxInstances) {
      results.skipped.push(`Already have ${existingCount} future instances (max: ${maxInstances})`);
      return results;
    }

    const instancesToCreate = maxInstances - existingCount;

    let lastDate = new Date();
    if (existingInstances.length > 0) {
      lastDate = new Date(existingInstances[existingInstances.length - 1].startDatetime);
    } else if (template.first_occurrence_date) {
      lastDate = addDays(new Date(template.first_occurrence_date), -1);
    }

    for (let i = 0; i < instancesToCreate; i++) {
      try {
        const nextDate = this.getNextOccurrenceDate(template, lastDate);

        if (!nextDate) {
          results.errors.push(`Could not calculate occurrence #${i + 1}`);
          break;
        }

        const dayStartPacific = new Date(nextDate);
        dayStartPacific.setHours(0, 0, 0, 0);
        const dayEndPacific = new Date(nextDate);
        dayEndPacific.setHours(23, 59, 59, 999);

        const existingForDate = await strapi.db.query('api::volunteer-day.volunteer-day').findMany({
          where: {
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

  async processAllTemplates() {
    strapi.log.info('Starting processAllTemplates');

    const summary = {
      processedAt: new Date().toISOString(),
      totalTemplates: 0,
      totalCreated: 0,
      results: []
    };

    try {
      const templates = await strapi.db.query('api::recurring-event-template.recurring-event-template').findMany({
        where: {
          is_active: true,
          publishedAt: { $notNull: true }
        },
        populate: ['garden', 'hero_image']
      });

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

  async previewOccurrences(template, count = 6) {
    const previews = [];
    let lastDate = new Date();

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
