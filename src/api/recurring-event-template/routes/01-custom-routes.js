/**
 * Custom routes for recurring-event-template
 *
 * These routes provide manual triggers and preview endpoints
 * for managing recurring event templates.
 */

module.exports = {
  routes: [
    {
      // POST /recurring-event-templates/:id/process
      // Manually trigger processing of a specific template
      method: 'POST',
      path: '/recurring-event-templates/:id/process',
      handler: 'recurring-event-template.process',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      // GET /recurring-event-templates/:id/preview
      // Preview upcoming occurrences without creating them
      method: 'GET',
      path: '/recurring-event-templates/:id/preview',
      handler: 'recurring-event-template.preview',
      config: {
        policies: [],
        middlewares: []
      }
    },
    {
      // POST /recurring-event-templates/process-all
      // Manually trigger processing of all active templates
      method: 'POST',
      path: '/recurring-event-templates/process-all',
      handler: 'recurring-event-template.processAll',
      config: {
        policies: [],
        middlewares: []
      }
    }
  ]
};
