'use strict';

/**
 * project controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

// Review-workflow states. `review_status` (not `status`) because Strapi v5
// reserves `status` for the draft/publish selector.
const PUBLIC_STATUSES = ['APPROVED', 'COMPLETED'];
const REVIEW_STATUSES = ['CREATED', 'APPROVED', 'REJECTED', 'COMPLETED', 'ARCHIVED'];

// Non-admins see: publicly-visible projects (APPROVED/COMPLETED), projects they
// created or manage directly, and — so the garden's manage view can list
// pending pitches for approval — every project on a garden they manage,
// regardless of review_status.
function visibilityFilter(user) {
  const publicOnly = { review_status: { $in: PUBLIC_STATUSES } };
  if (!user) {
    return publicOnly;
  }
  return {
    $or: [
      publicOnly,
      { created_by: user.id },
      { managers: user.id },
      { garden: { managers: user.id } },
    ],
  };
}

function isAdmin(user) {
  return user?.role?.type === 'administrator';
}

// Pull a numeric garden id out of whatever shape the write payload used
// (104, "104", { id: 104 }, { connect: [{ id: 104 }] }, { connect: [104] }).
function extractGardenId(garden) {
  if (garden == null || garden === '') {
    return null;
  }
  if (typeof garden === 'object') {
    const first = Array.isArray(garden.connect) ? garden.connect[0] : undefined;
    return (
      garden.id ??
      (first && typeof first === 'object' ? first.id : first) ??
      null
    );
  }
  return garden;
}

module.exports = createCoreController('api::project.project', ({ strapi }) => ({
  // The public create route is what both the "New project" and "Pitch a project"
  // modals actually call. Core create leaves created_by / managers empty, so the
  // brand-new project (status CREATED, which is hidden from the public find)
  // becomes invisible to the very person who made it and to the garden's
  // managers. Stamp the creator and inherit the garden's managers here so it
  // still shows up in `find` and `/projects/user`.
  async create(ctx) {
    const user = ctx.state.user;
    const data = ctx.request.body?.data;
    if (!user || !data) {
      return await super.create(ctx);
    }

    const gardenId = extractGardenId(data.garden);

    data.created_by = user.id;

    if (data.managers == null) {
      if (gardenId) {
        const garden = await strapi.db.query('api::garden.garden').findOne({
          where: { id: gardenId },
          populate: ['managers'],
        });
        data.managers = (garden?.managers || []).map((m) => m.id);
      } else {
        data.managers = [user.id];
      }
    }

    return await super.create(ctx);
  },

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

    // v5 responses are flat; older `entity.attributes` kept as a fallback.
    const reviewStatus = entity.review_status ?? entity.attributes?.review_status;
    if (PUBLIC_STATUSES.includes(reviewStatus)) {
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
      review_status: 'CREATED',
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

    const entity = await strapi.db.query('api::project.project').create({
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

    await strapi.db.query('api::project.project').update({
      where: { id },
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

    const updated = await strapi.db.query('api::project.project').update({
      where: { id },
      data: { managers: managerIds },
      populate: ['managers'],
    });

    return this.transformResponse(updated);
  },

  // Move a project through the review workflow (approve / reject / etc).
  // Allowed for an admin, a manager of the project's garden, or a manager /
  // creator of a garden-less project.
  async review(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const nextStatus = body.review_status;
    if (!REVIEW_STATUSES.includes(nextStatus)) {
      return ctx.badRequest(
        `review_status must be one of: ${REVIEW_STATUSES.join(', ')}`
      );
    }

    const project = await strapi.db.query('api::project.project').findOne({
      where: { id },
      populate: {
        created_by: true,
        managers: true,
        garden: { populate: ['managers'] },
      },
    });
    if (!project) {
      return ctx.notFound();
    }

    const managesGarden = (project.garden?.managers || []).some(
      (m) => m.id === user.id
    );
    const managesProject = (project.managers || []).some((m) => m.id === user.id);
    const isCreator = project.created_by?.id === user.id;
    if (!isAdmin(user) && !managesGarden && !managesProject && !isCreator) {
      return ctx.forbidden(
        'Only a garden manager or an administrator can review this project'
      );
    }

    const updated = await strapi.db.query('api::project.project').update({
      where: { id },
      data: { review_status: nextStatus },
      populate: ['hero_image', 'featured_gallery', 'garden', 'managers', 'created_by'],
    });

    return this.transformResponse(updated);
  },

  // Express interest in a project without requiring a full account.
  // Soft-creates a user record from email (+ optional phone/name) so the person
  // is tracked as an interested party and can later be promoted / SMS'd.
  async expressInterest(ctx) {
    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const email = (body.email || '').trim().toLowerCase();
    const phone = (body.phone || '').trim();
    const name = (body.name || '').trim();

    if (!email) {
      return ctx.badRequest('Email is required');
    }

    const project = await strapi.db.query('api::project.project').findOne({
      where: { id },
      populate: ['interested'],
    });
    if (!project) {
      return ctx.notFound('Project not found');
    }

    // Find or create the user by email (case-insensitive).
    const userService = strapi.plugins['users-permissions']?.services?.user;
    let user = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { email } });

    if (!user) {
      if (!userService) {
        return ctx.internalServerError('User service unavailable');
      }
      // Soft account: random unusable password. The person never logs in
      // with it; they can set a password later via the normal flow.
      const randomPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      user = await userService.add({
        email,
        username: email,
        password: randomPassword,
        confirmed: true,
        firstName: name || email.split('@')[0] || 'Supporter',
        phoneNumber: phone || null,
      });
    } else if (phone && !user.phoneNumber) {
      // Backfill a phone number onto an existing interested user.
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { phoneNumber: phone },
      });
    }

    // Attach to the project's interested relation (dedup).
    const current = (project.interested || []).map((u) => u.id);
    if (!current.includes(user.id)) {
      await strapi.db.query('api::project.project').update({
        where: { id },
        data: { interested: [...current, user.id] },
      });
    }

    return { count: current.length + (current.includes(user.id) ? 0 : 1), isInterested: true };
  },
}));
