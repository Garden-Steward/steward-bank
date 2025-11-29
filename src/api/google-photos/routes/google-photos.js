module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/google-photos/auth-url',
      handler: 'google-photos.getAuthUrl',
      config: {
        auth: false, // Public access for OAuth initiation
        policies: [],
        middlewares: [],
      }
    },
    {
      method: 'GET',
      path: '/google-photos/oauth-callback',
      handler: 'google-photos.oauthCallback',
      config: {
        auth: false, // Public access for OAuth callback
        policies: [],
        middlewares: [],
      }
    },
    {
      method: 'POST',
      path: '/google-photos/verify-token',
      handler: 'google-photos.verifyToken',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      }
    },
    {
      method: 'POST',
      path: '/google-photos/albums',
      handler: 'google-photos.listAlbums',
      config: {
        auth: false, // Can be changed to require auth later
        policies: [],
        middlewares: [],
      }
    },
    {
      method: 'POST',
      path: '/google-photos/album/:albumId/photos',
      handler: 'google-photos.listAlbumPhotos',
      config: {
        auth: false, // Can be changed to require auth later
        policies: [],
        middlewares: [],
      }
    },
    {
      method: 'POST',
      path: '/google-photos/import',
      handler: 'google-photos.importPhotos',
      config: {
        auth: false, // Can be changed to require auth later
        policies: [],
        middlewares: [],
      }
    }
  ]
};

