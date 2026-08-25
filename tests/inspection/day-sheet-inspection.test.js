/**
 * INSPECTION PROBE — written by the Inspector, not by the implementer.
 * Boots its own Strapi instance (separate DATABASE_FILENAME) and probes the
 * printable-day-sheet feature independently of tests/event/day-sheet.js.
 * Deliberately NOT required from tests/app.test.js.
 */
const request = require('supertest');
const { setupStrapi, cleanupStrapi } = require('../helpers/strapi');

jest.setTimeout(120000);

const STANDING_UID = 'api::day-sheet-standing-task.day-sheet-standing-task';
const VD = 'api::volunteer-day.volunteer-day';
const GT = 'api::garden-task.garden-task';

let garden;

const resetStanding = async () => {
  const row = await strapi.documents(STANDING_UID).findFirst();
  if (row) await strapi.documents(STANDING_UID).delete({ documentId: row.documentId });
};

beforeAll(async () => {
  await setupStrapi();
  garden = await strapi.db.query('api::garden.garden').create({
    data: { title: 'Probe Garden & "Co" <b>', slug: 'probe-garden' },
  });
});

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await cleanupStrapi();
  await new Promise((r) => setTimeout(r, 500));
});

const mkEvent = (o = {}) => strapi.db.query(VD).create({
  data: {
    title: 'Probe Event', startDatetime: '2026-08-22T16:00:00.000Z',
    garden: garden.id, canceled: false, disabled: false, confirmed: [], ...o,
  },
});
const mkTask = (event, o = {}) => strapi.db.query(GT).create({
  data: {
    title: 'Probe task', type: 'General', priority: 'Normal', garden: garden.id,
    volunteer_day: event.id, publishedAt: new Date().toISOString(), ...o,
  },
});
const get = (p) => request(strapi.server.httpServer).get(p);

describe('PROBE: draft/publish dedupe (AC15/AC16) beyond the shipped tests', () => {
  it('P1: published row WINS even when the draft was created second and titles differ', async () => {
    const ev = await mkEvent();
    const pub = await mkTask(ev, { title: 'PUBLISHEDTITLE', publishedAt: new Date().toISOString() });
    const draft = await mkTask(ev, { title: 'DRAFTTITLE', documentId: pub.documentId, publishedAt: null });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const matches = res.body.data.tasks.filter((t) => t.documentId === pub.documentId);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(pub.id);
    expect(matches[0].title).toBe('PUBLISHEDTITLE');
    expect(res.text).not.toContain('DRAFTTITLE');
    expect(draft.id).not.toBe(pub.id);
  });

  it('P2: published row WINS when the draft was created FIRST and titles differ', async () => {
    const ev = await mkEvent();
    const draft = await mkTask(ev, { title: 'DRAFTFIRSTTITLE', publishedAt: null });
    const pub = await mkTask(ev, {
      title: 'PUBSECONDTITLE', documentId: draft.documentId, publishedAt: new Date().toISOString(),
    });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const matches = res.body.data.tasks.filter((t) => t.documentId === draft.documentId);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(pub.id);
    expect(matches[0].title).toBe('PUBSECONDTITLE');
  });

  it('P3: tasks on a DRAFT event row are found via the PUBLISHED event row id and vice versa', async () => {
    const when = '2027-03-06T17:00:00.000Z';
    const pubEvent = await strapi.db.query(VD).create({
      data: {
        title: 'Two-row Event', startDatetime: when, garden: garden.id,
        canceled: false, disabled: false, confirmed: [], publishedAt: new Date().toISOString(),
      },
    });
    const draftEvent = await strapi.db.query(VD).create({
      data: {
        title: 'Two-row Event', startDatetime: when, garden: garden.id,
        canceled: false, disabled: false, confirmed: [],
        documentId: pubEvent.documentId, publishedAt: null,
      },
    });
    expect(draftEvent.id).not.toBe(pubEvent.id);
    await mkTask(draftEvent, { title: 'TASKONDRAFTEVENTROW', publishedAt: null });
    await mkTask(pubEvent, { title: 'TASKONPUBLISHEDEVENTROW' });

    const viaPub = await get(`/api/volunteer-days/by-id/${pubEvent.id}/day-sheet`);
    const titlesPub = viaPub.body.data.tasks.map((t) => t.title).sort();
    console.log('P3 via published row =', JSON.stringify(titlesPub));
    expect(titlesPub).toContain('TASKONDRAFTEVENTROW');
    expect(titlesPub).toContain('TASKONPUBLISHEDEVENTROW');

    const viaDraft = await get(`/api/volunteer-days/by-id/${draftEvent.id}/day-sheet`);
    const titlesDraft = viaDraft.body.data.tasks.map((t) => t.title).sort();
    console.log('P3 via draft row =', JSON.stringify(titlesDraft));
    expect(titlesDraft).toEqual(titlesPub);
  });

  it('P4: the assembly service never reads event.garden_tasks (source-level)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/api/volunteer-day/services/day-sheet.js'), 'utf8');
    expect(src).not.toMatch(/garden_tasks/);
  });
});

