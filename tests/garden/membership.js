/**
 * Garden member menu: membership state, mute, leave. Muting drops the user
 * from the garden's group texts without touching membership.
 */
const request = require('supertest');
const { grantPrivileges } = require('../helpers/strapi');

describe('Garden membership: mute and leave', function () {
  let member, manager, garden, memberJwt, managerJwt;
  const userQuery = () => strapi.db.query('plugin::users-permissions.user');
  const api = () => request(strapi.server.httpServer);

  beforeAll(async () => {
    await grantPrivileges(1, 'api::garden.garden', ['membership', 'setMute', 'leave']);
    const make = (name) => userQuery().create({
      data: { username: name, email: `${name}@example.com`, provider: 'local', confirmed: true, role: 1, firstName: name },
    });
    member = await make('mute-member');
    manager = await make('mute-manager');
    garden = await strapi.documents('api::garden.garden').create({
      data: {
        title: 'Mute Garden', slug: 'mute-garden', sms_slug: 'mutegarden',
        volunteers: [member.documentId, manager.documentId], managers: [manager.documentId],
      },
      status: 'published',
    });
    await userQuery().update({ where: { id: member.id }, data: { activeGarden: (await strapi.db.query('api::garden.garden').findOne({ where: { slug: 'mute-garden' } })).id } });
    const jwt = strapi.plugins['users-permissions'].services.jwt;
    memberJwt = jwt.issue({ id: member.id });
    managerJwt = jwt.issue({ id: manager.id });
  });

  const groupFor = async () => {
    const vDay = { id: 0, garden: await strapi.db.query('api::garden.garden').findOne({ where: { slug: 'mute-garden' } }) };
    return strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);
  };

  it('needs a signed-in user', async () => {
    await api().get('/api/gardens/mute-garden/membership').expect(403);
  });

  it('reports membership', async () => {
    const res = await api().get('/api/gardens/mute-garden/membership').set('Authorization', `Bearer ${memberJwt}`).expect(200);
    expect(res.body.data).toEqual({ member: true, manager: false, muted: false });
  });

  it('mute removes the member from group texts, unmute brings them back', async () => {
    let res = await api().post('/api/gardens/mute-garden/membership/mute')
      .set('Authorization', `Bearer ${memberJwt}`).send({ muted: true }).expect(200);
    expect(res.body.data.muted).toBe(true);
    expect((await groupFor()).map((u) => u.id)).not.toContain(member.id);
    expect((await groupFor()).map((u) => u.id)).toContain(manager.id);

    res = await api().post('/api/gardens/mute-garden/membership/mute')
      .set('Authorization', `Bearer ${memberJwt}`).send({ muted: false }).expect(200);
    expect(res.body.data.muted).toBe(false);
    expect((await groupFor()).map((u) => u.id)).toContain(member.id);
  });

  it('managers cannot leave from here', async () => {
    await api().post('/api/gardens/mute-garden/membership/leave').set('Authorization', `Bearer ${managerJwt}`).expect(400);
  });

  it('leave takes the member off the garden and clears their active garden', async () => {
    await api().post('/api/gardens/mute-garden/membership/mute')
      .set('Authorization', `Bearer ${memberJwt}`).send({ muted: true }).expect(200);
    const res = await api().post('/api/gardens/mute-garden/membership/leave').set('Authorization', `Bearer ${memberJwt}`).expect(200);
    expect(res.body.data).toEqual({ member: false, manager: false, muted: false });

    const after = await api().get('/api/gardens/mute-garden/membership').set('Authorization', `Bearer ${memberJwt}`).expect(200);
    expect(after.body.data.member).toBe(false);
    const u = await userQuery().findOne({ where: { id: member.id }, populate: ['activeGarden'] });
    expect(u.activeGarden).toBeNull();
    expect(u.muted_gardens).toEqual([]);
  });
});
