'use strict';

module.exports = {
  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl(ctx) {
    try {
      // Check if service exists
      if (!strapi.service('api::google-photos.google-photos')) {
        throw new Error('Google Photos service not found. Make sure the service file exists.');
      }

      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      
      // Check if method exists
      if (!googlePhotosService.getAuthUrl) {
        throw new Error('getAuthUrl method not found in Google Photos service.');
      }

      const authUrl = googlePhotosService.getAuthUrl();
      
      if (!authUrl) {
        throw new Error('Failed to generate authorization URL. Check your Google OAuth credentials.');
      }
      
      ctx.send({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      console.error('Stack:', error.stack);
      ctx.throw(500, `Failed to generate authorization URL: ${error.message}`);
    }
  },

  /**
   * OAuth callback handler
   */
  async oauthCallback(ctx) {
    const { code } = ctx.query;
    
    if (!code) {
      return ctx.badRequest('Authorization code is required');
    }

    try {
      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      const tokens = await googlePhotosService.getTokens(code);
      
      // Store tokens securely (consider encrypting and storing in database)
      // For now, returning them - in production, store in user session or database
      // TODO: Implement secure token storage
      ctx.send({ 
        tokens,
        message: 'Authorization successful. Please store these tokens securely.'
      });
    } catch (error) {
      console.error('Error in OAuth callback:', error);
      ctx.throw(500, `Failed to exchange authorization code: ${error.message}`);
    }
  },

  /**
   * List all albums
   */
  async listAlbums(ctx) {
    const { accessToken } = ctx.request.body;
    
    if (!accessToken) {
      return ctx.badRequest('Access token is required');
    }

    try {
      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      const albums = await googlePhotosService.listAlbums(accessToken);
      
      ctx.send({ albums });
    } catch (error) {
      console.error('Error listing albums:', error);
      ctx.throw(500, `Failed to list albums: ${error.message}`);
    }
  },

  /**
   * List photos from an album
   */
  async listAlbumPhotos(ctx) {
    const { albumId } = ctx.params;
    const { accessToken } = ctx.request.body;
    
    if (!albumId || !accessToken) {
      return ctx.badRequest('Album ID and access token are required');
    }

    try {
      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      const photos = await googlePhotosService.listAlbumPhotos(albumId, accessToken);
      
      ctx.send({ photos });
    } catch (error) {
      console.error('Error listing album photos:', error);
      ctx.throw(500, `Failed to fetch album photos: ${error.message}`);
    }
  },

  /**
   * Verify token and show its scopes (for debugging)
   */
  async verifyToken(ctx) {
    const { accessToken } = ctx.request.body;
    
    if (!accessToken) {
      return ctx.badRequest('Access token is required');
    }

    try {
      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      const tokenInfo = await googlePhotosService.verifyTokenScope(accessToken);
      
      ctx.send({ 
        tokenInfo,
        message: tokenInfo.valid 
          ? 'Token has required scope' 
          : 'Token is missing required scope. Please re-authenticate.'
      });
    } catch (error) {
      console.error('Error verifying token:', error);
      ctx.throw(500, `Failed to verify token: ${error.message}`);
    }
  },

  /**
   * Import selected photos to Strapi
   */
  async importPhotos(ctx) {
    const { photos, accessToken } = ctx.request.body;
    
    if (!photos || !Array.isArray(photos) || !accessToken) {
      return ctx.badRequest('Photos array and access token are required');
    }

    if (photos.length === 0) {
      return ctx.badRequest('Photos array cannot be empty');
    }

    try {
      const googlePhotosService = strapi.service('api::google-photos.google-photos');
      const result = await googlePhotosService.importPhotosToStrapi(photos, accessToken);
      
      ctx.send({ 
        uploadedFiles: result.uploadedFiles,
        errors: result.errors,
        success: result.uploadedFiles.length,
        failed: result.errors ? result.errors.length : 0
      });
    } catch (error) {
      console.error('Error importing photos:', error);
      ctx.throw(500, `Failed to import photos: ${error.message}`);
    }
  }
};

