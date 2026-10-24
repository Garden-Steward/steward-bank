// Loading Strapi runs bootstrap hooks; seeding must not start scheduled jobs.
process.env.CRON_ENABLED = 'false';

const { createStrapi } = require('@strapi/strapi');
const seedMedia = require('./seed-media');
const seedBasicData = require('./seed-data');
const seedGardenTasks = require('./seed-garden-tasks');
const seedMessages = require('./seed-messages');
const seedEvents = require('./seed-events');
const seedRecurringEventTemplates = require('./seed-recurring-event-templates');
const seedContentPermissionsInternal = require('./seed-content-permissions-internal');
const seedProjects = require('./seed-projects');
const seedSmsCampaigns = require('./seed-sms-campaigns');
const seedGardenWelcomeEmail = require('./seed-garden-welcome-email');

async function runSeeds() {
  let strapi;
  try {
    // Initialize Strapi
    strapi = createStrapi();
    await strapi.load();
    console.log('Strapi initialized, starting seed process...');

    // Run the seeds in order
    await seedMedia(strapi);
    await seedBasicData(strapi);
    await seedEvents(strapi);
    await seedRecurringEventTemplates(strapi);
    await seedGardenTasks(strapi);
    await seedMessages(strapi);
    await seedProjects(strapi);
    await seedSmsCampaigns(strapi);
    await seedContentPermissionsInternal(strapi);
    await seedGardenWelcomeEmail(strapi);

    console.log('All seeds completed successfully');
  } catch (error) {
    console.error('Error while running seeds:', error);
    process.exitCode = 1;
  } finally {
    if (strapi) {
      await strapi.destroy();
    }
  }
}

// Some application services retain timers after Strapi shuts down. This CLI
// exits only after destroy() finishes, preserving the result of the seed run.
runSeeds().then(
  () => process.exit(process.exitCode || 0),
  (error) => {
    console.error('Error shutting down seed process:', error);
    process.exit(1);
  }
);
