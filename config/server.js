const cronTasks = require("./cron-tasks");

module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: cronTasks,
  },
  // Initialize garden cache on startup
  bootstrap: async ({ strapi }) => {
    console.log('\n🌱 Initializing Garden Steward SMS services...');
    try {
      await strapi.service('api::garden.garden').initializeCache();
    } catch (err) {
      console.error('⚠️  Garden cache initialization failed:', err.message);
    }
  }
});
