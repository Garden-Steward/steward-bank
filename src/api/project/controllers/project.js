'use strict';

/**
 * project controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const PUBLIC_STATUSES = ['APPROVED', 'COMPLETED'];

// Filter that limits non-admins to public projects plus ones they created or manage.
function visibilityFilter(user) {
  const publicOnly = { status: { $in: PUBLIC_STATUSES } };
  if (!user) {
    return publicOnly;
  }
  return {
    $or: [publicOnly, { created_by: user.id }, { managers: user.id }],
  };
}

function isAdmin(user) {
  return user?.role?.type === 'administrator';
}

module.exports = createCoreController('api::project.project', ({ strapi }) => ({
  async find(ctx) {
    const user = ctx.state.user;
    if (!isAdmin(user)) {
      const existing = ctx.query.filters;
      const visibility = visibilityFilter(user);
      ctx.query = {
        ...ctx.query,
        filters: existing ? { $and: [existing, visibility] } : visibility,
      };
    }
    return await super.find(ctx);
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    const entity = response?.data;
    if (!entity) {
      return response;
    }

    const status = entity.attributes?.status;
    if (PUBLIC_STATUSES.includes(status)) {
      return response;
    }

    const user = ctx.state.user;
    if (isAdmin(user)) {
      return response;
    }
    if (user) {
      const full = await strapi.db.query('api::project.project').findOne({
        where: { id: entity.id },
        populate: ['created_by', 'managers'],
      });
      const isCreator = full?.created_by?.id === user.id;
      const isManager = (full?.managers || []).some((m) => m.id === user.id);
      if (isCreator || isManager) {
        return response;
      }
    }
    return ctx.notFound();
  },

  async findByGarden(ctx) {
    const { slug } = ctx.params;
    const user = ctx.state.user;

    const where = { garden: { slug } };
    if (!isAdmin(user)) {
      where.$and = [visibilityFilter(user)];
    }

    const projects = await strapi.db.query('api::project.project').findMany({
      where,
      populate: ['hero_image', 'featured_gallery', 'garden', 'impact_metrics'],
      orderBy: { date_start: 'desc' },
    });

    ctx.body = projects;
  },

  // Projects the current user created or manages — includes CREATED ones, which
  // are hidden from the public find. Powers the "my pitches / pending" listing.
  async findUserProjects(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to view your projects');
    }

    const projects = await strapi.db.query('api::project.project').findMany({
      where: {
        $or: [{ created_by: user.id }, { managers: user.id }],
      },
      populate: ['hero_image', 'garden', 'created_by', 'managers'],
      orderBy: { createdAt: 'desc' },
    });

    return this.transformResponse(projects);
  },

  // Any logged-in user can pitch a project. It starts as CREATED (hidden from the
  // public) and records who created it. Garden projects inherit the garden's
  // managers; garden-less projects start with the creator as sole manager.
  async pitch(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to pitch a project');
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    const {
      title,
      short_description,
      description,
      category,
      hero_image,
      featured_gallery,
      garden,
      latitude,
      longitude,
    } = body;

    if (!title) {
      return ctx.badRequest('Title is required');
    }
    if (!short_description) {
      return ctx.badRequest('A short description is required');
    }

    const gardenId = garden
      ? typeof garden === 'object'
        ? garden.id
        : garden
      : null;

    let managers;
    if (gardenId) {
      const gardenRecord = await strapi.db.query('api::garden.garden').findOne({
        where: { id: gardenId },
        populate: ['managers'],
      });
      managers = (gardenRecord?.managers || []).map((m) => m.id);
    } else {
      managers = [user.id];
    }

    const data = {
      title,
      short_description,
      status: 'CREATED',
      created_by: user.id,
      managers,
      garden: gardenId,
      publishedAt: new Date(),
    };
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (hero_image !== undefined) data.hero_image = hero_image;
    if (featured_gallery !== undefined) data.featured_gallery = featured_gallery;
    if (latitude !== undefined && latitude !== null && latitude !== '') {
      data.latitude = latitude;
    }
    if (longitude !== undefined && longitude !== null && longitude !== '') {
      data.longitude = longitude;
    }

    const entity = await strapi.entityService.create('api::project.project', {
      data,
      populate: ['hero_image', 'featured_gallery', 'garden', 'managers', 'created_by'],
    });

    return this.transformResponse(entity);
  },

  // Toggle the current user in/out of a project's interested list.
  async toggleInterest(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to express interest');
    }

    const { id } = ctx.params;
    const project = await strapi.db.query('api::project.project').findOne({
      where: { id },
      populate: ['interested'],
    });
    if (!project) {
      return ctx.notFound();
    }

    const current = (project.interested || []).map((u) => u.id);
    const alreadyInterested = current.includes(user.id);
    const next = alreadyInterested
      ? current.filter((uid) => uid !== user.id)
      : [...current, user.id];

    await strapi.entityService.update('api::project.project', id, {
      data: { interested: next },
    });

    return { count: next.length, isInterested: !alreadyInterested };
  },

  // Re-assign managers for a garden-less project. Only the creator or an admin
  // may do this; garden projects inherit their managers from the garden.
  async updateManagers(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const managerIds = (body.managers || []).map((m) =>
      typeof m === 'object' ? m.id : m
    );

    const project = await strapi.db.query('api::project.project').findOne({
      where: { id },
      populate: ['created_by', 'garden'],
    });
    if (!project) {
      return ctx.notFound();
    }
    if (project.garden) {
      return ctx.badRequest(
        'Managers for garden projects are inherited from the garden and cannot be edited here'
      );
    }

    const isCreator = project.created_by?.id === user.id;
    if (!isAdmin(user) && !isCreator) {
      return ctx.forbidden(
        'Only the project creator or an administrator can change managers'
      );
    }

    const updated = await strapi.entityService.update('api::project.project', id, {
      data: { managers: managerIds },
      populate: ['managers'],
    });

    return this.transformResponse(updated);
  },
}));
