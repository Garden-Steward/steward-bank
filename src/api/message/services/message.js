'use strict';

/**
 * message service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::message.message', ({ strapi }) =>  ({
  async validateQuestion(user) {
    console.log("validateQuestion")
    const latestMessage = await strapi.entityService.findMany('api::message.message', {
      sort: {'id': 'desc'},
      filters: {
        user: user.id, 
        type: {$in:['question','complete']},
      },
      populate: {'gardentask': true},
      limit: 1
    });
    // const latestMessage = await messageService.findOne({_sort: 'updatedAt:desc', user, type: {$in:['question','complete']}},['gardentask']);
    if (latestMessage[0].type=='question') {
      return latestMessage;
    } else { // type == complete
      // the user completed the last open question.
      return false;
    }
  },

  async getLastQuestion(user) {
    let lastQuestion = await strapi.db.query('api::message.message').findOne({
      where: {
        type: 'question',
        user: user.id
      },

    });
    console.log(this.lastQuestion)
    return lastQuestion;
  }
}));


