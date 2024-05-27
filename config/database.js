
module.exports = ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'strapi'),
      
      // ssl: {
      //   rejectUnauthorized: env.bool('DATABASE_SSL_SELF', false), // For self-signed certificates
      // },
      ssl: false,
    },
    debug: false,
    acquireConnectionTimeout: 1000000,
    options: {
      pool: {
          min: 1,
          max: 5,
          acquireTimeoutMillis: 900000,
          createTimeoutMillis: 900000,
          destroyTimeoutMillis: 900000,
      }
    },
  },
});
 