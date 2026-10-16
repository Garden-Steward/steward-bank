'use strict';
const request = require('supertest');
const { patchService, patch } = require('../helpers/patch');

const ALERT_UID = 'api::project-alert.project-alert';
const PROJECT_UID = 'api::project.project';
const USER_UID = 'plugin::users-permissions.user';
const svc = () => strapi.service(ALERT_UID);

let seq = 0;
const nextEmail = (tag = 'alert') => { seq += 1; return `${tag}_${Date.now()}_${seq}@example.com`; };
const post = (body, jwt) => {
  const req = request(strapi.server.httpServer).post('/api/project-alerts').set('accept', 'application/json');
  if (jwt) req.set('Authorization', `Bearer ${jwt}`);
  return req.send(body);
};
const findSub = (where) => strapi.db.query(ALERT_UID).findOne({ where });

async function makeProject(data = {}) {
  return strapi.db.query(PROJECT_UID).create({
    data: {
      title: `Alert project ${++seq}`,
      short_description: 'A test project',
      review_status: 'APPROVED',
      latitude: 37.8,
      longitude: -122.27,
      ...data,
    },
    populate: ['garden', 'created_by'],
  });
}

describe('project alerts', () => {
  let send;

  beforeEach(() => {
    send = patch(strapi.plugins['email'].services.email, 'send', jest.fn().mockResolvedValue(undefined));
  });

  it('subscribes by zip without an account and sends the account instructions once', async () => {
    const email = nextEmail();
    const res = await post({ email: email.toUpperCase(), zip: '94607' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subscribed: true, label: '94607' });

    const sub = await findSub({ email, scope: 'zip', zip: '94607' });
    expect(sub).toBeTruthy();
    expect(sub.unsubscribe_token).toBeTruthy();
    expect(sub.welcomed_at).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(email);
    expect(send.mock.calls[0][0].html).toContain('register=1');

    // A second signup (different city) from the same address: no second welcome.
    await post({ email, city: 'Oakland, CA' }).expect(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await findSub({ email, scope: 'city', city: 'oakland' })).toBeTruthy();
  });

  it('rejects bad input', async () => {
    await post({ email: 'nope', zip: '94607' }).expect(400);
    await post({ email: nextEmail(), zip: '123' }).expect(400);
    await post({ email: nextEmail() }).expect(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('uses the signed-in user\'s email and links the account', async () => {
    const email = nextEmail('member');
    const user = await strapi.db.query(USER_UID).create({
      data: { username: email, email, provider: 'local', confirmed: true },
    });
    const jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: user.id });

    await post({ zip: '94612' }, jwt).expect(200);
    const sub = await findSub({ email, scope: 'zip', zip: '94612' });
    expect(sub).toBeTruthy();
    const withUser = await strapi.db.query(ALERT_UID).findOne({ where: { id: sub.id }, populate: ['user'] });
    expect(withUser.user.id).toBe(user.id);
    expect(send.mock.calls[0][0].html).not.toContain('register=1');
  });

  it('unsubscribes by token and re-subscribing reactivates', async () => {
    const email = nextEmail();
    await post({ email, zip: '94610' }).expect(200);
    const sub = await findSub({ email, zip: '94610' });

    await request(strapi.server.httpServer)
      .get(`/api/project-alerts/unsubscribe?token=${sub.unsubscribe_token}`)
      .expect(200);
    expect((await findSub({ id: sub.id })).unsubscribed_at).toBeTruthy();

    await request(strapi.server.httpServer).get('/api/project-alerts/unsubscribe?token=bogus').expect(404);

    await post({ email, zip: '94610' }).expect(200);
    expect((await findSub({ id: sub.id })).unsubscribed_at).toBeNull();
  });

  it('emails matching zip and city subscribers once per approved project', async () => {
    const zipFan = nextEmail('zip');
    const cityFan = nextEmail('city');
    const both = nextEmail('both');
    const elsewhere = nextEmail('elsewhere');
    const gone = nextEmail('gone');
    await svc().subscribe({ email: zipFan, zip: '94699' });
    await svc().subscribe({ email: cityFan, city: 'Testville' });
    await svc().subscribe({ email: both, city: 'testville, ca' });
    await svc().subscribe({ email: both, zip: '94699' });
    await svc().subscribe({ email: elsewhere, zip: '10001' });
    await svc().subscribe({ email: gone, zip: '94699' });
    const goneSub = await findSub({ email: gone });
    await svc().unsubscribe(goneSub.unsubscribe_token);
    send.mockClear();

    const geocode = patchService(ALERT_UID, 'reverseGeocode', jest.fn().mockResolvedValue({ city: 'Testville', zip: '94699' }));
    const project = await makeProject();

    const sent = await svc().notifyForProject(project);
    expect(sent).toBe(3);
    expect(geocode).toHaveBeenCalledWith(37.8, -122.27);
    const recipients = send.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual([both, cityFan, zipFan].sort());
    const toBoth = send.mock.calls.find((c) => c[0].to === both)[0];
    expect(toBoth.subject).toContain('94699');

    const saved = await strapi.db.query(PROJECT_UID).findOne({ where: { id: project.id } });
    expect(saved.location_city).toBe('Testville');
    expect(saved.location_zip).toBe('94699');
    expect(saved.subscribers_notified_at).toBeTruthy();

    // Already notified: no second round.
    send.mockClear();
    expect(await svc().notifyForProject(saved)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('review.sendDue alerts subscribers for approvals but not other decisions', async () => {
    const fan = nextEmail('due');
    await svc().subscribe({ email: fan, zip: '94698' });
    send.mockClear();
    patchService(ALERT_UID, 'reverseGeocode', jest.fn().mockResolvedValue({ city: 'Duetown', zip: '94698' }));

    const past = new Date(Date.now() - 60 * 1000);
    const approved = await makeProject({ review_notify_after: past, submitter_email: nextEmail('pitcher') });
    const denied = await makeProject({ review_status: 'REJECTED', review_reason: 'capacity', review_notify_after: past, submitter_email: nextEmail('pitcher') });

    await strapi.service('api::project.review').sendDue();

    const toFan = send.mock.calls.filter((c) => c[0].to === fan);
    expect(toFan).toHaveLength(1);
    expect(toFan[0][0].subject).toContain(approved.title);
    const deniedRow = await strapi.db.query(PROJECT_UID).findOne({ where: { id: denied.id } });
    expect(deniedRow.subscribers_notified_at).toBeNull();
  });
});
