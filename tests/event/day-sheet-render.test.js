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
    // Match colour KEYWORDS only where a value may legally appear (after ':' or
    // inside a border shorthand). The bare-word form also matched property names
    // like `white-space`, which declare no colour at all.
    expect(html).not.toMatch(/(?::|\bsolid\s|\bdashed\s)\s*(black|white|gray|grey|red|silver|transparent|currentColor)\b/);
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

  describe('AC25 — density tiers derived from printed row counts', () => {
    test('8 printed rows -> density-normal, full task notes present', () => {
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(4),
        tasks: makeTasks(4, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-normal');
      expect(html).toContain('Overview text for task 0.');
    });

    test('12 printed rows -> density-compact, task notes kept but truncated', () => {
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(5),
        tasks: makeTasks(7, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-compact');
      // The instructions are the point of the sheet; a busy day shortens them
      // rather than losing them.
      expect(html).toContain('Overview text for task');
    });

    test('21 printed rows -> density-dense, notes dropped to hold one page', () => {
      // 6 standing + 12 tasks + 3 blank write-in rows = 21.
      const html = renderDaySheetHtml(makeSheet({
        standing: makeStanding(6),
        tasks: makeTasks(12, { withOverview: true }),
        extras: [],
      }));

      expect(html).toContain('density-dense');
      expect(html).not.toContain('Overview text for task');
    });

    test('the three blank write-in rows are always present, whatever the tier', () => {
      [[2, 1], [5, 7], [6, 12], [8, 40]].forEach(([nStanding, nTasks]) => {
        const html = renderDaySheetHtml(makeSheet({
          standing: makeStanding(nStanding),
          tasks: makeTasks(nTasks, { withOverview: true }),
          extras: [],
        }));
        expect((html.match(/class="blank-row"/g) || []).length).toBe(3);
      });
    });

    test('a day too full to fit trims its lowest-priority tasks and says how many', () => {
      const tasks = [
        ...makeTasks(10).map((t, i) => ({ ...t, id: 100 + i, priority: 'High', title: `High ${i}` })),
        ...makeTasks(30).map((t, i) => ({ ...t, id: 200 + i, priority: 'Low', title: `Low ${i}` })),
      ];
      const html = renderDaySheetHtml(makeSheet({ standing: makeStanding(5), tasks, extras: [] }));

      // High-priority work survives; the tail is what gets dropped.
      expect(html).toContain('High 0');
      expect(html).toContain('Low 0');
      expect(html).not.toContain('Low 29');
      expect(html).toMatch(/lower-priority tasks? not shown/);
      // The write-in rows are never what gets sacrificed.
      expect((html.match(/class="blank-row"/g) || []).length).toBe(3);
    });

    test('the Notes block is always present, and is always exactly two ruled lines', () => {
      [[2, 2], [5, 7], [6, 12], [8, 24]].forEach(([nStanding, nTasks]) => {
        const html = renderDaySheetHtml(makeSheet({
          standing: makeStanding(nStanding),
          tasks: makeTasks(nTasks, { withOverview: true }),
          extras: [],
        }));
        expect(html).toContain('Notes');
        expect((html.match(/class="notes-line"/g) || []).length).toBe(2);
      });
    });

    test('type sizes are identical, and appear the same number of times, across tiers', () => {
      const normal = renderDaySheetHtml(makeSheet({
        standing: makeStanding(4), tasks: makeTasks(4), extras: [],
      }));
      const compact = renderDaySheetHtml(makeSheet({
        standing: makeStanding(5), tasks: makeTasks(7), extras: [],
      }));
      const dense = renderDaySheetHtml(makeSheet({
        standing: makeStanding(6), tasks: makeTasks(12), extras: [],
      }));

      const count = (html, needle) => (html.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

      ['22pt', '15pt', '13pt', '11pt'].forEach((size) => {
        expect(count(normal, size)).toBeGreaterThan(0);
        expect(count(normal, size)).toBe(count(compact, size));
        expect(count(normal, size)).toBe(count(dense, size));
      });
    });
  });

  test('AC26 — rows avoid page breaks and checkboxes stay pencil-sized', () => {
    const html = renderDaySheetHtml(makeSheet({
      standing: [{ key: 'stand0001', title: 'A standing row', note: null }],
      tasks: makeTasks(1),
    }));

    expect(html).toMatch(/table\.sheet\s+tr\s*\{[^}]*break-inside:\s*avoid/);
    expect(html).toMatch(/table\.sheet\s+td\s*\{[^}]*break-inside:\s*avoid/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*width:\s*16px/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*height:\s*16px/);
    expect(html).toMatch(/\.checkbox\s*\{[^}]*border:\s*2px solid #000/);

    // One checkbox per printed row: one standing row + one task + three blanks.
    expect((html.match(/class="checkbox"/g) || []).length).toBe(2 + 3);
  });

  test('priority is its own column, abbreviated to keep it narrow', () => {
    const html = renderDaySheetHtml(makeSheet({
      tasks: [
        { ...makeTasks(1)[0], id: 1, title: 'High one', priority: 'High' },
        { ...makeTasks(1)[0], id: 2, title: 'Normal one', priority: 'Normal' },
        { ...makeTasks(1)[0], id: 3, title: 'Low one', priority: 'Low' },
      ],
    }));

    expect(html).toContain('>Priority<');
    expect(html).toContain('>HIGH<');
    expect(html).toContain('>NORM<');
    expect(html).toContain('>LOW<');
    // The priority no longer costs a whole line under the title.
    expect(html).not.toContain('High priority');
  });

  test('AC53 — density derives from printed rows, not unfiltered totals', () => {
    const standing = makeStanding(6);
    const tasks = makeTasks(14);
    const extras = [];

    const unfiltered = renderDaySheetHtml(makeSheet({ standing, tasks, extras }));
    expect(unfiltered).toContain('density-packed'); // 6 + 14 = 20 printed rows

    const hiddenTaskIds = tasks.slice(0, 6).map((t) => t.id);
    const filtered = renderDaySheetHtml(makeSheet({ standing, tasks, extras, hiddenTaskIds }));
    expect(filtered).toContain('density-dense'); // 6 + 8 = 14 printed rows
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
