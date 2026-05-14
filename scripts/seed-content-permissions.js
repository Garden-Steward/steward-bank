/**
 * Grants read access to plants and projects on the Public role, and full
 * CRUD access on the Authenticated role. Safe to run against a live instance —
 * it only enables permissions, never disables anything.
 *
 * Usage: API_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-content-permissions.js
 */
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Permissions to ensure exist — keyed by role type
const DESIRED = {
  public: {
    'api::plant.plant': ['find', 'findOne'],
    'api::project.project': ['find', 'findOne', 'findByGarden'],
  },
  authenticated: {
    'api::plant.plant': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::project.project': ['find', 'findOne', 'create', 'update', 'delete', 'findByGarden'],
  },
};

async function getJwt() {
  const res = await axios.post(`${API_URL}/api/auth/local?populate=role`, {
    identifier: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.jwt;
}

async function applyPermissions(headers, role, desiredPerms) {
  const detailRes = await axios.get(
    `${API_URL}/api/users-permissions/roles/${role.id}`,
    { headers }
  );
  const currentPerms = detailRes.data.role.permissions;

  // Deep-clone so we can mutate safely
  const merged = JSON.parse(JSON.stringify(currentPerms));
  let enabledCount = 0;

  for (const [namespace, actions] of Object.entries(desiredPerms)) {
    // namespace is e.g. "api::plant.plant" — the HTTP roles API uses dots as separators
    // but the permissions map uses the full uid as key. Find the matching key.
    const nsKey = Object.keys(merged).find(k => k === namespace) || namespace;

    if (!merged[nsKey]) merged[nsKey] = { controllers: {} };
    if (!merged[nsKey].controllers) merged[nsKey].controllers = {};

    // Strapi's roles API nests by controller name (last segment after the last dot,
    // lowercased). e.g. "api::plant.plant" → controller "plant"
    const controllerName = namespace.split('::')[1]?.split('.')[1] || namespace.split('.').pop();

    if (!merged[nsKey].controllers[controllerName]) {
      merged[nsKey].controllers[controllerName] = {};
    }

    for (const action of actions) {
      const current = merged[nsKey].controllers[controllerName][action];
      if (!current || !current.enabled) {
        merged[nsKey].controllers[controllerName][action] = { enabled: true, policy: '' };
        enabledCount++;
        console.log(`  [${role.type}] enabling ${namespace}.${controllerName}.${action}`);
      }
    }
  }

  if (enabledCount === 0) {
    console.log(`  [${role.type}] all desired permissions already set — nothing to do`);
    return;
  }

  await axios.put(
    `${API_URL}/api/users-permissions/roles/${role.id}`,
    { permissions: merged },
    { headers }
  );
  console.log(`  [${role.type}] saved (${enabledCount} newly enabled)`);
}

async function seedContentPermissions() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    process.exit(1);
  }

  console.log('Authenticating...');
  const jwt = await getJwt();
  const headers = { Authorization: `Bearer ${jwt}` };

  console.log('Fetching roles...');
  const rolesRes = await axios.get(`${API_URL}/api/users-permissions/roles`, { headers });
  const roles = rolesRes.data.roles;

  for (const roleType of ['public', 'authenticated']) {
    const role = roles.find(r => r.type === roleType);
    if (!role) { console.warn(`Role "${roleType}" not found, skipping`); continue; }
    console.log(`Applying permissions for "${roleType}" role (id ${role.id})...`);
    await applyPermissions(headers, role, DESIRED[roleType]);
  }

  console.log('Done.');
}

seedContentPermissions().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
