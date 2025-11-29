'use strict';

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    
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

