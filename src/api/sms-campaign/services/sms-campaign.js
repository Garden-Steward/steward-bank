'use strict';
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);

const { addHours, differenceInDays } = require('date-fns');

/**
 * sms-campaign service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::sms-campaign.sms-campaign', ({ strapi }) =>  ({

  /**
   * 
   * @param {obj} user 
   * @param {array} typeArr - array of types to search for
   * @returns obj - latest SMS Campaign with confirmations concatenated
   */
  async getLatestCampaign(user, typeArr) {

    const lastCampaigns = await strapi.db.query('api::sms-campaign.sms-campaign').findMany({
      where : {
        $and: [
          {type: {$in: typeArr}},
          {sent: user.id },
        ]
      },
      limit: 1,
      orderBy: {createdAt: 'desc'},
      populate: {sent: true, confirmed: true, volunteer_day: true, sender: true, option_a: true, option_b: true, option_c: true, option_d: true},
    });
    return lastCampaigns[0];

  },

  async getUserVdayStatus(user, volunteerDay) {
    // TODO: Find out if a user has confirmed or denied going to a volunteer day
  },

  async confirmSMSCampaign(user) {
    console.log("validateSMSCampaign")
    const lastCampaign = await strapi.service('api::sms-campaign.sms-campaign').getLatestCampaign(user, ['rsvp', 'volunteer-day']);
    
    if (!lastCampaign) {
      return {body: "Glad you're down, but I don't have anything to update for you...", type: "reply"}
    }
 
    if (lastCampaign.confirmed.find((c)=> c.id == user.id)) {
      return {body: "Already got you boo!", type: "reply"}
    } else {
      lastCampaign.confirmed.push(user.id)
      try {
        await strapi.entityService.update('api::sms-campaign.sms-campaign', lastCampaign.id, {
          data: {
            confirmed: lastCampaign.confirmed
          }
        });
        // Let the Sender know about the RSVP if Alert requested.
        await strapi.service('api::sms-campaign.sms-campaign').sendRSVPAlert(user, lastCampaign);
        
      } catch (err) {
        console.error(err);
      }

      return {body: "Yes! Glad you're coming!", type: "complete"}
    }
  },

  /**
   * Record or change a user's vote on the latest poll campaign sent to them.
   * @param {obj} user
   * @param {string} letter - 'a' | 'b' | 'c' | 'd'
   */
  async recordPollVote(user, letter) {
    const lastCampaign = await strapi.service('api::sms-campaign.sms-campaign').getLatestCampaign(user, ['poll']);

    if (!lastCampaign) {
      return {body: "No active poll found for you.", type: "reply"};
    }

    // Respect closes_at if set; otherwise allow 30-day window
    if (lastCampaign.closes_at) {
      if (new Date() > new Date(lastCampaign.closes_at)) {
        return {body: "Sorry, that poll has already closed!", type: "reply"};
      }
    } else {
      const daysDiff = differenceInDays(new Date(), new Date(lastCampaign.createdAt));
      if (daysDiff > 30) {
        return {body: "No active poll found for you.", type: "reply"};
      }
    }

    // Validate the letter maps to a real option
    const option = (lastCampaign.poll_options || []).find(
      o => o.label?.toLowerCase() === letter
    );
    if (!option) {
      const validLabels = (lastCampaign.poll_options || [])
        .map(o => o.label?.toUpperCase())
        .join(', ');
      return {body: `That's not a valid option. Reply with: ${validLabels}`, type: "reply"};
    }

    const targetField = `option_${letter}`;
    const allOptionFields = ['option_a', 'option_b', 'option_c', 'option_d'];
    const updateData = {};

    // Check if already voting for this exact option
    const alreadyVoted = (lastCampaign[targetField] || []).some(u => u.id === user.id);
    if (alreadyVoted) {
      const dateStr  = option.date     ? ` — ${option.date}`        : '';
      const timeStr  = option.time     ? ` at ${option.time}`       : '';
      const locStr   = option.location ? ` @ ${option.location}`    : '';
      return {body: `You're already voting for ${letter.toUpperCase()}${dateStr}${timeStr}${locStr}!`, type: "reply"};
    }

    // Remove user from any other option they previously voted for
    for (const field of allOptionFields) {
      if (field === targetField) continue;
      const existing = lastCampaign[field] || [];
      if (existing.some(u => u.id === user.id)) {
        updateData[field] = existing.filter(u => u.id !== user.id).map(u => u.id);
      }
    }

    // Add user to the chosen option
    updateData[targetField] = [...(lastCampaign[targetField] || []).map(u => u.id), user.id];

    try {
      await strapi.entityService.update('api::sms-campaign.sms-campaign', lastCampaign.id, {
        data: updateData
      });
    } catch (err) {
      console.error('recordPollVote error:', err);
      return {body: "Sorry, there was an issue recording your vote.", type: "reply"};
    }

    const dateStr  = option.date     ? ` — ${option.date}`     : '';
    const timeStr  = option.time     ? ` at ${option.time}`    : '';
    const locStr   = option.location ? ` @ ${option.location}` : '';
    return {body: `Vote recorded for ${letter.toUpperCase()}${dateStr}${timeStr}${locStr}. Thanks!`, type: "complete"};
  },

  sendGroupMsg: async (volGroup, copy, gardenObj, params) => {

    console.log("sendGroupMsg on SMS Campaign: \n", copy);
  
    let sentInfo = [];
  
    for (const volunteer of volGroup) {
      if (!volunteer.phoneNumber) { continue; }
      try {
        await client.messages
          .create({
            body: copy,
            from: twilioNum,
            to: volunteer.phoneNumber
          });
        sentInfo.push(volunteer.phoneNumber);
      } catch (err) {
        await strapi.service('api::garden.garden').unsubscribeUser(volunteer);
        console.log("send error:", err);
        continue;
      }
    }
    console.log('done sending');
    try {
      await strapi.db.query('api::sms-campaign.sms-campaign').create({
        data: {
          publishedAt: null,
          sent: volGroup,
          body: copy,
          garden: gardenObj.id,
          type: params.type,
          sender: params.sender,
          alert: params.alert,
          ...(params.poll_options && { poll_options: params.poll_options }),
          ...(params.closes_at   && { closes_at:    params.closes_at }),
        }
      });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }
  
    return sentInfo
  },

  async sendRSVPAlert(user, campaign) {

    if (!campaign.alert) {
      return;
    }

    if (!campaign.sender) {
      console.error('no sender on sendRSVPAlert');
      return
    }
    strapi.service('api::sms.sms').handleSms(
      {
        task: null,
        body: `We just received an RSVP from ${user.firstName} ${user.lastName}! RSVP count: ${campaign.confirmed.length}.`,
        type: 'followup',
        previous: null,
        user: campaign.sender
      }
    );

  },

  // async sendGardenInterestMsg(garden, copy, interest) {

  //   console.log("sendGroupMsg", copy);

  //   let volGroup = await strapi.service('api::user-garden-interest.user-garden-interest').getUsersOfInterest(garden, interest);

  //   let sentInfo = [];
    
  //   for (const volunteer of volGroup) {
  //     await client.messages
  //       .create({
  //         body: copy,
  //         from: twilioNum,
  //         to: volunteer.phoneNumber
  //       });
  //     sentInfo.push(volunteer.phoneNumber);
  //   }
  //   try {
  //   await strapi.db.query('api::sms-campaign.sms-campaign').create({
  //     data: {
  //       publishedAt: null, sent: volGroup, volunteer_day: vDay.id, body: copy, garden: vDay.garden.id
  //     }
  //   });
  //   } catch (err) {
  //     console.warn('Could not save sms campaign: ', err);
  //   }

  //   return sentInfo
  // },

}));