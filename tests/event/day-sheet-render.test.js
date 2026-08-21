/**
 * Unit tests for the pure printable day-sheet HTML renderer.
 *
 * No Strapi, no supertest, no setupStrapi — `renderDaySheetHtml` is a pure
 * function over the same `data` shape the day-sheet JSON endpoint returns.
 */

const { renderDaySheetHtml } = require('../../src/api/volunteer-day/services/day-sheet-render');

function makeSheet(overrides = {}) {
  const base = {
    event: {
      id: 42,
      documentId: 'k3n1p9c4x0',
      title: 'Saturday Workday',
      startDatetime: '2026-08-22T16:00:00.000Z',
      canceled: false,
      garden: { id: 3, documentId: 'b7q2z8', title: 'Triangle Garden', slug: 'triangle-garden' },
    },
    standing: [
      { key: '1a2b3c4d', title: 'Weed pathways', note: 'Start at the north gate' },
    ],
    tasks: [
      {
        id: 91,
        documentId: 't7w2m1',
        title: 'Turn the compost',
        priority: 'High',
        type: 'Weeding',
        status: 'INITIALIZED',
        overview: 'Both bins.',
        volunteer_count: 2,
        max_volunteers: 4,
      },
    ],
    excludedKeys: [],
    hiddenTaskIds: [],
    extras: [],
    meta: {
      standingSource: 'single-type',
      standingCount: 1,
      taskCount: 1,
      generatedAt: '2026-08-21T14:03:00.000Z',
      printPath: '/api/volunteer-days/by-id/42/day-sheet.html',
    },
  };

  return {
    ...base,
    ...overrides,
    event: { ...base.event, ...(overrides.event || {}) },
    meta: { ...base.meta, ...(overrides.meta || {}) },
  };
}

function makeStanding(n, opts = {}) {
  return Array.from({ length: n }, (_, i) => ({
    key: `stand${String(i).padStart(3, '0')}`,
    title: `Standing item ${i}`,
    note: opts.withNotes ? `Note for item ${i}` : null,
  }));
}

function makeTasks(n, opts = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    documentId: `doc${i}`,
    title: `Task ${i}`,
    priority: 'Normal',
    type: opts.withType ? 'Weeding' : null,
    status: 'INITIALIZED',
    overview: opts.withOverview ? `Overview text for task ${i}.` : null,
    volunteer_count: 0,
    max_volunteers: opts.withMax ? 4 : null,
  }));
}

