/**
 * Internal (Strapi library) version of the content-permissions seed.
 * Called by seed.js — mirrors what seed-content-permissions.js does via HTTP.
 */

const DESIRED = {
  public: {
    'api::plant.plant': ['find', 'findOne'],
    'api::project.project': ['find', 'findOne', 'findByGarden'],
    'api::location-tracking.location-tracking': ['find', 'findOne'],
  },
  authenticated: {
    'api::plant.plant': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::project.project': ['find', 'findOne', 'create', 'update', 'delete', 'findByGarden'],
    'api::location-tracking.location-tracking': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::email.email': ['sendWelcome'],
  },
};

async function seedContentPermissionsInternal(strapi) {
  console.log('Setting up plant and project permissions...');

  for (const [roleType, perms] of Object.entries(DESIRED)) {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: roleType }
    });

    if (!role) {
      console.warn(`  Role "${roleType}" not found, skipping`);
      continue;
    }

    for (const [contentType, actions] of Object.entries(perms)) {
      for (const action of actions) {
        const key = `${contentType}.${action}`;
        const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
          where: { action: key, role: role.id }
        });
        if (!existing) {
          await strapi.db.query('plugin::users-permissions.permission').create({
            data: { action: key, role: role.id, enabled: true }
          });
          console.log(`  [${roleType}] enabled ${key}`);
        }
      }
    }
  }

  console.log('Plant and project permissions complete.');
}

module.exports = seedContentPermissionsInternal;
