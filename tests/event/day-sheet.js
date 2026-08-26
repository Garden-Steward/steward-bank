/**
 * Tests for the day-sheet assembly service, through the service layer (not
 * HTTP — Task 6 owns the HTTP-level ACs). Shares the global `strapi` booted
 * once for the whole `tests/app.test.js` suite.
 */

const request = require('supertest');

const STANDING_UID = 'api::day-sheet-standing-task.day-sheet-standing-task';

const resetStandingList = async () => {
  const row = await strapi.documents(STANDING_UID).findFirst();
  if (row) await strapi.documents(STANDING_UID).delete({ documentId: row.documentId });
};

const sheetSvc = () => strapi.service('api::volunteer-day.day-sheet');

describe('Day sheet assembly service', function () {
  let garden;

  beforeAll(async () => {
    garden = await strapi.db.query('api::garden.garden').create({
      data: { title: 'Day Sheet Test Garden', slug: 'day-sheet-test-garden' },
    });
  });

  afterAll(resetStandingList);

  const makeEvent = async (overrides = {}) => strapi.db.query('api::volunteer-day.volunteer-day').create({
    data: {
      title: 'Day Sheet Test Event',
      startDatetime: '2026-08-22T16:00:00.000Z',
      garden: garden.id,
      canceled: false,
      disabled: false,
      confirmed: [],
      ...overrides,
    },
  });

  const makeTask = async (event, overrides = {}) => strapi.db.query('api::garden-task.garden-task').create({
    data: {
      title: 'Test task',
      type: 'General',
      priority: 'Normal',
      garden: garden.id,
      volunteer_day: event.id,
      publishedAt: new Date().toISOString(),
      ...overrides,
    },
  });

  // Written first, per the brief: the draft/publish dedupe is the highest-risk
  // part of this task. `event.garden_tasks` must never be read directly —
  // loadTasks() re-derives the deduped task list from a fresh query instead.
  describe('draft/publish dedupe (AC15, AC16)', function () {
    it('AC15: a task that has never been published appears exactly once', async () => {
      const event = await makeEvent();
      await makeTask(event, { title: 'Unpublished task', publishedAt: null });

      const sheet = await sheetSvc().assemble(event.id);

      expect(sheet.tasks).toHaveLength(1);
      expect(sheet.tasks[0].title).toBe('Unpublished task');
    });

    it('AC16: a task existing as both a draft and a published row appears exactly once, with the published row\'s id', async () => {
      const event = await makeEvent();

      const draft = await makeTask(event, { title: 'Draft/published task', publishedAt: null });
      const published = await makeTask(event, {
        title: 'Draft/published task',
        documentId: draft.documentId,
        publishedAt: new Date().toISOString(),
      });

      const sheet = await sheetSvc().assemble(event.id);
      const matches = sheet.tasks.filter((t) => t.documentId === draft.documentId);

      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(published.id);
    });

    it('a draft-only task (no published counterpart) still appears, reporting the draft row\'s id', async () => {
      const event = await makeEvent();
      const draft = await makeTask(event, { title: 'Draft-only task', publishedAt: null });

      const sheet = await sheetSvc().assemble(event.id);
      const matches = sheet.tasks.filter((t) => t.documentId === draft.documentId);

      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(draft.id);
    });
  });

  describe('sortTasks / priority ordering (AC9)', function () {
    it('orders High, High, Normal, Low from a Low, High, Normal, High creation order, ties by ascending id', async () => {
      const event = await makeEvent();
      const priorities = ['Low', 'High', 'Normal', 'High'];
      const created = [];
      for (const priority of priorities) {
        // eslint-disable-next-line no-await-in-loop
        created.push(await makeTask(event, { title: `Task ${priority}`, priority }));
      }

      const sheet = await sheetSvc().assemble(event.id);

      expect(sheet.tasks.map((t) => t.priority)).toEqual(['High', 'High', 'Normal', 'Low']);
      const highs = sheet.tasks.filter((t) => t.priority === 'High');
      expect(highs).toHaveLength(2);
      expect(highs[0].id).toBeLessThan(highs[1].id);
    });
  });

  describe('priority normalization (AC3)', function () {
    it('schema declares the enum and default', () => {
      const attr = strapi.contentType('api::garden-task.garden-task').attributes.priority;
      expect(attr.enum).toEqual(['High', 'Normal', 'Low']);
      expect(attr.default).toBe('Normal');
    });

    it('a null priority column is reported as Normal', async () => {
      const event = await makeEvent();
      await makeTask(event, { title: 'No priority task', priority: null });

      const sheet = await sheetSvc().assemble(event.id);

      expect(sheet.tasks[0].priority).toBe('Normal');
    });
  });

  describe('standing list defaults and overrides (AC6, AC7, AC8)', function () {
    let event;

    beforeAll(async () => {
      event = await makeEvent();
    });

    beforeEach(resetStandingList);

    it('AC6: no single-type row present -> the five documented defaults, in order, note null', async () => {
      const sheet = await sheetSvc().assemble(event.id);
      const defaults = strapi.service(STANDING_UID).DEFAULT_STANDING_TASKS;

      expect(sheet.standing.map((s) => s.title)).toEqual(defaults.map((i) => i.title));
      sheet.standing.forEach((s) => expect(s.note).toBeNull());
      expect(sheet.meta.standingSource).toBe('default');
      expect(sheet.meta.standingCount).toBe(5);
    });

    it('AC7: a single-type row with three items -> those three, in component-array order', async () => {
      const items = [
        { title: 'Custom standing A', note: null },
        { title: 'Custom standing B', note: null },
        { title: 'Custom standing C', note: null },
      ];
      await strapi.service(STANDING_UID).replaceList(items);

      const sheet = await sheetSvc().assemble(event.id);

      expect(sheet.standing.map((s) => s.title)).toEqual(items.map((i) => i.title));
      expect(sheet.meta.standingSource).toBe('single-type');
    });

    it('AC8: every key is 8 lowercase hex chars and stable across two assemble() calls', async () => {
      const sheetA = await sheetSvc().assemble(event.id);
      const sheetB = await sheetSvc().assemble(event.id);

      sheetA.standing.forEach((s) => expect(s.key).toMatch(/^[0-9a-f]{8}$/));
      expect(sheetA.standing.map((s) => s.key)).toEqual(sheetB.standing.map((s) => s.key));
    });
  });

  describe('standing list reorder / edit round trips (AC34, AC35)', function () {
    let event;

    beforeAll(async () => {
      event = await makeEvent();
    });

    beforeEach(resetStandingList);

    it('AC34: reorder round-trips and keys are unchanged', async () => {
      const A = { title: 'Reorder item A', note: null };
      const B = { title: 'Reorder item B', note: null };
      const C = { title: 'Reorder item C', note: null };

      await strapi.service(STANDING_UID).replaceList([A, B, C]);
      const before = await sheetSvc().assemble(event.id);
      const keyByTitle = new Map(before.standing.map((s) => [s.title, s.key]));

      await strapi.service(STANDING_UID).replaceList([C, A, B]);
      const after = await sheetSvc().assemble(event.id);

      expect(after.standing.map((s) => s.title)).toEqual([C.title, A.title, B.title]);
      after.standing.forEach((s) => expect(s.key).toBe(keyByTitle.get(s.title)));
    });

    it('AC35: delete + rename round-trips, removed title appears nowhere', async () => {
      const A = { title: 'Edit item A', note: null };
      const B = { title: 'Edit item B', note: null };

      await strapi.service(STANDING_UID).replaceList([A, B]);
      await strapi.service(STANDING_UID).replaceList([{ ...A, title: 'Edit item A renamed' }]);

      const sheet = await sheetSvc().assemble(event.id);

      expect(sheet.standing).toHaveLength(1);
      expect(sheet.standing[0].title).toBe('Edit item A renamed');
      expect(sheet.meta.standingSource).toBe('single-type');
      expect(JSON.stringify(sheet)).not.toContain(B.title);
    });
  });

  describe('supporting assertions', function () {
    it('assemble() returns null for a nonexistent event id', async () => {
      const sheet = await sheetSvc().assemble(999999999);
      expect(sheet).toBeNull();
    });

    it('meta.printPath matches the by-id day-sheet.html path', async () => {
      const event = await makeEvent();
      const sheet = await sheetSvc().assemble(event.id);
      expect(sheet.meta.printPath).toBe(`/api/volunteer-days/by-id/${event.id}/day-sheet.html`);
    });

    it('the assembled payload never carries a volunteers key', async () => {
      const event = await makeEvent();
      await makeTask(event, { title: 'PII check task' });

      const sheet = await sheetSvc().assemble(event.id);

      expect(JSON.stringify(sheet)).not.toContain('"volunteers"');
    });
  });
});

