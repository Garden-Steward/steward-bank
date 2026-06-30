/**
 * Ensures cameron@oufp.org is listed as a manager on every garden.
 * Usage: API_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-cameron-manager.js
 */
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CAMERON_EMAIL = 'cameron@oufp.org';

async function getJwt() {
  const res = await axios.post(`${API_URL}/api/auth/local?populate=role`, {
    identifier: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.jwt;
}

async function seedCameronManager() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    process.exit(1);
  }

  console.log('Authenticating...');
  const jwt = await getJwt();
  const headers = { Authorization: `Bearer ${jwt}` };

  console.log('Fetching gardens with managers...');
  const gardensRes = await axios.get(`${API_URL}/api/gardens?populate=managers`, { headers });
  const gardens = gardensRes.data.data;

  if (!gardens || gardens.length === 0) {
    console.log('No gardens found.');
    return;
  }

  // Locate cameron in the first garden's manager list or fetch users separately
  console.log('Locating cameron@oufp.org in manager lists...');
  let cameronId = null;

  for (const garden of gardens) {
    const managers = garden.attributes?.managers?.data || [];
    const match = managers.find(m => m.attributes?.email === CAMERON_EMAIL);
    if (match) {
      cameronId = match.id;
      break;
    }
  }

  if (!cameronId) {
    // Not a manager of any garden yet — look up via users endpoint
    const usersRes = await axios.get(
      `${API_URL}/api/users?filters[email][$eq]=${encodeURIComponent(CAMERON_EMAIL)}`,
      { headers }
    );
    const users = usersRes.data;
    if (!users || users.length === 0) {
      console.error(`User ${CAMERON_EMAIL} not found`);
      process.exit(1);
    }
    cameronId = users[0].id;
  }

  console.log(`Cameron's user id: ${cameronId}`);

  let patched = 0;
  let skipped = 0;

  for (const garden of gardens) {
    const managers = garden.attributes?.managers?.data || [];
    const alreadyManager = managers.some(m => m.id === cameronId);

    if (alreadyManager) {
      console.log(`  Garden "${garden.attributes.title}" (id ${garden.id}): already a manager, skipping`);
      skipped++;
      continue;
    }

    const existingIds = managers.map(m => m.id);
    await axios.put(
      `${API_URL}/api/gardens/${garden.id}`,
      { data: { managers: [...existingIds, cameronId] } },
      { headers }
    );
    console.log(`  Garden "${garden.attributes.title}" (id ${garden.id}): added cameron as manager`);
    patched++;
  }

  console.log(`Done — patched ${patched} garden(s), skipped ${skipped}.`);
}

seedCameronManager().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
