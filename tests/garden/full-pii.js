/**
 * GET /api/gardens/:slug/full serves the public garden page. Populated users
 * must never carry auth secrets.
 */
const request = require('supertest');
const { grantPrivileges } = require('../helpers/strapi');

describe('Garden full route: no user secrets', function () {
  beforeAll(async () => {
    const pub = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    await grantPrivileges(pub.id, 'api::garden.garden', ['fullSlug']);
    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        username: 'pii-volunteer', email: 'pii-volunteer@example.com', provider: 'local', confirmed: true,
        password: 'super-secret-password', resetPasswordToken: 'reset-token', confirmationToken: 'confirm-token',
        firstName: 'Pia',
      },
    });
    await strapi.documents('api::garden.garden').create({
      data: { title: 'PII Garden', slug: 'pii-garden', sms_slug: 'piigarden', volunteers: [user.documentId], managers: [user.documentId] },
      status: 'published',
    });
  });

  // Signed out, the garden page only counts people, so each one is just an id.
  it('gives signed-out callers user ids only: no secrets, no names', async () => {
    const res = await request(strapi.server.httpServer).get('/api/gardens/pii-garden/full').expect(200);
    const userModel = strapi.getModel('plugin::users-permissions.user');
    const privateFields = Object.entries(userModel.attributes).filter(([, a]) => a.private).map(([k]) => k);
    const people = [...res.body.data.volunteers, ...res.body.data.managers];
    expect(people.length).toBeGreaterThan(0);
    people.forEach((u) => {
      ['password', 'resetPasswordToken', 'confirmationToken', ...privateFields].forEach((f) => {
        expect(u[f]).toBeUndefined();
      });
      expect(u.firstName).toBeUndefined();
      expect(Object.keys(u)).toEqual(['id']);
    });
  });
});