describe('PROBE: PII (AC21) against a live response with volunteers + confirmed', () => {
  it('P5: neither JSON nor HTML leaks any volunteer identity field', async () => {
    const { createUser } = require('../user/factory');
    const u = await createUser({
      username: 'probepiiuser', email: 'probepii@example.com',
      firstName: 'Qqprobefirst', lastName: 'Qqprobelast', phoneNumber: '5039998888',
    });
    const ev = await mkEvent({ title: 'PII Probe Event', confirmed: [u.id] });
    await mkTask(ev, { title: 'PII probe task', volunteers: [u.id], max_volunteers: 4 });

    const j = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const h = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html`);
    const needles = ['Qqprobefirst', 'Qqprobelast', 'probepii@example.com', '5039998888', 'probepiiuser'];
    [j, h].forEach((res) => {
      needles.forEach((n) => expect(res.text).not.toContain(n));
      expect(res.text).not.toMatch(/firstName|lastName|phoneNumber|"username"|"email"|"volunteers"/);
    });
    expect(j.body.data.tasks[0].volunteer_count).toBe(1);
    expect(j.text).not.toContain('confirmed');
  });
});

describe('PROBE: contract shape, field by field', () => {
  it('P6: JSON keys match the API contract exactly', async () => {
    await resetStanding();
    const ev = await mkEvent({ title: 'Shape Event' });
    await mkTask(ev, {
      title: 'Shape task', overview: 'o', max_volunteers: 3, status: 'INITIALIZED',
    });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?exclude=aaaaaaaa&extra=x&hideTasks=7`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(Object.keys(d).sort()).toEqual(
      ['event', 'excludedKeys', 'extras', 'hiddenTaskIds', 'meta', 'standing', 'tasks'].sort());
    expect(Object.keys(d.event).sort()).toEqual(
      ['canceled', 'documentId', 'garden', 'id', 'startDatetime', 'title'].sort());
    expect(Object.keys(d.event.garden).sort()).toEqual(['documentId', 'id', 'slug', 'title'].sort());
    expect(Object.keys(d.tasks[0]).sort()).toEqual(
      ['documentId', 'id', 'max_volunteers', 'overview', 'priority', 'status', 'title', 'type', 'volunteer_count'].sort());
    expect(Object.keys(d.meta).sort()).toEqual(
      ['generatedAt', 'printPath', 'standingCount', 'standingSource', 'taskCount'].sort());
    expect(Object.keys(d.standing[0]).sort()).toEqual(['key', 'note', 'title'].sort());
    expect(d.excludedKeys).toEqual(['aaaaaaaa']);
    expect(d.extras).toEqual(['x']);
    expect(d.hiddenTaskIds).toEqual([7]);
  });

  it('P7: PUT response shape matches the contract', async () => {
    await resetStanding();
    const { createUser } = require('../user/factory');
    const mgr = await createUser({ username: 'probe-mgr', email: 'probe-mgr@example.com' });
    await strapi.db.query('api::garden.garden').update({
      where: { id: garden.id }, data: { managers: [mgr.id] },
    });
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
    const ACTION = `${STANDING_UID}.replaceList`;
    const ex = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action: ACTION, role: { id: role.id } },
    });
    if (!ex) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: { action: ACTION, role: role.id },
      });
    }
    const jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: mgr.id });

    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ data: { standing_tasks: [{ title: 'Probe A', note: 'n' }] } });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['data']);
    expect(Object.keys(res.body.data).sort()).toEqual(['meta', 'standing']);
    expect(Object.keys(res.body.data.meta).sort()).toEqual(['standingCount', 'standingSource']);
    expect(res.body.data.standing[0]).toEqual({
      key: expect.stringMatching(/^[0-9a-f]{8}$/), title: 'Probe A', note: 'n',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    global.__probeJwt = jwt;
  });

  it('P8: administrator role WITHOUT the users-permissions grant — what actually happens', async () => {
    const { createUser } = require('../user/factory');
    const adminRole = await strapi.db.query('plugin::users-permissions.role').create({
      data: { name: 'ProbeAdmin', description: 'probe', type: 'administrator' },
    });
    const adminUser = await createUser({ username: 'probe-admin', email: 'probe-admin@example.com' });
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: adminUser.id }, data: { role: adminRole.id },
    });
    const jwt = strapi.plugins['users-permissions'].services.jwt.issue({ id: adminUser.id });
    const res = await request(strapi.server.httpServer)
      .put('/api/day-sheet-standing-tasks/list')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ data: { standing_tasks: [{ title: 'Admin no-grant' }] } });
    console.log('P8 admin-without-grant status =', res.status, JSON.stringify(res.body));
    expect([200, 403]).toContain(res.status);
  });
});

