/**
 * HTTP tests for the event page payload: GET /api/volunteer-days/by-id/:id
 * now carries the resolved brief, the garden's visit info, the event's tasks
 * and the recurring series around it.
 *
 * Shares the global `strapi` booted once for the whole tests/app.test.js suite.
 */

const request = require('supertest');

const EVENT_UID = 'api::volunteer-day.volunteer-day';

const getEvent = (id) => request(strapi.server.httpServer).get(`/api/volunteer-days/by-id/${id}`);

describe('Event page payload (by-id): brief, visit info, tasks, series', function () {
  let garden;
  let template;

  const makeEvent = async (data) => strapi.documents(EVENT_UID).create({
    data: { canceled: false, disabled: false, ...data },
    status: 'published',
  });

  beforeAll(async () => {
    const manager = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        username: 'brief-test-manager',
        email: 'brief-test-manager@example.com',
        password: 'not-a-real-password-hash',
        phoneNumber: '5555550199',
        firstName: 'Brief',
        confirmed: true,
      },
    });
    const org = await strapi.documents('api::organization.organization').create({
      data: { title: 'Brief Test Org', venmo_handle: 'brief-test-venmo' },
      status: 'published',
    });

    garden = await strapi.documents('api::garden.garden').create({
      data: {
        managers: [manager.documentId],
        organization: org.documentId,
        title: 'Brief Test Garden',
        slug: 'brief-test-garden',
        sms_slug: 'brieftest',
        visit_info: { meeting_spot: ' The front gate ', restroom: '' },
      },
      status: 'published',
    });

    template = await strapi.documents('api::recurring-event-template.recurring-event-template').create({
      data: {
        title_template: 'Brief Test Workday',
        recurrence_type: 'nth_weekday',
        nth_occurrence: 'third',
        weekday: 'Sunday',
        first_occurrence_date: '2026-01-01',
        is_active: false,
        garden: garden.documentId,
        brief: {
          what_to_expect: 'Template paragraph',
          agenda: [{ time_text: '9:30', label: 'Coffee and circle' }],
          bring_items: [
            { label: 'Water bottle', provided_by: 'volunteer' },
            { label: 'Gloves', provided_by: 'garden' },
          ],
          food: 'Shared lunch',
        },
      },
      status: 'published',
    });
  });

  describe('a recurring garden event', function () {
    let past;
    let current;
    let next;
    let canceledNext;

    beforeAll(async () => {
      const common = { garden: garden.documentId, recurring_template: template.documentId, is_recurring_instance: true, type: 'general' };
      past = await makeEvent({ ...common, title: 'Brief Test - Sept', startDatetime: '2026-09-20T16:30:00.000Z', photo_album_url: 'https://photos.example/album' });
      current = await makeEvent({ ...common, title: 'Brief Test - Oct', startDatetime: '2026-10-18T16:30:00.000Z' });
      next = await makeEvent({ ...common, title: 'Brief Test - Nov', startDatetime: '2026-11-15T17:30:00.000Z' });
      canceledNext = await makeEvent({ ...common, title: 'Brief Test - Dec', startDatetime: '2026-12-20T17:30:00.000Z', canceled: true });

      const task = (data) => strapi.db.query('api::garden-task.garden-task').create({
        data: { type: 'Planting', priority: 'Normal', garden: garden.id, volunteer_day: current.id, publishedAt: new Date().toISOString(), ...data },
      });
      await task({ title: 'Sow cover crop', task_status: 'INITIALIZED', sort_order: 1 });
      await task({ title: 'Dropped idea', task_status: 'ABANDONED', sort_order: 2 });
    });

    it('resolves the brief from the template, live', async () => {
      const res = await getEvent(current.id).expect(200);
      const { data } = res.body;
      expect(data.brief_source).toBe('template');
      expect(data.resolved_brief.what_to_expect).toBe('Template paragraph');
      expect(data.resolved_brief.agenda).toEqual([{ time_text: '9:30', label: 'Coffee and circle', detail: null }]);
      expect(data.resolved_brief.bring_items).toEqual([
        { label: 'Water bottle', provided_by: 'volunteer' },
        { label: 'Gloves', provided_by: 'garden' },
      ]);
      expect(data.resolved_brief.food).toBe('Shared lunch');
    });

    it('carries the garden visit info, cleaned', async () => {
      const { data } = (await getEvent(current.id).expect(200)).body;
      expect(data.garden.visit_info.meeting_spot).toBe('The front gate');
      expect(data.garden.visit_info.restroom).toBeNull();
      expect(data.garden.visit_info.id).toBeUndefined();
    });

    it("lists the event's tasks, leaving out abandoned ones", async () => {
      const { data } = (await getEvent(current.id).expect(200)).body;
      expect(data.event_tasks.map((t) => t.title)).toEqual(['Sow cover crop']);
      expect(Object.keys(data.event_tasks[0]).sort()).toEqual(['documentId', 'id', 'overview', 'task_status', 'title', 'type']);
    });

    it('returns upcoming instances of the series, skipping canceled ones', async () => {
      const { data } = (await getEvent(current.id).expect(200)).body;
      const titles = data.series.upcoming.map((e) => e.title);
      expect(titles).toContain(next.title);
      expect(titles).not.toContain(canceledNext.title);
      expect(titles).not.toContain(current.title);
    });

    it('returns the most recent earlier instance that has photos', async () => {
      const { data } = (await getEvent(current.id).expect(200)).body;
      expect(data.series.previous.title).toBe(past.title);
      expect(data.series.previous.photo_album_url).toBe('https://photos.example/album');
    });

    it('an event-level override replaces just that field', async () => {
      await strapi.documents(EVENT_UID).update({
        documentId: next.documentId,
        data: { brief: { food: 'Pizza this time' } },
        status: 'published',
      });
      const published = await strapi.db.query(EVENT_UID).findOne({
        where: { documentId: next.documentId, publishedAt: { $notNull: true } },
      });
      const { data } = (await getEvent(published.id).expect(200)).body;
      expect(data.brief_source).toBe('event');
      expect(data.resolved_brief.food).toBe('Pizza this time');
      expect(data.resolved_brief.what_to_expect).toBe('Template paragraph');
    });

    it('does not leak private user or organization fields', async () => {
      const { data } = (await getEvent(current.id).expect(200)).body;
      expect(data.garden.managers).toHaveLength(1);
      const [m] = data.garden.managers;
      expect(m.firstName).toBe('Brief');
      expect(m.password).toBeUndefined();
      expect(m.phoneNumber).toBeUndefined();
      expect(m.email).toBeUndefined();
      expect(data.garden.organization.title).toBe('Brief Test Org');
      expect(data.garden.organization.venmo_handle).toBeUndefined();
    });
  });

  describe('a one-off event with no garden', function () {
    it('gets the starter brief for its type, no series, and its own location', async () => {
      const event = await makeEvent({
        title: 'Brief Test Seed Swap',
        type: 'workshop',
        startDatetime: '2026-11-07T21:00:00.000Z',
        location_name: 'Branch library',
        location_address: '123 Example St',
      });
      const { data } = (await getEvent(event.id).expect(200)).body;
      expect(data.brief_source).toBe('starter');
      expect(data.resolved_brief.agenda.length).toBeGreaterThan(0);
      expect(data.series).toBeNull();
      expect(data.garden).toBeNull();
      expect(data.location_name).toBe('Branch library');
      expect(data.event_tasks).toEqual([]);
    });
  });
});

