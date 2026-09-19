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
        status: 'APPROVED',
        verification_token: null,
      },
    });

    ctx.body = {
      verified: true,
      project_title: project.title,
    };
  },
};