/**
 * Tests for the day-sheet assembly service, through the service layer (not
 * HTTP — Task 6 owns the HTTP-level ACs). Shares the global `strapi` booted
 * once for the whole `tests/app.test.js` suite.
 */

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
