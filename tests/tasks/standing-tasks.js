const UID = 'api::day-sheet-standing-task.day-sheet-standing-task';
const resetStandingList = async () => {
  const row = await strapi.documents(UID).findFirst();
  if (row) await strapi.documents(UID).delete({ documentId: row.documentId });
};

describe('Standing task service', function () {
  const svc = () => strapi.service(UID);

  afterAll(resetStandingList);

  describe('getList', function () {
    it('returns the five defaults, in order, with null notes, when the list is empty', async () => {
      await resetStandingList();
      const { items, source } = await svc().getList();

      expect(source).toBe('default');
      expect(items).toHaveLength(5);
      expect(items.map((i) => i.title)).toEqual(svc().DEFAULT_STANDING_TASKS.map((i) => i.title));
      items.forEach((i) => expect(i.note).toBeNull());
    });
  });

  describe('computeKey', function () {
    it('returns an 8-char lowercase hex string', () => {
      expect(svc().computeKey('Weed pathways')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is stable across whitespace/case differences', () => {
      expect(svc().computeKey('Weed  Pathways ')).toBe(svc().computeKey('weed pathways'));
    });
  });

  describe('replaceList validation (AC33)', function () {
    it('accepts a title of exactly 120 chars and a note of exactly 500 chars', async () => {
      await resetStandingList();
      const { items } = await svc().replaceList([{ title: 'x'.repeat(120), note: 'y'.repeat(500) }]);

      expect(items[0].title).toHaveLength(120);
      expect(items[0].note).toHaveLength(500);
    });

    it('rejects a 121-char title', async () => {
      await expect(svc().replaceList([{ title: 'x'.repeat(121) }]))
        .rejects.toThrow('Item 0: title must be 120 characters or fewer');
    });

    it('rejects a 501-char note', async () => {
      await expect(svc().replaceList([{ title: 'valid title', note: 'y'.repeat(501) }]))
        .rejects.toThrow('Item 0: note must be 500 characters or fewer');
    });
  });

  describe('replaceList persistence (AC37)', function () {
    it('keeps exactly one single-type row and exactly N component rows after repeated saves', async () => {
      await resetStandingList();
      const list = [{ title: 'Item A', note: null }, { title: 'Item B', note: null }];

      await svc().replaceList(list);
      await svc().replaceList(list);

      const rowCount = await strapi.db.query(UID).count({});
      expect(rowCount).toBe(1);

      let componentCount;
      try {
        const [{ c }] = await strapi.db.connection('components_checklist_standing_tasks').count('* as c');
        componentCount = Number(c);
      } catch (e) {
        const tables = await strapi.db.connection.raw("SELECT name FROM sqlite_master WHERE type='table'");
        const names = tables.map((t) => t.name || t.NAME);
        strapi.log.warn('components_checklist_standing_tasks not found, tables: ' + JSON.stringify(names));
        throw e;
      }
      expect(componentCount).toBe(2);
    });
  });

  describe('replaceList validation messages never echo submitted content', function () {
    it('rejects a non-array payload', async () => {
      await expect(svc().replaceList('not-an-array')).rejects.toThrow('standing_tasks must be an array');
    });

    it('rejects more than 30 items', async () => {
      const items = Array.from({ length: 31 }, (_, i) => ({ title: 'Item ' + i }));
      await expect(svc().replaceList(items)).rejects.toThrow('standing_tasks may contain at most 30 items');
    });

    it('rejects a missing/non-string title', async () => {
      await expect(svc().replaceList([{ title: 42 }])).rejects.toThrow('Item 0: title is required');
    });

    it('rejects a whitespace-only title', async () => {
      await expect(svc().replaceList([{ title: '   ' }])).rejects.toThrow('Item 0: title is required');
    });

    it('rejects a non-string note', async () => {
      await expect(svc().replaceList([{ title: 'ok', note: 42 }])).rejects.toThrow('Item 0: note must be a string');
    });

    it('never echoes submitted text in a validation message, even for an oversized title', async () => {
      await expect(svc().replaceList([{ title: 'SECRET-TITLE-XYZ'.repeat(20) }]))
        .rejects.toThrow(/^Item 0: title must be 120 characters or fewer$/);
    });
  });
});

/**
 * HTTP-level tests for the manager-guarded write endpoint (Task 7).
 * `grantPrivileges` in tests/helpers/strapi.js is broken (unimported `_`,
 * and its one call site never actually reaches the broken line) — grant
 * directly against the permissions table instead.
 */
describe('Standing task write endpoint (PUT /api/day-sheet-standing-tasks/list)', function () {
  const request = require('supertest');
  const { createUser } = require('../user/factory');
  const svc = () => strapi.service(UID);

  const ACTION = 'api::day-sheet-standing-task.day-sheet-standing-task.replaceList';

  const grantReplaceList = async (roleId) => {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action: ACTION, role: { id: roleId } },
    });
    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: { action: ACTION, role: roleId },
      });
    }
  };

  let authRole;
  let adminRole;
  let managerUser;
  let noGardenUser;
  let adminUser;
  let managerJwt;
  let noGardenJwt;
  let adminJwt;
  let garden;
  let event;

  beforeAll(async () => {
    authRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
    await grantReplaceList(authRole.id);

    // There is no `administrator` users-permissions role in this repo's
    // seeds — create one. The permission layer runs before the controller,
    // so an un-granted admin role would 403 before ever reaching the escape
    // hatch, which would look exactly like a guard bug.
    adminRole = await strapi.db.query('plugin::users-permissions.role').create({
      data: { name: 'Administrator', description: 'test', type: 'administrator' },
    });
    await grantReplaceList(adminRole.id);

    managerUser = await createUser({ username: 'standing-manager', email: 'standing-manager@example.com' });
    noGardenUser = await createUser({ username: 'standing-no-garden', email: 'standing-no-garden@example.com' });
    adminUser = await createUser({ username: 'standing-admin', email: 'standing-admin@example.com' });
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: adminUser.id },
      data: { role: adminRole.id },
    });

    garden = await strapi.db.query('api::garden.garden').create({
      data: { title: 'Standing Task Test Garden', slug: 'standing-task-test-garden', managers: [managerUser.id] },
    });

    event = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: {
        title: 'Standing Task Test Event',
        startDatetime: '2026-08-22T16:00:00.000Z',
        garden: garden.id,
        canceled: false,
        disabled: false,
        confirmed: [],
      },
    });

    managerJwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: managerUser.id });
    noGardenJwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: noGardenUser.id });
    adminJwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: adminUser.id });
  });

  afterEach(resetStandingList);
  afterAll(resetStandingList);

  it('AC4: GET /api/day-sheet-standing-tasks returns 404 (no core route), not 403; the single type exists', async () => {
    const res = await request(strapi.server.httpServer).get('/api/day-sheet-standing-tasks');
    expect(res.status).toBe(404);

    const contentType = strapi.contentType(UID);
    expect(contentType).toBeDefined();
    expect(contentType.kind).toBe('singleType');
  });

  it('AC29: no Authorization header -> 403, list unchanged; malformed bearer token -> 401', async () => {
    await resetStandingList();

    const noAuth = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .send({ data: { standing_tasks: [{ title: 'Should not persist', note: null }] } });
    expect(noAuth.status).toBe(403);

    const afterNoAuth = await svc().getList();
    expect(afterNoAuth.source).toBe('default');

    const badToken = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer notatoken')
      .send({ data: { standing_tasks: [{ title: 'Should not persist', note: null }] } });
    expect(badToken.status).toBe(401);
  });

  it('AC30: an authenticated user managing no garden -> 403 with the exact message, list unchanged', async () => {
    await resetStandingList();

    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + noGardenJwt)
      .send({ data: { standing_tasks: [{ title: 'Should not persist', note: null }] } });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Only garden managers can edit the standing task list');

    const after = await svc().getList();
    expect(after.source).toBe('default');
  });

  it('AC31: a manager of one garden -> 200, persisted; an administrator managing no garden -> 200', async () => {
    await resetStandingList();

    const managerRes = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + managerJwt)
      .send({ data: { standing_tasks: [{ title: 'Manager saved item', note: null }] } });

    expect(managerRes.status).toBe(200);
    const afterManager = await svc().getList();
    expect(afterManager.items.map((i) => i.title)).toEqual(['Manager saved item']);

    const adminRes = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + adminJwt)
      .send({ data: { standing_tasks: [{ title: 'Admin saved item', note: null }] } });

    expect(adminRes.status).toBe(200);
    const afterAdmin = await svc().getList();
    expect(afterAdmin.items.map((i) => i.title)).toEqual(['Admin saved item']);
  });

  describe('AC32: validation, table-driven with the manager JWT', function () {
    const SENTINEL = 'ZZSENTINELZZ'.repeat(20);

    const cases = [
      { name: 'not an array', body: { standing_tasks: 'not-an-array' }, message: 'standing_tasks must be an array' },
      {
        name: '31 items',
        body: { standing_tasks: Array.from({ length: 31 }, (_, i) => ({ title: `Item ${i}` })) },
        message: 'standing_tasks may contain at most 30 items',
      },
      { name: 'empty title', body: { standing_tasks: [{ title: '' }] }, message: 'Item 0: title is required' },
      { name: 'whitespace-only title', body: { standing_tasks: [{ title: '   ' }] }, message: 'Item 0: title is required' },
      { name: 'missing title', body: { standing_tasks: [{ note: 'no title here' }] }, message: 'Item 0: title is required' },
      {
        name: '121-char title',
        body: { standing_tasks: [{ title: SENTINEL + 'x'.repeat(121) }] },
        message: 'Item 0: title must be 120 characters or fewer',
      },
      {
        name: '501-char note',
        body: { standing_tasks: [{ title: 'valid title', note: SENTINEL + 'y'.repeat(501) }] },
        message: 'Item 0: note must be 500 characters or fewer',
      },
      {
        name: 'non-string note',
        body: { standing_tasks: [{ title: 'valid title', note: 42 }] },
        message: 'Item 0: note must be a string',
      },
    ];

    it.each(cases)('$name -> 400 with the exact message, no submitted content echoed', async ({ body, message }) => {
      const res = await request(strapi.server.httpServer)
        .put('/api/day-sheet-standing-tasks/list')
        .set('Authorization', 'Bearer ' + managerJwt)
        .send({ data: body });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(message);
      expect(res.text).not.toContain(SENTINEL);
    });
  });

  it('AC36: saving [] returns the five defaults, and the day sheet HTML reflects them', async () => {
    await svc().replaceList([{ title: 'Temporary item', note: null }]);

    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + managerJwt)
      .send({ data: { standing_tasks: [] } });

    expect(res.status).toBe(200);
    const defaults = svc().DEFAULT_STANDING_TASKS;
    expect(res.body.data.standing.map((i) => i.title)).toEqual(defaults.map((i) => i.title));
    expect(res.body.data.meta.standingSource).toBe('default');
    expect(res.body.data.meta.standingCount).toBe(5);

    const html = await request(strapi.server.httpServer)
      .get(`/api/volunteer-days/by-id/${event.id}/day-sheet.html`);

    expect(html.status).toBe(200);
    defaults.forEach((item) => expect(html.text).toContain(item.title));
  });

  it('AC38: a saved edit is visible on the day sheet HTML immediately, no restart or cache flush', async () => {
    await resetStandingList();

    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + managerJwt)
      .send({ data: { standing_tasks: [{ title: 'Freshly saved item one', note: null }, { title: 'Freshly saved item two', note: null }] } });

    expect(res.status).toBe(200);

    const html = await request(strapi.server.httpServer)
      .get(`/api/volunteer-days/by-id/${event.id}/day-sheet.html`);

    expect(html.status).toBe(200);
    expect(html.text).toContain('Freshly saved item one');
    expect(html.text).toContain('Freshly saved item two');
  });

  it('accepts the bare-body form (no `data` wrapper)', async () => {
    await resetStandingList();

    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', 'Bearer ' + managerJwt)
      .send({ standing_tasks: [{ title: 'Bare body item', note: null }] });

    expect(res.status).toBe(200);
    expect(res.body.data.standing.map((i) => i.title)).toEqual(['Bare body item']);
  });
});
