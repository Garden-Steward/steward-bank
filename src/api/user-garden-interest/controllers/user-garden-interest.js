'use strict';

/**
 * user-garden-interest controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

// module.exports = createCoreController('');

module.exports = createCoreController('api::user-garden-interest.user-garden-interest', ({ strapi }) => ({

  async clearGardenTemp(ctx) {
    const { gardenId, tempId } = ctx.request.body;
    if (!gardenId) { return false; }
    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: {id: gardenId}
    });
    let temporary = await strapi.query('api::interest.interest').findOne({ where: {tag: 'Temporary'} });
    // console.log('temp: ', temporary, temporary.id, gardenId)
    let deleteInterest = await strapi.query('api::user-garden-interest.user-garden-interest').findMany({ where: { 
      garden: {
        id: gardenId
      }, interest: {
        id: temporary.id 
      } 
    }});

    for (let di of deleteInterest) {
      await strapi.query("api::user-garden-interest.user-garden-interest")
      .delete({ where: { id: di.id } });
    }

    return true;

  }
}));
