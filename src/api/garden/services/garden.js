'use strict';

/**
 * garden service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::garden.garden');

module.exports = createCoreService('api::garden.garden', ({ strapi }) =>  ({
  async unsubscribeUser(user) {
    user.gardens = [];
    user.activeGarden = null;
    return strapi.db.query("plugin::users-permissions.user").update({where:{id: user.id}, data: user});
  }
}));

