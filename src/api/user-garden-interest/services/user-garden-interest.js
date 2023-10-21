'use strict';

/**
 * user-garden-interest service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::user-garden-interest.user-garden-interest', ({ strapi }) =>  ({

  async getUsersOfInterest(garden,interest) {
    let volGroup = garden.volunteers
    if (interest && interest !== "Everyone") {
      let volInterests = await strapi.db.query('api::user-garden-interest.user-garden-interest').findMany({
        where: {
          garden: garden.id
        },
        populate: {
          interest: {
            where: {
              tag: interest
            }
          },
          user: true
        },
        garden: true
      });
      volInterests = volInterests.filter(vi=> vi.interest)
      volGroup = volInterests.map(vi=> {return vi.user})
    }
    return volGroup
  },

}));


