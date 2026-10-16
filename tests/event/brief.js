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
