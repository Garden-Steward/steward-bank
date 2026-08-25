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

  /**
   * Every row of a garden document that shares its documentId, i.e. both the
   * draft and the published version.
   *
   * Strapi v5 keeps those as two separate rows with two separate ids, and a
   * volunteer joining a garden is linked to whichever single row the caller
   * happened to be holding. An event, meanwhile, resolves its `garden` relation
   * to one specific row. When those two rows disagree the event sees an empty
   * volunteer list and the reminder silently goes to nobody, which is exactly
   * what happened after the v4 -> v5 upgrade.
   *
   * @param {obj} garden populated garden relation off an event
   * @returns {arr} deduped volunteers across every version of that garden
   */
  async getGardenVolunteers(garden) {
    if (!garden) {
      return [];
    }

    let gardenRows = [garden];

    if (garden.documentId) {
      const rows = await strapi.db.query('api::garden.garden').findMany({
        where: { documentId: garden.documentId },
        populate: ['volunteers'],
      });
      if (rows?.length) {
        gardenRows = rows;
      }
    }

    const byId = new Map();
    for (const row of gardenRows) {
      for (const volunteer of row.volunteers || []) {
        if (volunteer?.id) {
          byId.set(volunteer.id, volunteer);
        }
      }
    }

    return [...byId.values()];
  },

  async getVolunteerGroup(vDay) {
    if (!vDay?.garden) {
      console.warn(`getVolunteerGroup: volunteer-day ${vDay?.id} has no garden, nobody to text`);
      return [];
    }

    let volGroup = await this.getGardenVolunteers(vDay.garden);

    if (vDay.interest && vDay.interest !== "Everyone") {
      // Interests are linked to a garden row too, so match on every version of
      // the garden document for the same reason getGardenVolunteers does.
      const gardenIds = await this.getGardenRowIds(vDay.garden);
      let volInterests = await strapi.db.query('api::user-garden-interest.user-garden-interest').findMany({
        where: {
          garden: { id: { $in: gardenIds } }
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

      const byId = new Map();
      for (const vi of volInterests) {
        if (vi.user?.id) {
          byId.set(vi.user.id, vi.user);
        }
      }
      volGroup = [...byId.values()];
    }

    return volGroup
  },

  /**
   * Ids of every row belonging to a garden document (draft and published).
   * @param {obj} garden
   * @returns {arr} numeric row ids
   */
  async getGardenRowIds(garden) {
    if (!garden) {
      return [];
    }
    if (!garden.documentId) {
      return [garden.id];
    }
    const rows = await strapi.db.query('api::garden.garden').findMany({
      where: { documentId: garden.documentId },
      select: ['id'],
    });
    return rows?.length ? rows.map(r => r.id) : [garden.id];
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
