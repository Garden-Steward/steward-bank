module.exports = ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename: env('DATABASE_FILENAME', '.tmp/test.db'),
    },
    useNullAsDefault: true,
    // SQLite allows a single writer. Knex defaults to a pool of 2-10, so the
    // schema migrations Strapi runs on boot race each other and throw
    // SQLITE_BUSY ("database is locked"). Pin the pool to one connection.
    pool: { min: 1, max: 1 },
    debug: false
  },
});