/**
 * HTTP-level tests for Task 6's two public endpoints. No Authorization
 * header is sent anywhere in this describe.
 */
describe('Day sheet HTTP endpoints', function () {
  let httpGarden;
  let httpEvent;

  beforeAll(async () => {
    await resetStandingList();
    httpGarden = await strapi.db.query('api::garden.garden').create({
      data: { title: 'Day Sheet HTTP Garden', slug: 'day-sheet-http-garden' },
    });
    httpEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: {
        title: 'Day Sheet HTTP Event',
        startDatetime: '2026-08-22T16:00:00.000Z',
        garden: httpGarden.id,
        canceled: false,
        disabled: false,
        confirmed: [],
      },
    });
  });

  afterAll(resetStandingList);

  describe('JSON endpoint (AC5, AC10, AC11, AC12, AC13, AC14, AC28)', function () {
    it('AC5: 200 with no Authorization header, body has event/standing/tasks/meta', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet`);

      expect(res.status).toBe(200);
      expect(res.body.data.event).toBeDefined();
      expect(res.body.data.standing).toBeDefined();
      expect(res.body.data.tasks).toBeDefined();
      expect(res.body.data.meta).toBeDefined();
    });

    it('AC10: nonexistent id -> 404 with the exact message', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/api/volunteer-days/by-id/999999999/day-sheet');

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Volunteer day not found');
    });

    it('AC11: ?exclude=notahex -> 400 with the exact message, no reflection of the input', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet?exclude=notahex`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Invalid exclude parameter');
      expect(res.text).not.toContain('notahex');
    });

    it('AC12: ?exclude=<valid key> -> 200, full standing list unfiltered, key echoed in excludedKeys', async () => {
      const before = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet`);
      const key = before.body.data.standing[0].key;
      const fullLength = before.body.data.standing.length;

      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet?exclude=${key}`);

      expect(res.status).toBe(200);
      expect(res.body.data.standing).toHaveLength(fullLength);
      expect(res.body.data.excludedKeys).toContain(key);
    });

    it('AC13: six extra params -> 400; five valid -> 200 with trimmed values in submitted order', async () => {
      const tooMany = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet?extra=a&extra=b&extra=c&extra=d&extra=e&extra=f`);

      expect(tooMany.status).toBe(400);
      expect(tooMany.body.error.message).toBe('Invalid extra parameter');

      const fine = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet?extra=a&extra=b&extra=c&extra=d&extra=e`);

      expect(fine.status).toBe(200);
      expect(fine.body.data.extras).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('AC14: meta.printPath equals the day-sheet.html path', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet`);

      expect(res.body.data.meta.printPath).toBe(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet.html`);
    });

    it('AC28: JSON response carries Cache-Control: no-store', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet`);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('HTML endpoint (AC17, AC27, AC28)', function () {
    it('AC17: 200, text/html, no Authorization header', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet.html`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
    });

    it('AC27: bad param -> 400 text/plain exact body; nonexistent id -> 404 text/plain exact body', async () => {
      const badParam = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet.html?exclude=zzz`);

      expect(badParam.status).toBe(400);
      expect(badParam.headers['content-type']).toMatch(/^text\/plain/);
      expect(badParam.text).toBe('Invalid exclude parameter');

      const notFound = await request(strapi.server.httpServer)
        .get('/api/volunteer-days/by-id/999999999/day-sheet.html');

      expect(notFound.status).toBe(404);
      expect(notFound.headers['content-type']).toMatch(/^text\/plain/);
      expect(notFound.text).toBe('Volunteer day not found');
    });

    it('AC28: HTML response carries Cache-Control: no-store', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${httpEvent.id}/day-sheet.html`);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('PII (AC21)', function () {
    it('neither endpoint leaks volunteer identity or contact info', async () => {
      const { createUser } = require('../user/factory');
      const volunteer = await createUser({
        username: 'daysheet-pii-user',
        email: 'daysheet-pii-user@example.com',
        firstName: 'Zzpiifirstname',
        lastName: 'Zzpiilastname',
        phoneNumber: '5035551234',
      });

      const piiEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
        data: {
          title: 'PII Test Event',
          startDatetime: '2026-08-22T16:00:00.000Z',
          garden: httpGarden.id,
          canceled: false,
          disabled: false,
          confirmed: [volunteer.id],
        },
      });

      await strapi.db.query('api::garden-task.garden-task').create({
        data: {
          title: 'PII test task',
          type: 'General',
          priority: 'Normal',
          garden: httpGarden.id,
          volunteer_day: piiEvent.id,
          volunteers: [volunteer.id],
          publishedAt: new Date().toISOString(),
        },
      });

      const jsonRes = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${piiEvent.id}/day-sheet`);
      const htmlRes = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${piiEvent.id}/day-sheet.html`);

      [jsonRes, htmlRes].forEach((res) => {
        expect(res.text).not.toContain('Zzpiifirstname');
        expect(res.text).not.toContain('Zzpiilastname');
        expect(res.text).not.toContain('daysheet-pii-user@example.com');
        expect(res.text).not.toContain('5035551234');
        expect(res.text).not.toContain('daysheet-pii-user');
        expect(res.text).not.toContain('"volunteers"');
      });

      expect(typeof jsonRes.body.data.tasks[0].volunteer_count).toBe('number');
    });
  });

  describe('hideTasks (AC49, AC50, AC51, AC52)', function () {
    let hideEvent;
    let task1;
    let task2;
    let task3;

    beforeAll(async () => {
      hideEvent = await strapi.db.query('api::volunteer-day.volunteer-day').create({
        data: {
          title: 'Hide Tasks Event',
          startDatetime: '2026-08-22T16:00:00.000Z',
          garden: httpGarden.id,
          canceled: false,
          disabled: false,
          confirmed: [],
        },
      });

      task1 = await strapi.db.query('api::garden-task.garden-task').create({
        data: {
          title: 'Hide Task One', type: 'General', priority: 'Normal',
          garden: httpGarden.id, volunteer_day: hideEvent.id,
          publishedAt: new Date().toISOString(),
        },
      });
      task2 = await strapi.db.query('api::garden-task.garden-task').create({
        data: {
          title: 'Hide Task Two', type: 'General', priority: 'Normal',
          garden: httpGarden.id, volunteer_day: hideEvent.id,
          publishedAt: new Date().toISOString(),
        },
      });
      task3 = await strapi.db.query('api::garden-task.garden-task').create({
        data: {
          title: 'Hide Task Three', type: 'General', priority: 'Normal',
          garden: httpGarden.id, volunteer_day: hideEvent.id,
          publishedAt: new Date().toISOString(),
        },
      });
    });

    // AC50 is the AC most likely implemented wrong: an unknown hideTasks id
    // must be a silent 200 no-op, never a 400 or a 404. Written first.
    it('AC50: an unknown hideTasks id is a 200 no-op, never 400 or 404', async () => {
      const unknownOnly = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html?hideTasks=999999`);

      expect(unknownOnly.status).toBe(200);
      expect(unknownOnly.text).toContain('Hide Task One');
      expect(unknownOnly.text).toContain('Hide Task Two');
      expect(unknownOnly.text).toContain('Hide Task Three');

      const unknownPlusReal = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html?hideTasks=999999,${task1.id}`);

      expect(unknownPlusReal.status).toBe(200);
      expect(unknownPlusReal.text).not.toContain('Hide Task One');
      expect(unknownPlusReal.text).toContain('Hide Task Two');
      expect(unknownPlusReal.text).toContain('Hide Task Three');
    });

    it('AC49: hideTasks removes only the requested task(s) from the printed HTML', async () => {
      const oneHidden = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html?hideTasks=${task2.id}`);

      expect(oneHidden.status).toBe(200);
      expect(oneHidden.text).toContain('Hide Task One');
      expect(oneHidden.text).toContain('Hide Task Three');
      expect(oneHidden.text).not.toContain('Hide Task Two');

      const twoHidden = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html?hideTasks=${task1.id},${task3.id}`);

      expect(twoHidden.text).toContain('Hide Task Two');
      expect(twoHidden.text).not.toContain('Hide Task One');
      expect(twoHidden.text).not.toContain('Hide Task Three');

      const noneHidden = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html`);

      expect(noneHidden.text).toContain('Hide Task One');
      expect(noneHidden.text).toContain('Hide Task Two');
      expect(noneHidden.text).toContain('Hide Task Three');
    });

    it('AC51: malformed/over-cap hideTasks values 400 without echoing input, on both endpoints', async () => {
      const cases = ['abc', '-1', '1.5', '1,,2'];
      for (const value of cases) {
        // eslint-disable-next-line no-await-in-loop
        const jsonRes = await request(strapi.server.httpServer)
          .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet?hideTasks=${value}`);
        expect(jsonRes.status).toBe(400);
        expect(jsonRes.body.error.message).toBe('Invalid hideTasks parameter');
        expect(jsonRes.text).not.toContain(value);

        // eslint-disable-next-line no-await-in-loop
        const htmlRes = await request(strapi.server.httpServer)
          .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet.html?hideTasks=${value}`);
        expect(htmlRes.status).toBe(400);
        expect(htmlRes.text).toBe('Invalid hideTasks parameter');
        expect(htmlRes.text).not.toContain(value);
      }

      const thirtyOne = Array.from({ length: 31 }, (_, i) => i + 1).join(',');
      const overCap = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet?hideTasks=${thirtyOne}`);
      expect(overCap.status).toBe(400);

      const thirty = Array.from({ length: 30 }, (_, i) => i + 1).join(',');
      const atCap = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet?hideTasks=${thirty}`);
      expect(atCap.status).toBe(200);
    });

    it('AC52: JSON endpoint never filters data.tasks, and echoes deduped hiddenTaskIds', async () => {
      const res = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet?hideTasks=${task2.id},${task2.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tasks).toHaveLength(3);
      expect(res.body.data.tasks.map((t) => t.id).sort((a, b) => a - b))
        .toEqual([task1.id, task2.id, task3.id].sort((a, b) => a - b));
      expect(res.body.data.hiddenTaskIds).toEqual([task2.id]);

      const unknownEcho = await request(strapi.server.httpServer)
        .get(`/api/volunteer-days/by-id/${hideEvent.id}/day-sheet?hideTasks=999999`);
      expect(unknownEcho.body.data.hiddenTaskIds).toEqual([999999]);
    });
  });
});
