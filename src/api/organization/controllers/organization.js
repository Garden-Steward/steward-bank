'use strict';

/**
 * organization controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

function sendError(ctx, status, name, message) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
}

module.exports = createCoreController('api::organization.organization', ({ strapi }) => ({
  // Orgs the caller can see, with this month's headline number.
  async usageList(ctx) {
    ctx.set('Cache-Control', 'no-store');
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const data = await strapi.service('api::billing.report').listForUser(user);
    return { data };
  },

  // Full report for one org. Unknown and not-visible orgs get the same 404.
  async usageReport(ctx) {
    ctx.set('Cache-Control', 'no-store');
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const svc = strapi.service('api::billing.report');
    const { documentId } = ctx.params;
    const months = svc.parseMonths(ctx.query.months);

    const visible = await svc.visibleOrgDocumentIds(user);
    if (visible !== 'all' && !visible.includes(documentId)) {
      return sendError(ctx, 404, 'NotFoundError', 'Organization not found');
    }

    const report = await svc.getOrgReport(documentId, { months });
    if (!report) return sendError(ctx, 404, 'NotFoundError', 'Organization not found');
    return { data: report };
  },
}));
