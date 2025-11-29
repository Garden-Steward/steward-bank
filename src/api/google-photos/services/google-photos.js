'use strict';

const { google } = require('googleapis');
const axios = require('axios');

module.exports = {
  /**
   * Get OAuth2 client
   * Requires environment variables:
   * - GOOGLE_CLIENT_ID
   * - GOOGLE_CLIENT_SECRET
   * - GOOGLE_REDIRECT_URI
   */
  getOAuth2Client() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:1337/api/google-photos/oauth-callback'
    );
  },

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthUrl() {
    const oauth2Client = this.getOAuth2Client();
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
      prompt: 'consent' // Force consent screen to get refresh token
    });
  },

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code) {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Verify the token has the required scope
    if (tokens.scope && !tokens.scope.includes('https://www.googleapis.com/auth/photoslibrary.readonly')) {
      console.warn('Warning: Token may not have photoslibrary.readonly scope');
      console.warn('Granted scopes:', tokens.scope);
    }
    
    return tokens;
  },

  /**
   * Verify token has required scope
   */
  async verifyTokenScope(accessToken) {
    try {
      // Try a simple API call to verify scope
      const response = await axios.get('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        params: {
          access_token: accessToken
        }
      });
      
      // Scope can be a string or array
      const scopeValue = response.data.scope;
      const scopes = typeof scopeValue === 'string' 
        ? scopeValue.split(' ') 
        : (Array.isArray(scopeValue) ? scopeValue : []);
      
      const hasRequiredScope = scopes.includes('https://www.googleapis.com/auth/photoslibrary.readonly');
      
      return {
        valid: hasRequiredScope,
        scopes: scopes,
        expiresIn: response.data.expires_in,
        rawScope: scopeValue
      };
    } catch (error) {
      console.error('Error verifying token scope:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  },

  /**
   * List all albums accessible by the authenticated user
   */
  async listAlbums(accessToken) {
    try {
      const response = await axios.get('https://photoslibrary.googleapis.com/v1/albums', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          pageSize: 50
        }
      });

      const albums = response.data?.albums || [];
      
      return albums.map(album => ({
        id: album.id,
        title: album.title,
        productUrl: album.productUrl,
        coverPhotoUrl: album.coverPhotoBaseUrl,
        mediaItemsCount: album.mediaItemsCount,
        isWriteable: album.isWriteable
      }));
    } catch (error) {
      console.error('Error listing albums:', error.response?.data || error.message);
      console.error('Full error:', JSON.stringify(error.response?.data, null, 2));
      
      // Provide more helpful error messages
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Token may be expired or invalid. Please re-authenticate.');
      } else if (error.response?.status === 403) {
        const errorMessage = error.response?.data?.error?.message || 'Insufficient permissions';
        throw new Error(`Insufficient permissions: ${errorMessage}. Please check that the Photos Library API is enabled and you have granted the required scope.`);
      }
      
      throw new Error(`Failed to list albums: ${error.response?.data?.error?.message || error.message}`);
    }
  },

  /**
   * List media items from a shared album
   * Note: This requires the album owner to authenticate and share the album
   */
  async listAlbumPhotos(albumId, accessToken) {
    try {
      // Search for media items in the album using REST API
      const response = await axios.post(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        {
          albumId: albumId,
          pageSize: 100
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const mediaItems = response.data?.mediaItems || [];
      
      return mediaItems.map(item => ({
        id: item.id,
        filename: item.filename,
        mimeType: item.mimeType,
        baseUrl: item.baseUrl,
        width: item.mediaMetadata?.width,
        height: item.mediaMetadata?.height,
        creationTime: item.mediaMetadata?.creationTime,
        description: item.description
      }));
    } catch (error) {
      console.error('Error fetching album photos:', error.response?.data || error.message);
      throw new Error(`Failed to fetch album photos: ${error.response?.data?.error?.message || error.message}`);
    }
  },

  /**
   * Download photo from Google Photos and upload to Strapi
   */
  async importPhotoToStrapi(photoId, baseUrl, filename, mimeType, accessToken) {
    try {
      // Download the photo using the baseUrl with =d parameter for download
      const downloadUrl = baseUrl.includes('=') ? baseUrl : `${baseUrl}=d`;
      
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      // Upload to Strapi using the upload plugin
      const uploadService = strapi.plugin('upload').service('upload');
      
      // Create a file-like object for Strapi (expects stream or buffer)
      // Strapi's upload service expects files in a format similar to multipart/form-data
      const fileData = {
        stream: response.data,
        filename: filename,
        mimetype: mimeType || response.headers['content-type'] || 'image/jpeg',
        size: parseInt(response.headers['content-length'] || '0', 10)
      };

      const uploadedFiles = await uploadService.upload({
        data: {},
        files: fileData
      });

      return uploadedFiles[0];
    } catch (error) {
      console.error('Error importing photo to Strapi:', error);
      throw new Error(`Failed to import photo: ${error.message}`);
    }
  },

  /**
   * Import multiple photos to Strapi
   */
  async importPhotosToStrapi(photos, accessToken) {
    const uploadedFiles = [];
    const errors = [];
    
    for (const photo of photos) {
      try {
        const uploaded = await this.importPhotoToStrapi(
          photo.id,
          photo.baseUrl,
          photo.filename,
          photo.mimeType,
          accessToken
        );
        uploadedFiles.push(uploaded);
      } catch (error) {
        console.error(`Failed to import photo ${photo.id}:`, error);
        errors.push({ photoId: photo.id, error: error.message });
        // Continue with other photos
      }
    }
    
    return {
      uploadedFiles,
      errors: errors.length > 0 ? errors : undefined
    };
  }
};

