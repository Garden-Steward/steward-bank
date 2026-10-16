const SmsHelper = require('../../src/api/message/controllers/SmsHelper');
const { WELCOME_EMAIL } = require('../../src/api/email/defaultTemplates');
const { createUser } = require('./factory');
const { patch, patchService, patchQuery } = require('../helpers/patch');

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('Welcome email', () => {
  let garden;
  let manager;
  let sendEmail;

  beforeAll(async () => {
    manager = await createUser({ firstName: 'Mara', lastName: 'Manager' });
    garden = await strapi.db.query('api::garden.garden').create({
      data: { title: 'Welcome Test Garden', managers: [manager.id] },
    });
  });

  beforeEach(() => {
    sendEmail = patch(strapi.plugins['email'].services.email, 'send', jest.fn().mockResolvedValue({ id: 'msg_1' }));
  });

  const newVolunteer = (data = {}) =>
    createUser({ firstName: 'Ada', activeGarden: garden.id, gardens: [garden.id], ...data });

  it('uses the default template, with the pitch paragraph, when the garden has none', async () => {
    const volunteer = await newVolunteer();

    const result = await strapi.service('api::email.welcome').sendOnJoin(volunteer.id);

    expect(result.sent).toBe(true);
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toBe(volunteer.email);
    expect(email.subject).toBe('Welcome to Welcome Test Garden!');
    expect(email.html).toContain('Hi Ada,');
    expect(email.html).toContain('Pitch it.');
    expect(email.html).toContain('Mara Manager');
    expect(email.replyTo).toBe(manager.email);
    expect(WELCOME_EMAIL.body).toContain('Gravity Garden');
  });

  it('records the send and only sends once per garden', async () => {
    const volunteer = await newVolunteer();
    const service = strapi.service('api::email.welcome');

    await service.sendOnJoin(volunteer.id);
    const second = await service.sendOnJoin(volunteer.id);

    expect(second).toEqual({ sent: false, alreadySent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const saved = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: volunteer.id } });
    expect(saved.automated_emails_sent).toEqual([
      expect.objectContaining({ type: 'welcome', garden_id: garden.id, automatic: true, resend_message_id: 'msg_1' }),
    ]);
  });

  it('skips volunteers who have not given an email yet', async () => {
    const volunteer = await newVolunteer({ email: 'test@test.com' });

    const result = await strapi.service('api::email.welcome').sendOnJoin(volunteer.id);

    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not throw when the email provider fails', async () => {
    sendEmail.mockRejectedValue(new Error('Resend down'));
    const volunteer = await newVolunteer();

    const result = await strapi.service('api::email.welcome').sendOnJoin(volunteer.id);

    expect(result).toEqual({ sent: false, error: 'SEND_FAILED' });
  });

  it('goes out when SMS sign-up completes', async () => {
    const sendOnJoin = patchService('api::email.welcome', 'sendOnJoin', jest.fn().mockResolvedValue({ sent: true }));
    patch(SmsHelper, 'sendContactCard', jest.fn().mockResolvedValue(true));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockResolvedValue({}));

    const response = await SmsHelper.saveVolunteerName({ id: 42, phoneNumber: '+13038833339' }, 'ada lovelace');
    await flush();

    expect(response.type).toBe('complete');
    expect(sendOnJoin).toHaveBeenCalledWith(42, undefined);
  });

  it('goes out when an existing volunteer joins another garden', async () => {
    const sendOnJoin = patchService('api::email.welcome', 'sendOnJoin', jest.fn().mockResolvedValue({ sent: true }));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockResolvedValue({}));
    const user = { id: 43, email: 'ada@example.com', gardens: [] };

    await SmsHelper.joinGarden(user, '+13038833339', { id: garden.id, title: garden.title });
    await flush();

    expect(sendOnJoin).toHaveBeenCalledWith(43, garden.id);
  });

  it('never breaks the SMS reply when the welcome email blows up', async () => {
    patchService('api::email.welcome', 'sendOnJoin', jest.fn().mockRejectedValue(new Error('boom')));
    patch(SmsHelper, 'sendContactCard', jest.fn().mockResolvedValue(true));
    patchQuery('plugin::users-permissions.user', 'update', jest.fn().mockResolvedValue({}));

    const response = await SmsHelper.saveVolunteerName({ id: 44, phoneNumber: '+13038833339' }, 'ada lovelace');
    await flush();

    expect(response.body).toContain('Welcome to the team Ada Lovelace');
  });
});
