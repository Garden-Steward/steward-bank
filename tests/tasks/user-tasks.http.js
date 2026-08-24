'use strict';

const request = require('supertest');
const { grantPrivileges } = require('../helpers/strapi');

/**
 * GET /api/garden-tasks/user — the authenticated user's active tasks across
 * every garden they volunteer in.
 */
describe('GET /garden-tasks/user', () => {
  const PREFIX = `usertasks${Date.now()}`;
  const userQuery = () => strapi.db.query('plugin::users-permissions.user');
  const gardenQuery = () => strapi.db.query('api::garden.garden');
  const taskQuery = () => strapi.db.query('api::garden-task.garden-task');

  const created = { users: [], gardens: [], tasks: [] };
  let user, otherUser, garden, jwt;

  const makeUser = async (tag) => {
    const u = await userQuery().create({
      data: {
        username: `${PREFIX}-${tag}`,
        email: `${PREFIX}-${tag}@strapi.com`,
        firstName: tag,
        provider: 'local',
        confirmed: true,
        role: 1,
      },
    });
    created.users.push(u.id);
    return u;
  };

  const makeTask = async ({ status, volunteer, title }) => {
    const t = await taskQuery().create({
      data: {
        title,
        status,
        type: 'Water',
        garden: garden.id,
        volunteers: [volunteer.id],
        publishedAt: new Date(),
      },
    });
    created.tasks.push(t.id);
    return t;
  };

  beforeAll(async () => {
    user = await makeUser('mine');
    otherUser = await makeUser('theirs');

    garden = await gardenQuery().create({
      data: { title: `${PREFIX} Garden`, sms_slug: `${PREFIX}-slug`, publishedAt: new Date() },
    });
    created.gardens.push(garden.id);

    // Custom routes are permission-gated like any other; grant it to Authenticated.
    await grantPrivileges(1, 'api::garden-task.garden-task', ['userTasks']);

    jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });
  });

  afterAll(async () => {
    if (created.tasks.length) await taskQuery().deleteMany({ where: { id: { $in: created.tasks } } });
    if (created.gardens.length) await gardenQuery().deleteMany({ where: { id: { $in: created.gardens } } });
    if (created.users.length) await userQuery().deleteMany({ where: { id: { $in: created.users } } });
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(strapi.server.httpServer).get('/api/garden-tasks/user');
    expect([401, 403]).toContain(res.status);
  });

  it('returns the caller\'s active tasks and not another volunteer\'s', async () => {
    const mine = await makeTask({ status: 'STARTED', volunteer: user, title: `${PREFIX} mine` });
    await makeTask({ status: 'STARTED', volunteer: otherUser, title: `${PREFIX} theirs` });

    const res = await request(strapi.server.httpServer)
      .get('/api/garden-tasks/user')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((t) => t.id);
    expect(ids).toContain(mine.id);

    const titles = res.body.data.map((t) => t.title);
    expect(titles).not.toContain(`${PREFIX} theirs`);
  });

  it('excludes tasks that are no longer active', async () => {
    const finished = await makeTask({ status: 'FINISHED', volunteer: user, title: `${PREFIX} done` });

    const res = await request(strapi.server.httpServer)
      .get('/api/garden-tasks/user')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.id)).not.toContain(finished.id);
  });

  it('resolves the route ahead of the core :id handler', async () => {
    // "/garden-tasks/user" must not be parsed as findOne with id="user".
    const res = await request(strapi.server.httpServer)
      .get('/api/garden-tasks/user')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('populates the garden each task belongs to', async () => {
    await makeTask({ status: 'PENDING', volunteer: user, title: `${PREFIX} pending` });

    const res = await request(strapi.server.httpServer)
      .get('/api/garden-tasks/user')
      .set('Authorization', `Bearer ${jwt}`);

    const task = res.body.data.find((t) => t.title === `${PREFIX} pending`);
    expect(task).toBeDefined();
    expect(task.garden).toBeTruthy();
    expect(task.garden.id).toBe(garden.id);
  });
});
