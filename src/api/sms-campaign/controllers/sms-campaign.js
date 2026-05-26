'use strict';
/**
 * sms-campaign controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

/** Format a single poll option into its SMS display string.
 *  e.g. { label:'A', date:'June 1st', time:'11am', text_option:'Main Garden' }
 *  →  "A: June 1st @ 11am - Main Garden"
 */
const formatPollOption = (o) => {
  const dateTime = o.date && o.time ? `${o.date} @ ${o.time}` : (o.date || o.time || '');
  const parts    = [dateTime, o.text_option || o.location].filter(Boolean);
  return `${o.label?.toUpperCase()}: ${parts.join(' - ')}`;
};

const buildPollSms = (body, poll_options = []) => {
  if (!poll_options.length) return body;
  const lines = poll_options.map(formatPollOption);
  return `${body}\nReply with your letter selection:\n${lines.join('\n')}`;
};

module.exports = createCoreController('api::sms-campaign.sms-campaign', ({strapi}) => ({

  getByGarden: async ctx => {
    
    const entries = await strapi.entityService.findMany('api::sms-campaign.sms-campaign', {
      sort: {createdAt: 'desc'},
      filters: {
        garden: {
          slug: ctx.params.slug,
        }
      },
      populate: ['sent', 'confirmed', 'option_a', 'option_b', 'option_c', 'option_d'],
    });
    // console.log(entries)
    try {
      ctx.body = entries;
    } catch (err) {
      ctx.body = err;
    }


  },

  testSms: async ctx => {
    try {
      console.log("test params: ", ctx.params, ctx.request.body);
      const {body, interest, garden, type, poll_options, closes_at, send_reminder, sender, alert} = ctx.request.body;
      if (!garden) {
        return {error:"Garden is missing."}
      }
      const gardenObj = await strapi.db.query('api::garden.garden').findOne({
        where: {id: garden},
        populate: ['volunteers']
      });

      const vGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(gardenObj,interest);

      const response = {
        copy: body,
        numVolunteers: vGroup.length,
        interest,
        type,
      };

      if (type === 'poll') {
        response.poll_options = poll_options || [];
        response.closes_at    = closes_at    || null;
        response.send_reminder = send_reminder !== undefined ? send_reminder : true;
        response.alert        = alert         || false;
        response.sender       = sender        || null;

        // Preview the SMS body each recipient would receive
        response.preview_sms = buildPollSms(body, poll_options || []);
      }

      return response;

    } catch (err) {
      console.log(err);
      return {error:"Failed to load this SMS Campaign. Garden related."}
    }
  },

  groupSms: async ctx => {
    console.log("Endpoint triggered group SMS");
    const {body, interest, garden, type, sender, alert, poll_options, closes_at, send_reminder} = ctx.request.body;

    const gardenObj = await strapi.db.query('api::garden.garden').findOne({
      where: {id: garden},
      populate: ['volunteers']
    });

    const vGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(gardenObj,interest);

    // For polls, append the formatted options block to the SMS body
    const smsCopy = type === 'poll' ? buildPollSms(body, poll_options || []) : body;

    const sentInfo = await strapi.service('api::sms-campaign.sms-campaign').sendGroupMsg(vGroup, smsCopy, gardenObj, {
      type,
      sender,
      alert,
      poll_options,
      closes_at,
      send_reminder,
    });

    return sentInfo;
  },

  closePoll: async ctx => {
    const { id } = ctx.params;
    try {
      const result = await strapi.service('api::sms-campaign.sms-campaign').closePoll(Number(id));
      ctx.body = result;
    } catch (err) {
      ctx.status = 400;
      ctx.body = { error: err.message };
    }
  },

}));
