module.exports = ({ env }) => ({
  "users-permissions": {
    config: {
      jwtSecret: env('CUSTOM_JWT_SECRET'),
    }
  }
})