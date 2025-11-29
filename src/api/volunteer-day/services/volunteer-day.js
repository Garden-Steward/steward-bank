'use strict';
const accountSid = process.env.TWILIO_ACCOUNT_SID ;
const authToken = process.env.TWILIO_AUTH_TOKEN  ;
const twilioNum =process.env.TWILIONUM;
const client = require('twilio')(accountSid, authToken);


/**
 * volunteer-day service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::volunteer-day.volunteer-day', ({ strapi }) =>  ({

  async getVolunteerGroup(vDay) {
    let volGroup = vDay.garden.volunteers
    if (vDay.interest && vDay.interest !== "Everyone") {
      let volInterests = await strapi.db.query('api::user-garden-interest.user-garden-interest').findMany({
        where: {
          garden: vDay.garden.id
        },
        populate: {
          interest: {
            where: {
              tag: vDay.interest
            }
          },
          user: true
        },
        garden: true
      });
      volInterests = volInterests.filter(vi=> vi.interest)
      volGroup = volInterests.map(vi=> {return vi.user})
    }
    return volGroup
  },

  async sendGroupMsg(vDay, copy) {

    console.log("sendGroupMsg", copy);

    let volGroup = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);

    let sentInfo = [];
    
    // TODO: Have there been any SMS campaigns for this volunteer day?
    // Check deny list of SMS Campaigns before sending


    for (const volunteer of volGroup) {
      try {
        if (process.env.NODE_ENV === 'test') {
          console.log("sending to ", volunteer.phoneNumber, copy);
        } else {
          await client.messages
            .create({
            body: copy,
            from: twilioNum,
            to: volunteer.phoneNumber
          });
        }
        sentInfo.push(volunteer.phoneNumber);
      } catch (err) {
        await strapi.service('api::garden.garden').unsubscribeUser(volunteer);
        console.log("vday send error:", err);
        continue;
      }
    }
    try {
    await strapi.db.query('api::sms-campaign.sms-campaign').create({
      data: {
        publishedAt: null, sent: volGroup, volunteer_day: vDay.id, body: copy, garden: vDay.garden.id, type: 'volunteer-day'
      }
    });
    } catch (err) {
      console.warn('Could not save sms campaign: ', err);
    }

    return sentInfo
  },

  async extractAlbumId(albumUrl) {
    if (!albumUrl) return null;
    
    // Extract album ID from various Google Photos URL formats
    const patterns = [
      /albums\/([^/?]+)/,                    // photos.google.com/albums/ALBUM_ID
      /\/a\/([^/?]+)/,                        // photos.app.goo.gl/a/ALBUM_ID
      /album_id=([^&]+)/,                     // URL with album_id parameter
      /photos\.google\.com\/share\/([^/?]+)/, // photos.google.com/share/ALBUM_ID
      /share\/([^/?]+)/                       // /share/ALBUM_ID
    ];
    
    for (const pattern of patterns) {
      const match = albumUrl.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  },
}));
