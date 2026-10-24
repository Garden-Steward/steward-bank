/** Grant both frontend roles all registered content API actions during seeding. */
async function seedContentPermissionsInternal(strapi) {
  const registry = strapi.plugin('users-permissions').service('users-permissions').getActions();
  const actions = [];
  for (const [namespace, group] of Object.entries(registry)) {
    for (const [controller, methods] of Object.entries(group.controllers || {})) {
      for (const method of Object.keys(methods)) {
        actions.push(`${namespace}.${controller}.${method}`);
      }
    }
  }
  if (!actions.length) throw new Error('No content API actions registered');
  const permissions = strapi.db.query('plugin::users-permissions.permission');
  for (const type of ['public', 'authenticated']) {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type } });
    if (!role) throw new Error(`Missing role: ${type}`);
    const existing = await permissions.findMany({ where: { role: role.id } });
    const granted = new Set(existing.map(permission => permission.action));
    for (const action of actions) {
      if (!granted.has(action)) {
        await permissions.create({ data: { action, role: role.id } });
      }
    }
    console.log(`[permissions] ${type}: all ${actions.length} content API actions granted`);
  }
}
module.exports = seedContentPermissionsInternal;