describe('PROBE: param grammar the frontend actually generates', () => {
  let ev; let t1; let t2; let t3;
  beforeAll(async () => {
    await resetStanding();
    ev = await mkEvent({ title: 'Grammar Event' });
    t1 = await mkTask(ev, { title: 'GTaskOne', priority: 'High' });
    t2 = await mkTask(ev, { title: 'GTaskTwo', priority: 'Normal' });
    t3 = await mkTask(ev, { title: 'GTaskThree', priority: 'Low' });
  });

  it('P9: the exact URL the store builds works end to end', async () => {
    const j = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const st = j.body.data.standing;
    const url = `/api/volunteer-days/by-id/${ev.id}/day-sheet.html`
      + `?exclude=${[st[0].key, st[1].key].join(',')}`
      + `&hideTasks=${[t2.id, t3.id].join(',')}`
      + `&extra=${encodeURIComponent('bring the wheelbarrow back')}`
      + `&extra=${encodeURIComponent('lock the gate')}`;
    const res = await get(url);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(st[0].title);
    expect(res.text).not.toContain(st[1].title);
    expect(res.text).toContain(st[2].title);
    expect(res.text).toContain('GTaskOne');
    expect(res.text).not.toContain('GTaskTwo');
    expect(res.text).not.toContain('GTaskThree');
    expect(res.text).toContain('bring the wheelbarrow back');
    expect(res.text).toContain('lock the gate');
  });

  it('P10: repeated ?exclude= and ?hideTasks= params are concatenated (design D5)', async () => {
    const j = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const st = j.body.data.standing;
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?exclude=${st[0].key}&exclude=${st[1].key}&hideTasks=${t1.id}&hideTasks=${t2.id}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(st[0].title);
    expect(res.text).not.toContain(st[1].title);
    expect(res.text).not.toContain('GTaskOne');
    expect(res.text).not.toContain('GTaskTwo');
    expect(res.text).toContain('GTaskThree');
  });

  it('P11: nested/object param forms are 400, not 500 and not silently accepted', async () => {
    for (const q of ['exclude[a]=b', 'extra[a]=b', 'hideTasks[a]=b']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?${q}`);
      console.log('P11', q, '->', res.status, JSON.stringify(res.body.error || res.body).slice(0, 200));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/^Invalid (exclude|extra|hideTasks) parameter$/);
    }
  });

  it('P12: exclude cap 30/31 and extra combined-length 400 cap', async () => {
    const hex = (i) => i.toString(16).padStart(8, '0');
    const thirty = Array.from({ length: 30 }, (_, i) => hex(i)).join(',');
    const thirtyOne = Array.from({ length: 31 }, (_, i) => hex(i)).join(',');
    expect((await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?exclude=${thirty}`)).status).toBe(200);
    expect((await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?exclude=${thirtyOne}`)).status).toBe(400);

    const long = 'y'.repeat(100);
    const five = Array.from({ length: 5 }, () => `extra=${long}`).join('&');
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?${five}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid extra parameter');
  });

  it('P13: a 121-char extra line is 400; a 120-char one is 200', async () => {
    const ok = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?extra=${'z'.repeat(120)}`);
    expect(ok.status).toBe(200);
    const bad = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?extra=${'z'.repeat(121)}`);
    expect(bad.status).toBe(400);
  });

  it('P14: non-numeric :id behaviour on both endpoints', async () => {
    const j = await get('/api/volunteer-days/by-id/abc/day-sheet');
    const h = await get('/api/volunteer-days/by-id/abc/day-sheet.html');
    console.log('P14 json', j.status, JSON.stringify(j.body));
    console.log('P14 html', h.status, h.headers['content-type'], JSON.stringify(h.text));
    expect(j.status).toBe(400);
    expect(h.status).toBe(400);
  });

  it('P15: JSON tasks are unfiltered and in priority order regardless of hideTasks', async () => {
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet?hideTasks=${t1.id},${t1.id},99999`);
    expect(res.body.data.tasks.map((t) => t.title)).toEqual(['GTaskOne', 'GTaskTwo', 'GTaskThree']);
    expect(res.body.data.hiddenTaskIds).toEqual([t1.id, 99999]);
  });
});

