'use strict';

/**
 * instruction controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::instruction.instruction', ({ strapi }) => ({

  async approveTask(ctx) {
    // console.log("approve params: ", ctx.params, ctx.request.body);
    const { data } = ctx.request.body;
    const instruction = await strapi.db.query('api::instruction.instruction').findOne({
      where: {slug: data.slug}
    });
    const user = await strapi.entityService.findOne('plugin::users-permissions.user', data.userId);
    
    if (!user) {
      return ctx.notFound('User not found');
    }
    try {
      await strapi.entityService.update('plugin::users-permissions.user', data.userId, {
        data: {"instructions" : {"connect": [instruction.id]}}
      });

      // TODO: Send an SMS to the user that they have accepted the instruction, title
      strapi.service('api::sms.sms').handleSms(
        null, 
        `You're now qualified to handle ${instruction.title}! Thanks for being involved!`,
        'followup',
        null,
        user
      );    

    } catch (err) { 
      console.warn(err);
      return false;history
    }
    
    return true;
  }

}));