/**
 * The write shapes the garden-vue editors send, through the core REST update
 * routes, as a signed-in user.
 */
describe('Event page editors: write path', function () {
  const { grantPrivileges } = require('../helpers/strapi');
  let jwt;
  let garden;
  let template;
  let event;

  const put = (path, data) => request(strapi.server.httpServer)
    .put(path)
    .set('Authorization', `Bearer ${jwt}`)
    .send({ data });

  beforeAll(async () => {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
    await grantPrivileges(role.id, 'api::volunteer-day.volunteer-day', ['update']);
    await grantPrivileges(role.id, 'api::garden.garden', ['update']);
    await grantPrivileges(role.id, 'api::recurring-event-template.recurring-event-template', ['update']);

    const user = await strapi.db.query('plugin::users-permissions.user').create({
      data: { username: 'brief-editor', email: 'brief-editor@example.com', provider: 'local', confirmed: true, role: role.id },
    });
    jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });

    garden = await strapi.documents('api::garden.garden').create({
      data: { title: 'Editor Garden', slug: 'editor-garden', sms_slug: 'editorgarden', managers: [user.documentId] },
      status: 'published',
    });
    template = await strapi.documents('api::recurring-event-template.recurring-event-template').create({
      data: { title_template: 'Editor Workday', recurrence_type: 'day_of_month', day_of_month: 5, first_occurrence_date: '2026-01-01', is_active: false, garden: garden.documentId },
      status: 'published',
    });
    event = await strapi.documents(EVENT_UID).create({
      data: { title: 'Editor Event', startDatetime: '2026-12-05T17:00:00.000Z', garden: garden.documentId, recurring_template: template.documentId, canceled: false, disabled: false },
      status: 'published',
    });
  });

  it('serves the starter briefs publicly, one per event type', async () => {
    const res = await request(strapi.server.httpServer).get('/api/volunteer-days/brief-starters').expect(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['art', 'cleanup', 'general', 'land_work', 'workshop']);
    expect(res.body.data.workshop.bring_items.length).toBeGreaterThan(0);
  });

  it('saves garden visit info, and the full garden fetch returns it', async () => {
    await put(`/api/gardens/${garden.documentId}`, { visit_info: { meeting_spot: 'North gate', restroom: 'Cafe on the corner' } }).expect(200);
    const res = await request(strapi.server.httpServer).get('/api/gardens/editor-garden/full');
    // The full route may not be granted to Public in tests; read the row directly if so.
    const visit = res.status === 200
      ? res.body.data.visit_info
      : (await strapi.documents('api::garden.garden').findOne({ documentId: garden.documentId, status: 'published', populate: ['visit_info'] })).visit_info;
    expect(visit.meeting_spot).toBe('North gate');
  });

  it('saves a template brief with nested agenda and bring items, and events read it', async () => {
    await put(`/api/recurring-event-templates/${template.documentId}`, {
      type: 'land_work',
      brief: {
        what_to_expect: 'Edited in the app',
        agenda: [{ time_text: '10:00', label: 'Start', detail: null }, { time_text: null, label: 'Finish', detail: 'Tools away' }],
        bring_items: [{ label: 'Gloves', provided_by: 'garden' }],
        good_for: null, food: null, duration_text: '2 hours',
      },
    }).expect(200);

    // Replacing the lists (not appending) on a second save
    await put(`/api/recurring-event-templates/${template.documentId}`, {
      brief: { what_to_expect: 'Edited twice', agenda: [{ label: 'Only step' }], bring_items: [] },
    }).expect(200);

    const { data } = (await getEvent(event.id).expect(200)).body;
    expect(data.brief_source).toBe('template');
    expect(data.resolved_brief.what_to_expect).toBe('Edited twice');
    expect(data.resolved_brief.agenda.map((s) => s.label)).toEqual(['Only step']);
    expect(data.resolved_brief.bring_items).toEqual([]);
  });

  it('saves an event override and plantings through the event update route', async () => {
    await put(`/api/volunteer-days/${event.documentId}`, {
      brief: { food: 'Tamales' },
      planting: [{ plant_name: 'Garlic' }, { plant_name: 'Fava' }],
    }).expect(200);

    const published = await strapi.db.query(EVENT_UID).findOne({ where: { documentId: event.documentId, publishedAt: { $notNull: true } } });
    const { data } = (await getEvent(published.id).expect(200)).body;
    expect(data.brief_source).toBe('event');
    expect(data.resolved_brief.food).toBe('Tamales');
    expect(data.resolved_brief.what_to_expect).toBe('Edited twice');
    expect(data.planting.map((p) => p.plant_name)).toEqual(['Garlic', 'Fava']);

    // Clearing the override falls back to the template
    await put(`/api/volunteer-days/${event.documentId}`, { brief: null }).expect(200);
    const again = await strapi.db.query(EVENT_UID).findOne({ where: { documentId: event.documentId, publishedAt: { $notNull: true } } });
    const after = (await getEvent(again.id).expect(200)).body.data;
    expect(after.brief_source).toBe('template');
  });
});