describe('PROBE: live HTML surface', () => {
  it('P16: live HTML with hostile data is colour-free, script-free, escaped', async () => {
    await resetStanding();
    const ev = await mkEvent({ title: '<img src=x onerror=1> Workday & Co' });
    await mkTask(ev, {
      title: 'Task <script>alert(1)</script>',
      overview: `${'A'.repeat(200)} tail words that go past two hundred and forty characters in total length`,
      max_volunteers: 4, priority: 'High', type: 'Weeding',
    });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?extra=${encodeURIComponent('<script>alert(1)</script>')}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    console.log('P16 nosniff =', res.headers['x-content-type-options']);
    const html = res.text;
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('src="http');
    expect(html).not.toContain('href="http');
    const hexes = html.match(/#[0-9a-fA-F]{3,6}/g) || [];
    expect(hexes.filter((h) => !['#000', '#000000', '#fff', '#ffffff'].includes(h))).toEqual([]);
    expect(html).not.toMatch(/rgba?\(|hsla?\(/);
    expect(html).toMatch(/@page\s*\{\s*size:\s*letter;\s*margin:\s*0\.5in;?\s*\}/);
    expect(html).toContain('9:00 AM');
    expect(html).toContain('Saturday, August 22, 2026');
    expect(html).toContain('Probe Garden &amp; &quot;Co&quot; &lt;b&gt;');
    expect(html).toContain('…');
    expect(html).toContain('>HIGH<');
    expect(html).toMatch(/Weeding · needs 4/);
    console.log('P16 byte length =', html.length);
  });

  it('P17: canceled event renders the plain-caps line, no red', async () => {
    const ev = await mkEvent({ title: 'Canceled Probe', canceled: true });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html`);
    expect(res.text).toContain('THIS EVENT IS CANCELED');
    expect(res.text).not.toMatch(/\b(red|crimson)\b/i);
  });

  it('P18: live density tiers derived post-filter (AC53) over HTTP', async () => {
    await strapi.service(STANDING_UID).replaceList(
      Array.from({ length: 6 }, (_, i) => ({ title: `Std ${i}`, note: null })));
    const ev = await mkEvent({ title: 'Density Probe' });
    const ids = [];
    for (let i = 0; i < 14; i++) {
      // eslint-disable-next-line no-await-in-loop
      const t = await mkTask(ev, { title: `DTask ${i}`, overview: `Overview ${i}` });
      ids.push(t.id);
    }
    const dense = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html`);
    expect(dense.text).toContain('density-packed'); // 6 + 14 = 20 printed rows
    expect(dense.text).toMatch(/>Notes</); // Notes is no longer dropped at any tier

    const compact = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?hideTasks=${ids.slice(0, 6).join(',')}`);
    expect(compact.text).toContain('density-dense'); // 6 + 8 = 14 printed rows
    expect(compact.text).toMatch(/>Notes</);
    expect(compact.text).not.toContain('Overview 6');

    const normal = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?hideTasks=${ids.slice(0, 12).join(',')}`);
    expect(normal.text).toContain('density-normal');
    expect(normal.text).toContain('Overview 12');
    await resetStanding();
  });

  it('P19: every printed item has exactly one checkbox', async () => {
    await resetStanding();
    const ev = await mkEvent({ title: 'Checkbox Probe' });
    await mkTask(ev, { title: 'CTask 1' });
    await mkTask(ev, { title: 'CTask 2' });
    const res = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?extra=one&extra=two`);
    const boxes = (res.text.match(/class="checkbox"/g) || []).length;
    const rows = (res.text.match(/<tr[ >]/g) || []).length; // blank rows carry a class
    // 5 standing defaults + 2 extras + 2 tasks + 3 blank write-in rows, one box each.
    expect(boxes).toBe(5 + 2 + 2 + 3);
    // Plus the two header rows, which carry labels rather than checkboxes.
    expect(rows).toBe(boxes + 2);
  });
});

describe('PROBE: standing-list write edge cases', () => {
  const putAs = (jwt, body) => request(strapi.server.httpServer)
    .put('/api/day-sheet-standing-tasks/list')
    .set('Authorization', `Bearer ${jwt}`)
    .send(body);

  it('P20: title normalisation collapses internal whitespace', async () => {
    const res = await putAs(global.__probeJwt, {
      data: { standing_tasks: [{ title: '  Weed   the   pathways  ', note: '  a b  ' }] },
    });
    expect(res.status).toBe(200);
    console.log('P20 stored =', JSON.stringify(res.body.data.standing));
    expect(res.body.data.standing[0].title).toBe('Weed the pathways');
  });

  it('P21: repeated saves keep one row and no orphan component rows', async () => {
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await putAs(global.__probeJwt, {
        data: { standing_tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
      });
    }
    const rows = await strapi.db.query(STANDING_UID).count({});
    expect(rows).toBe(1);
    const [{ c }] = await strapi.db.connection('components_checklist_standing_tasks').count('* as c');
    console.log('P21 component rows =', c);
    expect(Number(c)).toBe(3);
  });

  it('P22: unknown keys on an item are ignored, not persisted', async () => {
    const res = await putAs(global.__probeJwt, {
      data: { standing_tasks: [{ title: 'Keeps', note: null, garden: 1, active: false, sort_order: 9 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.standing[0]).toEqual({ key: expect.any(String), title: 'Keeps', note: null });
  });

  it('P23: identical titles collapse to one key and are excluded together', async () => {
    await putAs(global.__probeJwt, {
      data: { standing_tasks: [{ title: 'Same line' }, { title: 'Same line' }, { title: 'Other' }] },
    });
    const ev = await mkEvent({ title: 'Dup Probe' });
    const j = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet`);
    const keys = j.body.data.standing.map((s) => s.key);
    expect(keys[0]).toBe(keys[1]);
    const h = await get(`/api/volunteer-days/by-id/${ev.id}/day-sheet.html?exclude=${keys[0]}`);
    expect((h.text.match(/Same line/g) || []).length).toBe(0);
    expect(h.text).toContain('Other');
    await resetStanding();
  });

  it('P24: what the stock single-type paths actually return (AC4)', async () => {
    const s2 = () => request(strapi.server.httpServer);
    const g = await s2().get('/api/day-sheet-standing-tasks');
    const p = await s2().put('/api/day-sheet-standing-tasks').send({ data: {} });
    const d = await s2().delete('/api/day-sheet-standing-tasks');
    console.log('P24 GET', g.status, 'PUT', p.status, 'DELETE', d.status);
    const routes = [];
    strapi.server.router.stack.forEach((l) => {
      if (l.path && String(l.path).includes('day-sheet')) routes.push(`${l.methods.join('|')} ${l.path}`);
    });
    console.log('P24 registered day-sheet routes =', JSON.stringify(routes));
    expect(g.status).toBe(404);
  });
});
