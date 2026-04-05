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
  }
}));

