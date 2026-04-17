'use strict';

/**
 * garden service with in-memory cache
 */

const { createCoreService } = require('@strapi/strapi').factories;

// In-memory cache for gardens
let gardenCache = null;
let cacheInitialized = false;

module.exports = createCoreService('api::garden.garden', ({ strapi }) =>  ({
  
  /**
   * Initialize the garden cache on startup
   */
  async initializeCache() {
    try {
      const gardens = await strapi.db.query('api::garden.garden').findMany({});
      gardenCache = gardens.reduce((acc, garden) => {
        if (garden.sms_slug) {
          acc[garden.sms_slug.toLowerCase()] = garden;
        }
        return acc;
      }, {});
      cacheInitialized = true;
      console.log(`✅ Garden cache initialized with ${Object.keys(gardenCache).length} gardens`);
      console.log(`   SMS slugs:`, Object.keys(gardenCache).join(', '));
      return gardenCache;
    } catch (err) {
      console.error('❌ Failed to initialize garden cache:', err);
      cacheInitialized = false;
    }
  },

  /**
   * Invalidate cache and reload
   */
  async refreshCache() {
    console.log('🔄 Refreshing garden cache...');
    gardenCache = null;
    cacheInitialized = false;
    return this.initializeCache();
  },

  /**
   * Fast SMS slug lookup from cache
   * @param {string} smsSlug - The SMS slug to lookup
   * @returns {object} Garden object or null
   */
  async findBySmsSlug(smsSlug) {
    // Initialize cache if needed
    if (!cacheInitialized || !gardenCache) {
      await this.initializeCache();
    }

    const normalized = smsSlug.toLowerCase();
    return gardenCache[normalized] || null;
  },

  /**
   * Get all cached gardens
   */
  async getCachedGardens() {
    if (!cacheInitialized || !gardenCache) {
      await this.initializeCache();
    }
    return Object.values(gardenCache);
  },

  async unsubscribeUser(user) {
    user.gardens = [];
    user.activeGarden = null;
    return strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
  },

  /**
   * If an interest with tag "Temporary" exists, attach this garden to it and
   * give all current managers/volunteers a matching user-garden-interest so
   * Temporary-targeted SMS and volunteer-day logic applies until cleartemp runs.
   */
  async ensureTemporaryInterestForNewGarden(gardenId) {
    const temporary = await strapi.db.query('api::interest.interest').findOne({
      where: { tag: 'Temporary' },
      populate: ['gardens'],
    });
    if (!temporary) {
      return;
    }

    const alreadyLinked = (temporary.gardens || []).some((g) => g.id === gardenId);
    if (!alreadyLinked) {
      await strapi.entityService.update('api::interest.interest', temporary.id, {
        data: {
          gardens: { connect: [gardenId] },
        },
      });
    }

    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { id: gardenId },
      populate: ['managers', 'volunteers'],
    });
    if (!garden) {
      return;
    }

    const userIds = new Set();
    for (const u of garden.managers || []) {
      userIds.add(u.id);
    }
    for (const u of garden.volunteers || []) {
      userIds.add(u.id);
    }

    for (const userId of userIds) {
      const existing = await strapi.db.query('api::user-garden-interest.user-garden-interest').findOne({
        where: {
          garden: gardenId,
          user: userId,
          interest: temporary.id,
        },
      });
      if (existing) {
        continue;
      }
      await strapi.entityService.create('api::user-garden-interest.user-garden-interest', {
        data: {
          user: userId,
          garden: gardenId,
          interest: temporary.id,
          publishedAt: new Date(),
        },
      });
    }
  },
}));

