'use strict';

/**
 * recurring-event-template controller
 *
 * Provides endpoints for manual triggers and previews of recurring events.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::recurring-event-template.recurring-event-template', ({ strapi }) => ({

  /**
   * POST /recurring-event-templates/:id/process
   * Manually trigger processing of a specific template
   */
  async process(ctx) {
    const { id } = ctx.params;

    strapi.log.info(`Manual process triggered for template ${id}`);

    try {
      // Fetch the template with required relations
      const template = await strapi.entityService.findOne(
        'api::recurring-event-template.recurring-event-template',
        id,
        {
          populate: ['garden', 'hero_image']
        }
      );

      if (!template) {
        return ctx.notFound('Template not found');
      }

      if (!template.publishedAt) {
        return ctx.badRequest('Template must be published before processing');
      }

      // Process the template
      const result = await strapi.service('api::recurring-event-template.recurring-event-template')
        .processTemplate(template);

      ctx.body = {
        success: true,
        data: result
      };
    } catch (error) {
      strapi.log.error(`Error processing template ${id}: ${error.message}`);
      ctx.internalServerError(`Failed to process template: ${error.message}`);
    }
  },

  /**
   * GET /recurring-event-templates/:id/preview
   * Preview upcoming occurrences without creating them
   */
  async preview(ctx) {
    const { id } = ctx.params;
    const { count = 6 } = ctx.query;

    try {
      // Fetch the template
      const template = await strapi.entityService.findOne(
        'api::recurring-event-template.recurring-event-template',
        id,
        {
          populate: ['garden']
        }
      );

      if (!template) {
        return ctx.notFound('Template not found');
      }

      // Generate preview
      const previews = await strapi.service('api::recurring-event-template.recurring-event-template')
        .previewOccurrences(template, parseInt(count, 10));

      // Get existing future instances for comparison
      const existingInstances = await strapi.service('api::recurring-event-template.recurring-event-template')
        .getFutureInstances(template);

      // Build set of existing dates (YYYY-MM-DD) to exclude from previews
      const existingDates = new Set(
        existingInstances.map(i => i.startDatetime.slice(0, 10))
      );

      ctx.body = {
        success: true,
        data: {
          template: {
            id: template.id,
            title_template: template.title_template,
            recurrence_type: template.recurrence_type,
            is_active: template.is_active,
            max_future_instances: template.max_future_instances
          },
          existing_instances: existingInstances.map(instance => ({
            id: instance.id,
            title: instance.title,
            date: instance.startDatetime,
            slug: instance.slug
          })),
          upcoming_previews: previews.filter(p => !existingDates.has(p.date))
        }
      };
    } catch (error) {
      strapi.log.error(`Error previewing template ${id}: ${error.message}`);
      ctx.internalServerError(`Failed to preview template: ${error.message}`);
    }
  },

  /**
   * POST /recurring-event-templates/process-all
   * Manually trigger processing of all active templates
   */
  async processAll(ctx) {
    strapi.log.info('Manual processAll triggered');

    try {
      const summary = await strapi.service('api::recurring-event-template.recurring-event-template')
        .processAllTemplates();

      ctx.body = {
        success: true,
        data: summary
      };
    } catch (error) {
      strapi.log.error(`Error in processAll: ${error.message}`);
      ctx.internalServerError(`Failed to process templates: ${error.message}`);
    }
  }
}));
