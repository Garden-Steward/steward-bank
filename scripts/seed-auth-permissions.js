/**
 * Merges Public role permissions into the Authenticated role so that
 * Authenticated users can do everything Public users can (plus anything extra).
 * Usage: API_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-auth-permissions.js
 */
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function getJwt() {
  const res = await axios.post(`${API_URL}/api/auth/local?populate=role`, {
    identifier: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.jwt;
}

async function seedAuthPermissions() {
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

  const publicRole = roles.find(r => r.type === 'public');
  const authRole = roles.find(r => r.type === 'authenticated');

  if (!publicRole || !authRole) {
    console.error('Could not find public or authenticated role');
    process.exit(1);
  }

  console.log(`Fetching full details for Public (id ${publicRole.id}) and Authenticated (id ${authRole.id}) roles...`);

  const [publicDetailRes, authDetailRes] = await Promise.all([
    axios.get(`${API_URL}/api/users-permissions/roles/${publicRole.id}`, { headers }),
    axios.get(`${API_URL}/api/users-permissions/roles/${authRole.id}`, { headers }),
  ]);

  const publicPerms = publicDetailRes.data.role.permissions;
  const authPerms = authDetailRes.data.role.permissions;

  // Merge: for every controller+action enabled on Public, enable it on Authenticated too.
  // authPerms structure: { "api::foo.foo": { controllers: { myController: { myAction: { enabled, policy } } } } }
  const merged = JSON.parse(JSON.stringify(authPerms));

  let enabledCount = 0;

  for (const [namespace, nsData] of Object.entries(publicPerms)) {
    if (!nsData.controllers) continue;
    for (const [controller, controllerData] of Object.entries(nsData.controllers)) {
      for (const [action, actionData] of Object.entries(controllerData)) {
        if (!actionData.enabled) continue;

        // Ensure path exists in merged object
        if (!merged[namespace]) merged[namespace] = { controllers: {} };
        if (!merged[namespace].controllers) merged[namespace].controllers = {};
        if (!merged[namespace].controllers[controller]) merged[namespace].controllers[controller] = {};

        const current = merged[namespace].controllers[controller][action];
        if (!current || !current.enabled) {
          merged[namespace].controllers[controller][action] = { enabled: true, policy: actionData.policy || '' };
          enabledCount++;
          console.log(`  Enabling ${namespace}.${controller}.${action} on Authenticated`);
        }
      }
    }
  }

  if (enabledCount === 0) {
    console.log('Authenticated role already has all Public permissions — nothing to do.');
    return;
  }

  console.log(`Saving merged permissions (${enabledCount} newly enabled action(s))...`);
  await axios.put(
    `${API_URL}/api/users-permissions/roles/${authRole.id}`,
    { permissions: merged },
    { headers }
  );

  console.log('Done.');
}

seedAuthPermissions().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
