'use strict';

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // Check for duplicate volunteer day with same startDatetime and garden
    if (data.startDatetime) {
      const duplicateFilters = {
        startDatetime: data.startDatetime,
      };

      let gardenId = null;
      if (data.garden) {
        if (typeof data.garden === 'object') {
          gardenId = data.garden.id || (data.garden.connect && data.garden.connect[0]?.id);
        } else {
          gardenId = data.garden;
        }
      }

      if (gardenId) {
        duplicateFilters.garden = {
          id: gardenId
        };
      }

      const existingEvent = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
        where: duplicateFilters,
      });

      if (existingEvent) {
        throw new Error('A volunteer day with the same start date/time already exists' +
          (gardenId ? ' for this garden' : '') + '.');
      }
    }

    // Auto-extract album ID from URL if provided
    if (data.photo_album_url && !data.photo_album_id) {
      const volunteerDayService = strapi.service('api::volunteer-day.volunteer-day');
      data.photo_album_id = await volunteerDayService.extractAlbumId(data.photo_album_url);
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;

    // Auto-extract album ID from URL if changed
    if (data.photo_album_url) {
      const volunteerDayService = strapi.service('api::volunteer-day.volunteer-day');
      data.photo_album_id = await volunteerDayService.extractAlbumId(data.photo_album_url);
    }
  }
};
