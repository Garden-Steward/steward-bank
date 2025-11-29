'use strict';

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    
    // Auto-extract album ID from URL if provided
    if (data.photo_album_url && !data.photo_album_id) {
      const projectService = strapi.service('api::project.project');
      data.photo_album_id = await projectService.extractAlbumId(data.photo_album_url);
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;
    
    // Auto-extract album ID from URL if changed
    if (data.photo_album_url) {
      const projectService = strapi.service('api::project.project');
      data.photo_album_id = await projectService.extractAlbumId(data.photo_album_url);
    }
  }
};

