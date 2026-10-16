'use strict';

module.exports = {
  async verify(ctx) {
    const { token } = ctx.query;

    if (!token) {
      return ctx.badRequest('Missing verification token');
    }

    const project = await strapi.db.query('api::project.project').findOne({
      where: { verification_token: token },
    });

    if (!project) {
      return ctx.notFound('Invalid or expired verification token');
    }

    await strapi.db.query('api::project.project').update({
      where: { id: project.id },
      data: {
              review_status: 'APPROVED',
              verification_token: null,
            },
    });

    // Don't hold the response for geocoding and emails.
    strapi.db.query('api::project.project')
      .findOne({ where: { id: project.id }, populate: ['garden', 'created_by'] })
      .then((approved) => strapi.service('api::project-alert.project-alert').notifyForProject(approved))
      .catch((err) => strapi.log.error('[project verify] subscriber alerts failed:', err));

    ctx.body = {
      verified: true,
      project_title: project.title,
    };
  },
};