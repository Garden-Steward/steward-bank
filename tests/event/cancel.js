/**
 * Canceling (or any REST edit of) a volunteer day that exists only as a
 * published row — how the recurring-template cron inserts events — must keep
 * the event's garden. v5 re-publishes from the draft on every update, so a
 * missing draft used to come back as an event with every relation wiped.
 */

const request = require('supertest');
const { createUser } = require('../user/factory');
const { backfillDrafts } = require('../../src/utils/documents');

const UID = 'api::volunteer-day.volunteer-day';

const rowsFor = (documentId) => strapi.db.query(UID).findMany({
  where: { documentId },
  populate: ['garden'],
});

describe('Canceling a published-only volunteer day', function () {
  let garden;
  let jwt;
  let dayOffset = 0;

  // tests/helpers/strapi.js grantPrivileges is broken (see standing-tasks.js);
  // write the permission rows directly.
  const grant = async (type, action) => {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type } });
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: { id: role.id } },
    });
    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } });
    }
  };

  beforeAll(async () => {
    await grant('authenticated', `${UID}.update`);
    // Populating a relation in the response needs read access to its type.
    await grant('authenticated', 'api::garden.garden.find');
    await grant('public', `${UID}.getByGarden`);

    const user = await createUser({ username: 'cancel-tester', email: 'cancel-tester@example.com' });
    jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });

    // Garden must have a published row: each event version links to the
    // matching version of its garden.
    const doc = await strapi.documents('api::garden.garden').create({
      data: { title: 'Cancel Test Garden', slug: 'cancel-test-garden', sms_slug: 'canceltest' },
      status: 'published',
    });
    garden = await strapi.db.query('api::garden.garden').findOne({
      where: { documentId: doc.documentId, publishedAt: { $notNull: true } },
    });
  });

  // Same shape as recurringEventTemplate.createInstance used to write.
  const makePublishedOnlyEvent = () => {
    dayOffset += 1;
    return strapi.db.query(UID).create({
      data: {
        title: 'Published-only event',
        startDatetime: new Date(Date.UTC(2027, 0, dayOffset, 17)).toISOString(),
        garden: garden.id,
        disabled: false,
        canceled: false,
        publishedAt: new Date().toISOString(),
      },
    });
  };

  it('PUT canceled:true keeps the garden on both the draft and the published row', async () => {
    const event = await makePublishedOnlyEvent();

    const res = await request(strapi.server.httpServer)
      .put(`/api/volunteer-days/${event.documentId}?populate[garden]=true`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ data: { canceled: true } });

    expect(res.status).toBe(200);
    expect(res.body.data.canceled).toBe(true);
    expect(res.body.data.garden?.slug).toBe('cancel-test-garden');

    const rows = await rowsFor(event.documentId);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.canceled).toBe(true);
      expect(row.garden?.slug).toBe('cancel-test-garden');
    });
  });

  it('a canceled event still lists under its garden', async () => {
    const event = await makePublishedOnlyEvent();
    await request(strapi.server.httpServer)
      .put(`/api/volunteer-days/${event.documentId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ data: { canceled: true } });

    const res = await request(strapi.server.httpServer).get('/api/volunteer-days/garden/cancel-test-garden');
    const listed = res.body.data.filter((d) => d.documentId === event.documentId);
    expect(listed).toHaveLength(1);
    expect(listed[0].canceled).toBe(true);
  });

  it('backfillDrafts gives published-only events a draft that carries the garden', async () => {
    const event = await makePublishedOnlyEvent();

    const created = await backfillDrafts(UID);
    expect(created).toBeGreaterThanOrEqual(1);

    const rows = await rowsFor(event.documentId);
    const draft = rows.find((row) => !row.publishedAt);
    expect(draft?.garden?.slug).toBe('cancel-test-garden');
    // The published row is untouched, so numeric /d/:id links keep working.
    expect(rows.find((row) => row.publishedAt).id).toBe(event.id);
  });

  it('recurring-template instances are created with a draft', async () => {
    const svc = strapi.service('api::recurring-event-template.recurring-event-template');
    const instance = await svc.createInstance(
      { id: null, title_template: 'Cancel Recurring', naming_convention: 'title_only', garden: garden.id },
      new Date(2027, 5, 5, 10),
    );

    const rows = await rowsFor(instance.documentId);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.garden?.slug).toBe('cancel-test-garden'));
  });
});
