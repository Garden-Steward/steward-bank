const Strapi = require("@strapi/strapi");
const fs = require("fs");

let instance;

async function setupStrapi() {
  if (!instance) {
    /** the following code in copied from `./node_modules/strapi/lib/Strapi.js` */
    instance = await Strapi().load();
    
    // Mount the server
    await instance.server.mount();
  }
  return instance;
}

async function cleanupStrapi() {
  if (!instance) {
    return;
  }

  try {
    // Get database settings before destroying instance
    const dbSettings = instance.config.get("database.connection");

    // Close any open connections/servers first
    if (instance.server && instance.server.httpServer) {
      await new Promise(resolve => {
        instance.server.httpServer.close(resolve);
      });
    }

    // Then destroy the instance
    if (instance.destroy) {
      await instance.destroy();
    }
    if (instance.server && instance.server.destroy) {
      await instance.server.destroy();
    }

    // Delete test database if it exists
    if (dbSettings && dbSettings.connection && dbSettings.connection.filename) {
      if (fs.existsSync(dbSettings.connection.filename)) {
        fs.unlinkSync(dbSettings.connection.filename);
      }
    }
  } catch (error) {
    console.error('Error during Strapi cleanup:', error);
  } finally {
    instance = null;
  }
}

/**
 * Updates the core of strapi
 * @param {*} pluginName
 * @param {*} key
 * @param {*} newValues
 * @param {*} environment
 */
const updatePluginStore = async (
  pluginName,
  key,
  newValues,
  environment = ""
) => {
  const pluginStore = strapi.store({
    environment: environment,
    type: "plugin",
    name: pluginName,
  });

  const oldValues = await pluginStore.get({ key });
  const newValue = Object.assign({}, oldValues, newValues);

  return pluginStore.set({ key: key, value: newValue });
};

/**
 * Grants database `permissions` table that role can access an endpoint/controllers
 *
 * @param {int} roleID, 1 Authenticated, 2 Public, etc
 * @param {string} modelUID e.g. api::restaurant.restaurant
 * @param {string} route, route which should be granted access to if enabled is true
 * @param {boolean} enabled, default true
 * @param {string} policy, default ''
 */
const grantPrivilege = async (
  roleID,
  modelUID,
  route,
  enabled = true,
  policy = ""
) => {
  const service = strapi.plugin("users-permissions").service("role");

  const role = await service.findOne(roleID);

  const [modelID, modelName] = modelUID.split(".")

  _.set(role.permissions[modelID].controllers[modelName], route, { enabled, policy })

  return service.updateRole(roleID, role);
};

/** Updates database `permissions` that role can access an endpoint
 * @see grantPrivilege
 */

const grantPrivileges = async (roleID = 1, modelUID, routes = []) => {
  await Promise.all(routes.map((route) => grantPrivilege(roleID, modelUID, route)));
};

/* Usage:

  await grantPrivileges(user.role.id,
    "api::restaurant.restaurant",
    [
      'create'
    ]
  )
*/

module.exports = { setupStrapi, cleanupStrapi, grantPrivileges };

