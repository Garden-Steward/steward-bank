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
    let user;
    if (data.phoneNmber) {
      // TODO: Text User - do they approve of the instruction? But only if they're a registered user tied to the garden.
      // do not approve task
      return instructionHelper.requestApproval(data.phoneNumber, instruction);
    }
    if (data.userId) {
      user = await strapi.entityService.findOne('plugin::users-permissions.user', data.userId);
    } 
    
    if (!user) {
      return {
        success: false,
        message: "User not found"
      };
    }
    try {
      await strapi.entityService.update('plugin::users-permissions.user', data.userId, {
        data: {"instructions" : {"connect": [instruction.id]}}
      });

      // TODO: Send an SMS to the user that they have accepted the instruction, title
      strapi.service('api::sms.sms').handleSms({
        task: null, 
        body: 
        `You're now qualified to handle ${instruction.title}! Thanks for being involved!`,
        type: 'followup',
        previous: null,
        user
      });    

    } catch (err) { 
      console.warn(err);
      return false;history
    }
    
    return true;
  }

}));