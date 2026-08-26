const { addDays, addHours } = require('date-fns');
const Helper = require('../../config/helpers/cron-helper');
const VdayHelper = require('../../src/api/volunteer-day/controllers/VdayHelper');

/**
 * Regression tests for the daily volunteer-day reminder cron.
 *
 * Strapi v5 draft & publish stores every entry as two rows — a draft and a
 * published version — sharing one documentId. That split is what stopped these
 * reminders after the v4 -> v5 upgrade: volunteers were linked to one row of a
 * garden while events resolved their relation to the other, so the cron found
 * the event, found nobody to text, and logged nothing.
 */

const PHONE = '+15559990001';
const SLUG = 'reminder-test-garden';
const GARDEN_DOC = 'remindergardendoc00000001';
const EVENT_DOC = 'remindereventdoc000000001';

// 7.5 days out lands inside the getUpcomingVdays window (7-8 days).
const upcomingWindow = () => addHours(addDays(new Date(), 7), 12).toISOString();

describe('volunteer day reminders (Strapi v5 draft/published split)', function () {
  let publishedGarden;
  let draftGarden;
  let volunteer;

  beforeAll(async function () {
    // The shape a v4 garden takes after the v5 migration: the original row
    // becomes the published version and a draft clone is added alongside it.
    publishedGarden = await strapi.db.query('api::garden.garden').create({
      data: {
        documentId: GARDEN_DOC,
        title: 'Reminder Test Garden',
        sms_slug: SLUG,
        publishedAt: new Date().toISOString(),
      },
    });

    draftGarden = await strapi.db.query('api::garden.garden').create({
      data: {
        documentId: GARDEN_DOC,
        title: 'Reminder Test Garden',
        sms_slug: SLUG,
        publishedAt: null,
      },
    });

    // The volunteer is attached to the DRAFT row, the event to the PUBLISHED
    // row. Before the fix this combination texted nobody.
    volunteer = await strapi.db.query('plugin::users-permissions.user').create({
      data: {
        username: 'reminder-vol',
        email: 'reminder-vol@example.com',
        provider: 'local',
        confirmed: true,
        blocked: false,
        firstName: 'Reminder',
        phoneNumber: PHONE,
        gardens: draftGarden.id,
        activeGarden: draftGarden.id,
      },
    });

    await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: {
        documentId: EVENT_DOC,
        title: 'Reminder Test Day',
        blurb: 'Come help.',
        endText: 'noon',
        interest: 'Everyone',
        startDatetime: upcomingWindow(),
        garden: publishedGarden.id,
        disabled: false,
        canceled: false,
        publishedAt: new Date().toISOString(),
      },
    });
  });

  it('finds volunteers linked to any version of the garden document', async function () {
    const vDay = await strapi.db.query('api::volunteer-day.volunteer-day').findOne({
      where: { documentId: EVENT_DOC, publishedAt: { $notNull: true } },
      populate: ['garden', 'garden.volunteers'],
    });

    // The event's own garden row has no volunteers on it at all...
    expect(vDay.garden.id).toBe(publishedGarden.id);

    // ...but the volunteer is still found via the garden document.
    const volGroup = await strapi.service('api::volunteer-day.volunteer-day').getVolunteerGroup(vDay);
    expect(volGroup.map(v => v.id)).toEqual([volunteer.id]);
  });

  it('texts the volunteer on the daily reminder run', async function () {
    const sent = await Helper.handleVolunteerReminders();
    expect(sent).toContain(PHONE);
  });

  it('returns an empty group instead of throwing when an event has no garden', async function () {
    const volGroup = await strapi.service('api::volunteer-day.volunteer-day')
      .getVolunteerGroup({ id: 999, garden: null });
    expect(volGroup).toEqual([]);
  });

  it('keeps sending for good events when another event is missing its garden', async function () {
    const orphan = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: {
        documentId: 'reminderorphandoc00000001',
        title: 'Orphaned Reminder Event',
        startDatetime: addHours(addDays(new Date(), 7), 10).toISOString(),
        disabled: false,
        canceled: false,
        publishedAt: null,
      },
    });

    try {
      const sent = await Helper.handleVolunteerReminders();
      expect(sent).toContain(PHONE);
    } finally {
      await strapi.db.query('api::volunteer-day.volunteer-day').delete({ where: { id: orphan.id } });
    }
  });

  it('sends once, not twice, when an event has both a draft and a published row', async function () {
    const draftTwin = await strapi.db.query('api::volunteer-day.volunteer-day').create({
      data: {
        documentId: EVENT_DOC,
        title: 'Reminder Test Day',
        blurb: 'Come help.',
        endText: 'noon',
        interest: 'Everyone',
        startDatetime: upcomingWindow(),
        garden: draftGarden.id,
        disabled: false,
        canceled: false,
        publishedAt: null,
      },
    });

    try {
      const vDays = await VdayHelper.getUpcomingVdays();
      const matching = vDays.filter(v => v.documentId === EVENT_DOC);
      expect(matching).toHaveLength(1);
      // The published row is the one that wins.
      expect(matching[0].publishedAt).toBeTruthy();

      const sent = await Helper.handleVolunteerReminders();
      expect(sent.filter(p => p === PHONE)).toHaveLength(1);
    } finally {
      await strapi.db.query('api::volunteer-day.volunteer-day').delete({ where: { id: draftTwin.id } });
    }
  });

  it('caches the published garden row for a slug, so new volunteers land there', async function () {
    await strapi.service('api::garden.garden').refreshCache();
    const cached = await strapi.service('api::garden.garden').findBySmsSlug(SLUG);
    expect(cached.id).toBe(publishedGarden.id);
    expect(cached.publishedAt).toBeTruthy();
  });
});
