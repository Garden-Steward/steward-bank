/**
 * Garden lifecycle hooks
 * Refreshes the garden cache when gardens are created/updated
 */

module.exports = {
  async afterCreate(event) {
    const { result } = event;
    console.log(`✅ Garden created: ${result.title} (${result.sms_slug})`);
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after create`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after create:', err.message);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    console.log(`✅ Garden updated: ${result.title} (${result.sms_slug})`);
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after update`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after update:', err.message);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    console.log(`❌ Garden deleted: ${result.title}`);
    // Refresh cache
    try {
      await strapi.service('api::garden.garden').refreshCache();
      console.log(`🔄 Garden cache refreshed after delete`);
    } catch (err) {
      console.error('⚠️  Failed to refresh cache after delete:', err.message);
    }
  }
};
