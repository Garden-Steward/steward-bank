const cronTasks = require("./cron-tasks");

module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    // Strapi arms and starts crons during bootstrap, which runs inside
    // strapi.load() - so any script that boots the app starts firing real jobs,
    // SMS included. Scripts that only want to read set CRON_ENABLED=false.
    enabled: env.bool('CRON_ENABLED', true),
    tasks: cronTasks,
  },
});
