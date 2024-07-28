'use strict';

const instructionHelper = require('./helper.js');

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
    console.log('got data', data)
    if (data.phoneNumber) {
      console.log('got phone number')
      return instructionHelper.requestApproval({phoneNumber: data.phoneNumber, instruction});
    }
    if (data.userId) {
      user = await strapi.entityService.findOne('plugin::users-permissions.user', data.userId);
      if (user) {
        return instructionHelper.approveInstruction(user, instruction);
      }
    } 
    return {
      success: false,
      message: "Something went wrong"
    };
  }
  

}));