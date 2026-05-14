/**
 * Creates 5 identical "watering day" messages on the first garden task whose
 * type contains "water". Distinct createdAt timestamps are achieved via a
 * 300 ms delay between each POST.
 *
 * This is intentional test data for the duplicate-message-grouping UI feature.
 *
 * Usage: API_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-duplicate-messages.js
 */
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const DUPLICATE_COUNT = 5;
const DELAY_MS = 300;
const MESSAGE_BODY = "Chris it's your watering day, can you water?";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJwt() {
  const res = await axios.post(`${API_URL}/api/auth/local?populate=role`, {
    identifier: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.jwt;
}

async function seedDuplicateMessages() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    process.exit(1);
  }

  console.log('Authenticating...');
  const jwt = await getJwt();
  const headers = { Authorization: `Bearer ${jwt}` };

  console.log('Finding a garden task with type containing "water"...');
  const tasksRes = await axios.get(
    `${API_URL}/api/garden-tasks?filters[type][$containsi]=water&pagination[pageSize]=1`,
    { headers }
  );
  const tasks = tasksRes.data.data;

  if (!tasks || tasks.length === 0) {
    console.error('No garden task with a "water" type found. Run the main seed first.');
    process.exit(1);
  }

  const task = tasks[0];
  const taskId = task.id;
  console.log(`Using garden task "${task.attributes.title}" (id ${taskId}, type "${task.attributes.type}")`);

  console.log(`Creating ${DUPLICATE_COUNT} duplicate messages with ${DELAY_MS}ms delay between each...`);

  for (let i = 1; i <= DUPLICATE_COUNT; i++) {
    const res = await axios.post(
      `${API_URL}/api/messages`,
      {
        data: {
          body: MESSAGE_BODY,
          type: 'question',
          garden_task: taskId,
        },
      },
      { headers }
    );
    console.log(`  [${i}/${DUPLICATE_COUNT}] Created message id ${res.data.data.id}`);

    if (i < DUPLICATE_COUNT) {
      await sleep(DELAY_MS);
    }
  }

  console.log('Done.');
}

seedDuplicateMessages().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
