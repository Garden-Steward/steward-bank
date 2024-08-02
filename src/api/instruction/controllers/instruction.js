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
    const authUser = ctx.state.user;
    if (!authUser) {
      console.log('got phone number')
      return instructionHelper.requestApproval({phoneNumber: data.phoneNumber, userId: data.userId, instruction});
    } else {
      return instructionHelper.approveInstruction(user, instruction);
    }
  }
  

}));