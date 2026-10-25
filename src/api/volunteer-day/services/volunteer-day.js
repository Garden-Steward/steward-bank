'use strict';
const SmsOptOut = require('../../../utils/sms-opt-out');


/**
 * volunteer-day service
 */

const { withoutMuted } = require('../../../utils/garden-mute');
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

    return withoutMuted(volGroup, vDay.garden);
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

  async sendGroupMsg(vDay, copy, opts = {}) {

    console.log("sendGroupMsg", copy);

    let volGroup = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);

    let sentInfo = [];
    const sentUsers = [];

    // TODO: Have there been any SMS campaigns for this volunteer day?
    // Check deny list of SMS Campaigns before sending


    for (const volunteer of volGroup) {
      // Opted out of texts: skip, but they stay in the garden and on email.
      if (SmsOptOut.isOptedOut(volunteer)) { continue; }
      try {
        const r = await strapi.service('api::sms.sms').send({
          to: volunteer.phoneNumber, body: copy, garden: vDay?.garden, user: volunteer,
          category: opts.category, source: opts.source, throwOnError: true,
        });
        if (r.blocked) { continue; }
        sentInfo.push(volunteer.phoneNumber);
        sentUsers.push(volunteer);
      } catch (err) {
        // Never remove garden membership on a send error.
        await SmsOptOut.handleSendError(volunteer, err);
        continue;
      }
    }
    try {
    await strapi.db.query('api::sms-campaign.sms-campaign').create({
      data: {
        publishedAt: null, sent: sentUsers, volunteer_day: vDay.id, body: copy, garden: vDay.garden.id, type: 'volunteer-day'
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
