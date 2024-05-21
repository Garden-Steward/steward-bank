const Strapi = require("@strapi/strapi");
const fs = require("fs");

let instance;

async function setupStrapi() {
  if (!instance) {
    /** the following code in copied from `./node_modules/strapi/lib/Strapi.js` */
    await Strapi().load(); 
    instance = strapi; // strapi is global now
    await instance.server.mount();
  }
  return instance;
}

async function cleanupStrapi() {

  const dbSettings = strapi.config.get("database.connection");
  //close server to release the db-file
  await instance.destroy();
  await instance.server.destroy();

  //delete test database after all tests
  if (dbSettings && dbSettings.connection && dbSettings.connection.filename) {
    if (fs.existsSync(dbSettings.connection.filename)) {
      fs.unlinkSync(dbSettings.connection.filename);
    }
  }
}

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

