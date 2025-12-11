const strapiInstance = require('@strapi/strapi');
const seedMedia = require('./seed-media');
const seedBasicData = require('./seed-data');
const seedGardenTasks = require('./seed-garden-tasks');
const seedMessages = require('./seed-messages');
const seedEvents = require('./seed-events');

async function runSeeds() {
  try {
    // Initialize Strapi
    const strapi = await strapiInstance().load();
    console.log('Strapi initialized, starting seed process...');

    // Run the seeds in order
    await seedMedia(strapi);
    await seedBasicData(strapi);
    await seedEvents(strapi);
    await seedGardenTasks(strapi);
    await seedMessages(strapi);

    // Exit successfully
    console.log('All seeds completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error while running seeds:', error);
    process.exit(1);
  }
}

runSeeds(); 