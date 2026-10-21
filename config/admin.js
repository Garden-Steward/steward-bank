module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    // Replaces the deprecated auth.options.expiresIn (Strapi's default '30d'
    // still set both lifespans). Same 30-day values, in seconds.
    sessions: {
      maxRefreshTokenLifespan: 30 * 24 * 60 * 60,
      maxSessionLifespan: 30 * 24 * 60 * 60,
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
});
