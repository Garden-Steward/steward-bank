'use strict';

/**
 * project service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::project.project', ({ strapi }) => ({
  // Custom service methods
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
  }
}));

