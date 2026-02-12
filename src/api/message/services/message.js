'use strict';

/**
 * message service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::message.message', ({ strapi }) =>  ({
  async validateQuestion(user) {
    const latestMessage = await strapi.db.query('api::message.message').findMany({
      orderBy: {'id': 'desc'},
      where: {
        user: user.id,
        type: {$in:['question','complete','registration']},
      },
      populate: ['garden_task', 'garden_task.recurring_task', 'garden_task.volunteers'],
      limit: 1
    });
    if (latestMessage[0]?.type=='question' || latestMessage[0]?.type=='registration') {
      return latestMessage[0];
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