describe('renderDaySheetHtml', () => {
  test('AC18 — document shape: @page, style, no script/link/external refs', () => {
    const html = renderDaySheetHtml(makeSheet());

    expect(html).toContain('@page');
    expect(html).toContain('size: letter');
    expect(html).toContain('margin: 0.5in');
    expect(html).toContain('<style');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('src="http');
    expect(html).not.toContain('href="http');
  });

  test('AC19 — no colour declaration other than black/white', () => {
    const html = renderDaySheetHtml(makeSheet({
      event: { canceled: true },
      standing: makeStanding(3, { withNotes: true }),
      tasks: makeTasks(3, { withOverview: true }),
    }));

    const hexes = html.match(/#[0-9a-fA-F]{3,6}/g) || [];
    expect(hexes.every((h) => ['#000', '#000000', '#fff', '#ffffff'].includes(h))).toBe(true);
    expect(html).not.toMatch(/rgba?\(|hsla?\(/);
    expect(html).not.toMatch(/\b(black|white|gray|grey|red|silver|transparent|currentColor)\b/);
  });

  test('AC20 — dangerous strings are escaped, never emitted raw', () => {
    const html = renderDaySheetHtml(makeSheet({
      event: { title: '<img src=x onerror=1>' },
      standing: [{ key: 'aaaa1111', title: '<img src=x onerror=1>', note: null }],
      extras: ['<script>alert(1)</script>'],
    }));

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  test('AC22 — header shows event title, garden title, and correctly zoned date/time', () => {
    const html = renderDaySheetHtml(makeSheet());

    expect(html).toContain('Saturday Workday');
    expect(html).toContain('Triangle Garden');
    expect(html).toContain('9:00 AM');
    expect(html).not.toContain('4:00 PM');
    expect(html).toContain('Saturday, August 22, 2026');
  });

  test('AC23 — excludedKeys drops only the matching standing row', () => {
    const items = [
      { key: 'item0001', title: 'First standing item', note: null },
      { key: 'item0002', title: 'Second standing item', note: null },
      { key: 'item0003', title: 'Third standing item', note: null },
    ];

    const excluded = renderDaySheetHtml(makeSheet({ standing: items, excludedKeys: [items[1].key] }));
    expect(excluded).toContain('First standing item');
    expect(excluded).not.toContain('Second standing item');
    expect(excluded).toContain('Third standing item');

    const staleKey = renderDaySheetHtml(makeSheet({ standing: items, excludedKeys: ['ffffffff'] }));
    expect(staleKey).toContain('First standing item');
    expect(staleKey).toContain('Second standing item');
    expect(staleKey).toContain('Third standing item');
  });

  test('AC24 — extras appear in Every Workday section, after standing, in submitted order', () => {
    const html = renderDaySheetHtml(makeSheet({
      standing: [{ key: 'stand0001', title: 'Last standing title', note: null }],
      extras: ['first extra line', 'second extra line'],
    }));

    const standingIdx = html.indexOf('Last standing title');
    const extra1Idx = html.indexOf('first extra line');
    const extra2Idx = html.indexOf('second extra line');

    expect(standingIdx).toBeGreaterThan(-1);
    expect(extra1Idx).toBeGreaterThan(standingIdx);
    expect(extra2Idx).toBeGreaterThan(extra1Idx);
  });

  describe('AC25 — density tiers derived from printed item counts', () => {
    test('8 printed items -> density-normal, overview present', () => {
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(4),
        tasks: makeTasks(4, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-normal');
      expect(html).toContain('Overview text for task 0.');
    });

    test('14 printed items -> density-compact, overview omitted entirely', () => {
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(7),
        tasks: makeTasks(7, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-compact');
      expect(html).not.toContain('Overview text for task');
    });

    test('22 printed items -> density-dense, Notes heading absent', () => {
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(11),
        tasks: makeTasks(11, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-dense');
      expect(html).not.toContain('Notes');
    });

    test('type sizes are identical, and appear the same number of times, across all three tiers', () => {
      const normal = renderDaySheetHtml(makeSheet({
        standing: makeStanding(4), tasks: makeTasks(4), extras: [],
      }));
      const compact = renderDaySheetHtml(makeSheet({
        standing: makeStanding(7), tasks: makeTasks(7), extras: [],
      }));
      const dense = renderDaySheetHtml(makeSheet({
        standing: makeStanding(11), tasks: makeTasks(11), extras: [],
      }));

      const count = (html, needle) => (html.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

      ['18pt', '16pt', '13pt'].forEach((size) => {
        expect(count(normal, size)).toBeGreaterThan(0);
        expect(count(normal, size)).toBe(count(compact, size));
        expect(count(normal, size)).toBe(count(dense, size));
      });
    });
  });

  test('AC26 — checklist/task classes carry break-inside: avoid and checkbox dimensions', () => {
    const html = renderDaySheetHtml(makeSheet({
      standing: [{ key: 'stand0001', title: 'A standing row', note: null }],
      tasks: makeTasks(1),
    }));

    expect(html).toMatch(/\.item\s*\{[^}]*break-inside:\s*avoid/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*width:\s*16px/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*height:\s*16px/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*border:\s*2px solid #000/);

    const itemCount = (html.match(/class="item"/g) || []).length;
    const checkboxCount = (html.match(/class="checkbox"/g) || []).length;
    expect(itemCount).toBe(2); // one standing row + one task
    expect(checkboxCount).toBe(2);
  });

  test('AC53 — density derives from printed items, not unfiltered totals', () => {
    const standing = makeStanding(6);
    const tasks = makeTasks(14);
    const extras = [];

    const unfiltered = renderDaySheetHtml(makeSheet({ standing, tasks, extras }));
    expect(unfiltered).toContain('density-dense'); // 6 + 14 = 20 printed items

    const hiddenTaskIds = tasks.slice(0, 6).map((t) => t.id);
    const filtered = renderDaySheetHtml(makeSheet({ standing, tasks, extras, hiddenTaskIds }));
    expect(filtered).toContain('density-compact'); // 6 + 8 = 14 printed items
  });

  test('AC54 — empty printed task list still prints the heading and the no-tasks line', () => {
    const tasks = makeTasks(3);
    const hiddenAll = renderDaySheetHtml(makeSheet({ tasks, hiddenTaskIds: tasks.map((t) => t.id) }));
    expect(hiddenAll).toContain("Today's Tasks");
    expect(hiddenAll).toContain('No tasks on this sheet.');

    const noTasks = renderDaySheetHtml(makeSheet({ tasks: [] }));
    expect(noTasks).toContain("Today's Tasks");
    expect(noTasks).toContain('No tasks on this sheet.');
  });

  test('is total and pure: missing optional fields do not throw', () => {
    expect(() => renderDaySheetHtml({
      event: { id: 1, documentId: 'x', title: 'Bare Event', startDatetime: null, canceled: false, garden: null },
    })).not.toThrow();
  });
});
