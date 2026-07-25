'use strict';

/** Build the description portion of a poll option (no label prefix).
 *  e.g. { date:'June 1st', time:'11am', text_option:'Main Garden' }
 *  →  "June 1st @ 11am - Main Garden"
 */
const pollOptionDesc = (o) => {
  const dateTime = o.date && o.time ? `${o.date} @ ${o.time}` : (o.date || o.time || '');
  return [dateTime, o.text_option || o.location].filter(Boolean).join(' - ');
};

/** Format a single poll option into its full SMS display string.
 *  e.g. { label:'A', date:'June 1st', time:'11am', text_option:'Main Garden' }
 *  →  "A: June 1st @ 11am - Main Garden"
 */
const formatPollOption = (o) => `${o.label?.toUpperCase()}: ${pollOptionDesc(o)}`;

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
        await strapi.db.query('api::sms-campaign.sms-campaign').update({
          where: { id: lastCampaign.id },
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
   * Record votes on the latest poll campaign (Doodle / multi-select, add-only via SMS).
   * @param {obj}    user
   * @param {string} input - one or more letters, e.g. 'a', 'ab', 'a b', 'a,b'
   */
  async recordPollVote(user, input) {
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

    // Normalise and deduplicate letters from input ("A B", "A,B", "AB" → ['a','b'])
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];

    if (letters.length === 0) {
      const validLabels = (lastCampaign.poll_options || []).map(o => o.label?.toUpperCase()).join(', ');
      return {body: `That's not a valid option. Reply with: ${validLabels}`, type: "reply"};
    }

    // Validate every letter maps to a real poll option
    for (const letter of letters) {
      const found = (lastCampaign.poll_options || []).find(o => o.label?.toLowerCase() === letter);
      if (!found) {
        const validLabels = (lastCampaign.poll_options || []).map(o => o.label?.toUpperCase()).join(', ');
        return {body: `Option ${letter.toUpperCase()} doesn't exist. Valid: ${validLabels}`, type: "reply"};
      }
    }

    const updateData = {};
    const added     = [];
    const alreadyHad = [];

    for (const letter of letters) {
      const field   = `option_${letter}`;
      const current = lastCampaign[field] || [];
      if (current.some(u => u.id === user.id)) {
        alreadyHad.push(letter.toUpperCase());
      } else {
        updateData[field] = [...current.map(u => u.id), user.id];
        added.push(letter.toUpperCase());
      }
    }

    if (added.length > 0) {
      try {
        await strapi.db.query('api::sms-campaign.sms-campaign').update({
          where: { id: lastCampaign.id },
          data: updateData,
        });
      } catch (err) {
        console.error('recordPollVote error:', err);
        return {body: "Sorry, there was an issue recording your vote.", type: "reply"};
      }
    }

    // Build a summary of everything the user is now voting for
    const allOptionFields = ['option_a', 'option_b', 'option_c', 'option_d'];
    const nowVoting = [];
    for (const field of allOptionFields) {
      const letter     = field.split('_')[1];
      const wasAdded   = added.includes(letter.toUpperCase());
      const wasPresent = (lastCampaign[field] || []).some(u => u.id === user.id);
      if (wasAdded || wasPresent) {
        const opt = (lastCampaign.poll_options || []).find(o => o.label?.toLowerCase() === letter);
        const label = opt ? formatPollOption(opt) : letter.toUpperCase();
        nowVoting.push(label);
      }
    }

    if (added.length === 0) {
      return {
        body: `Already got you for ${alreadyHad.join(' & ')}! Currently voting: ${nowVoting.join(', ')}.`,
        type: "reply",
      };
    }

    const addedMsg    = `Added ${added.join(' & ')}.`;
    const alreadyMsg  = alreadyHad.length ? ` (Already had ${alreadyHad.join(', ')})` : '';
    const currentMsg  = `Voting for: ${nowVoting.join(', ')}.`;
    return {body: `${addedMsg}${alreadyMsg} ${currentMsg}`, type: "complete"};
  },

  /**
   * Send a 24-hour reminder to everyone on a poll who hasn't voted yet.
   * Runs hourly via cron; uses a 2-hour window to avoid double-sending.
   */
  async sendPollReminders() {
    const now         = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const campaigns = await strapi.db.query('api::sms-campaign.sms-campaign').findMany({
      where: {
        type: 'poll',
        send_reminder: { $eq: true },
        closes_at: { $gte: windowStart, $lte: windowEnd },
        $or: [{ reminder_sent: { $eq: false } }, { reminder_sent: { $null: true } }],
      },
      populate: { sent: true, option_a: true, option_b: true, option_c: true, option_d: true },
    });

    for (const campaign of campaigns) {
      // Collect all user IDs who have voted for any option
      const votedIds = new Set([
        ...(campaign.option_a || []).map(u => u.id),
        ...(campaign.option_b || []).map(u => u.id),
        ...(campaign.option_c || []).map(u => u.id),
        ...(campaign.option_d || []).map(u => u.id),
      ]);

      const nonVoters = (campaign.sent || []).filter(u => u.phoneNumber && !votedIds.has(u.id));

      // Build the options summary for the body
      const optionsLines = (campaign.poll_options || []).map(formatPollOption);
      const smsBody = optionsLines.length
        ? `Only 1 day left to vote!\n${optionsLines.join('\n')}\nReply with the date(s) that work for you.`
        : `Only 1 day left to vote! Reply with the date(s) that work for you.`;

      for (const user of nonVoters) {
        await strapi.service('api::sms.sms').handleSms({
          task: null,
          body: smsBody,
          type: 'followup',
          previous: null,
          user,
        });
      }

      await strapi.db.query('api::sms-campaign.sms-campaign').update({
        where: { id: campaign.id },
        data: { reminder_sent: true },
      });
    }

    return { remindersProcessed: campaigns.length };
  },

  /**
   * Auto-close any polls whose closes_at has passed and haven't been closed yet.
   * Called by cron; delegates to closePoll for each expired campaign.
   * @returns {obj} { closed: number }
   */
  async autoCloseExpiredPolls() {
    const now = new Date();

    const expired = await strapi.db.query('api::sms-campaign.sms-campaign').findMany({
      where: {
        type: 'poll',
        closes_at: { $lte: now },
        winner: { $null: true },
      },
    });

    let closed = 0;
    for (const poll of expired) {
      try {
        await strapi.service('api::sms-campaign.sms-campaign').closePoll(poll.id);
        closed++;
      } catch (err) {
        console.error(`autoCloseExpiredPolls: error closing poll ${poll.id}:`, err);
      }
    }

    return { closed };
  },

  /**
   * Close a poll, record the winner, and SMS the sender with results + manage link.
   * @param {number} campaignId
   * @returns {obj} { winner, totalVotes, tally }
   */
  async closePoll(campaignId) {
    const campaign = await strapi.db.query('api::sms-campaign.sms-campaign').findOne({
      where: { id: campaignId },
      populate: { sender: true, garden: true, option_a: true, option_b: true, option_c: true, option_d: true, poll_options: true },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }
    if (campaign.type !== 'poll') {
      throw new Error(`Campaign ${campaignId} is not a poll`);
    }
    if (campaign.winner) {
      return { alreadyClosed: true, winner: campaign.winner };
    }

    // Tally votes
    const tally = {
      a: (campaign.option_a || []).length,
      b: (campaign.option_b || []).length,
      c: (campaign.option_c || []).length,
      d: (campaign.option_d || []).length,
    };
    const totalVotes = Object.values(tally).reduce((sum, n) => sum + n, 0);

    // Pick winner — highest count; ties go to earliest letter
    const winnerLetter = Object.entries(tally)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Stamp closes_at and winner on the campaign
    await strapi.db.query('api::sms-campaign.sms-campaign').update({
      where: { id: campaignId },
      data: {
        closes_at: new Date(),
        winner: winnerLetter ? winnerLetter.toUpperCase() : null,
      },
    });

    // Always notify the sender — even if nobody voted
    if (campaign.sender) {
      const gardenSlug = campaign.garden?.slug ?? '';
      const manageLink = `steward.garden/manage/gardens/${gardenSlug}`;
      let smsBody;

      if (!winnerLetter) {
        smsBody = `Poll closed with no votes. View: ${manageLink}`;
      } else {
        const winningOption = (campaign.poll_options || []).find(
          o => o.label?.toLowerCase() === winnerLetter
        );
        const winnerDesc = winningOption ? ` (${pollOptionDesc(winningOption)})` : '';
        const tallyLines = Object.entries(tally)
          .filter(([, count]) => count > 0)
          .map(([letter, count]) => `${letter.toUpperCase()}: ${count} vote${count !== 1 ? 's' : ''}`)
          .join(', ');
        smsBody = `Poll closed! Winner: ${winnerLetter.toUpperCase()}${winnerDesc} with ${tally[winnerLetter]} of ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}. Tally: ${tallyLines}. View: ${manageLink}`;
      }

      await strapi.service('api::sms.sms').handleSms({
        task: null,
        body: smsBody,
        type: 'followup',
        previous: null,
        user: campaign.sender,
      });
    }

    return { winner: winnerLetter?.toUpperCase() ?? null, totalVotes, tally };
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
          ...(params.poll_options                  && { poll_options:   params.poll_options }),
          ...(params.closes_at                    && { closes_at:      params.closes_at }),
          ...(params.send_reminder !== undefined  && { send_reminder:  params.send_reminder }),
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