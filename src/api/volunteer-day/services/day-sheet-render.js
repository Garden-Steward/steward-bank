'use strict';

/**
 * Pure HTML renderer for the printable volunteer day sheet.
 *
 * No `strapi` access, no filesystem, no network. `renderDaySheetHtml(sheet)` takes
 * exactly the `data` object the day-sheet JSON endpoint returns (see design.md D2 /
 * tasks.md Task 2) and returns a complete, self-contained HTML document as a string.
 *
 * The renderer — not the caller — applies `excludedKeys` / `hiddenTaskIds`.
 */

const { format, utcToZonedTime } = require('date-fns-tz');

const TIME_ZONE = 'America/Los_Angeles';

/**
 * Escape a value for safe placement inside HTML element text content.
 * Ampersand first, then the rest. Coerces null/undefined to ''.
 */
function escapeHtml(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Truncate `text` at `max` characters on a word boundary, appending a single
 * trailing ellipsis (U+2026) when truncation actually occurred.
 */
function truncateWords(text, max) {
  const str = String(text || '');
  if (str.length <= max) return str;
  const slice = str.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}

function formatPacific(isoString, pattern) {
  return format(utcToZonedTime(new Date(isoString), TIME_ZONE), pattern);
}

function densityFor(totalItems) {
  if (totalItems <= 10) {
    return { bodyClass: 'density-normal', showOverview: true, showNotes: true, gap: '0.30in' };
  }
  if (totalItems <= 18) {
    return { bodyClass: 'density-compact', showOverview: false, showNotes: true, gap: '0.18in' };
  }
  return { bodyClass: 'density-dense', showOverview: false, showNotes: false, gap: '0.12in' };
}

function renderStyle(gap) {
  // All colour is #000 / #fff. Type sizes are unconditional across every density tier —
  // only the item gap and the presence of certain blocks vary.
  return `
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    html, body { padding: 0; margin: 0; }
    body {
      background: #fff;
      color: #000;
      font-family: system-ui, -apple-system, Helvetica, sans-serif;
      font-size: 13pt;
    }
    h1, .section-head, .title {
      font-family: Charter, Georgia, serif;
    }
    .hint {
      padding: 8px 12px;
      border-bottom: 1px solid #000;
    }
    @media print {
      .hint { display: none; }
    }
    h1 {
      font-size: 18pt;
      font-weight: bold;
      margin: 0 0 4px 0;
    }
    .sub-line {
      font-size: 14pt;
      margin: 0 0 2px 0;
    }
    .canceled-line {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 8px 0;
    }
    .section-head {
      font-size: 18pt;
      font-weight: bold;
      break-after: avoid;
      border-top: 2px solid #000;
      padding-top: 8px;
      margin-top: 16px;
    }
    .item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      break-inside: avoid;
      margin-bottom: ${gap};
    }
    .checkbox {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #000;
      flex-shrink: 0;
      margin-top: 3px;
    }
    .item-body { flex: 1; }
    .title {
      font-size: 16pt;
      font-weight: bold;
    }
    .note, .meta, .overview {
      font-size: 13pt;
      margin-top: 2px;
    }
    .notes-section {
      border-top: 2px solid #000;
      margin-top: 16px;
      padding-top: 8px;
    }
    .notes-line {
      border-bottom: 1px solid #000;
      height: 0.4in;
    }
  `;
}

function renderHint() {
  return '<div class="hint">Press Ctrl-P / Cmd-P to print.</div>';
}

function renderHeader(event) {
  const parts = [];
  parts.push(`<h1>${escapeHtml(event.title)}</h1>`);

  if (event.garden) {
    parts.push(`<div class="sub-line">${escapeHtml(event.garden.title)}</div>`);
  }

  if (event.startDatetime) {
    const dateStr = formatPacific(event.startDatetime, 'EEEE, MMMM d, yyyy');
    const timeStr = formatPacific(event.startDatetime, 'h:mm a');
    parts.push(`<div class="sub-line">${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}</div>`);
  }

  const printedStr = formatPacific(new Date().toISOString(), 'EEEE, MMMM d, yyyy');
  parts.push(`<div class="sub-line">Printed ${escapeHtml(printedStr)}</div>`);

  if (event.canceled) {
    parts.push('<div class="canceled-line">THIS EVENT IS CANCELED</div>');
  }

  return parts.join('\n');
}

function renderEveryWorkday(printedStanding, printedExtras) {
  const items = [];

  printedStanding.forEach((s) => {
    const noteHtml = s.note && String(s.note).trim() !== ''
      ? `<div class="note">${escapeHtml(s.note)}</div>`
      : '';
    items.push(`
      <div class="item">
        <span class="checkbox"></span>
        <div class="item-body">
          <div class="title">${escapeHtml(s.title)}</div>
          ${noteHtml}
        </div>
      </div>
    `);
  });

  printedExtras.forEach((line) => {
    items.push(`
      <div class="item">
        <span class="checkbox"></span>
        <div class="item-body">
          <div class="title">${escapeHtml(line)}</div>
        </div>
      </div>
    `);
  });

  return `
    <div class="section-head">Every Workday</div>
    ${items.join('\n')}
  `;
}

function renderTasks(printedTasks, showOverview) {
  if (printedTasks.length === 0) {
    return `
      <div class="section-head">Today's Tasks</div>
      <div class="item-body">No tasks on this sheet.</div>
    `;
  }

  const items = printedTasks.map((t) => {
    const metaParts = [`${escapeHtml(t.priority)} priority`];
    if (t.type) metaParts.push(escapeHtml(t.type));
    if (typeof t.max_volunteers === 'number') metaParts.push(`needs ${t.max_volunteers}`);
    const metaLine = metaParts.join(' · ');

    let overviewHtml = '';
    if (showOverview && t.overview) {
      const truncated = truncateWords(t.overview, 240);
      overviewHtml = `<div class="overview">${escapeHtml(truncated)}</div>`;
    }

    return `
      <div class="item">
        <span class="checkbox"></span>
        <div class="item-body">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="meta">${metaLine}</div>
          ${overviewHtml}
        </div>
      </div>
    `;
  });

  return `
    <div class="section-head">Today's Tasks</div>
    ${items.join('\n')}
  `;
}

function renderNotes() {
  const lines = [1, 2, 3, 4, 5].map(() => '<div class="notes-line"></div>').join('\n');
  return `
    <div class="notes-section">
      <div class="section-head">Notes</div>
      ${lines}
    </div>
  `;
}

function renderDaySheetHtml(sheet) {
  const event = sheet.event || {};
  const standing = Array.isArray(sheet.standing) ? sheet.standing : [];
  const tasks = Array.isArray(sheet.tasks) ? sheet.tasks : [];
  const extras = Array.isArray(sheet.extras) ? sheet.extras : [];
  const excludedKeys = Array.isArray(sheet.excludedKeys) ? sheet.excludedKeys : [];
  const hiddenTaskIds = Array.isArray(sheet.hiddenTaskIds) ? sheet.hiddenTaskIds : [];

  const printedStanding = standing.filter((s) => !excludedKeys.includes(s.key));
  const printedExtras = extras;
  const printedTasks = tasks.filter((t) => !hiddenTaskIds.includes(t.id));
  const totalItems = printedStanding.length + printedExtras.length + printedTasks.length;

  const density = densityFor(totalItems);

  const bodySections = [
    renderHint(),
    renderHeader(event),
    renderEveryWorkday(printedStanding, printedExtras),
    renderTasks(printedTasks, density.showOverview),
  ];

  if (density.showNotes) {
    bodySections.push(renderNotes());
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Day Sheet — ${escapeHtml(event.title)}</title>
<style>${renderStyle(density.gap)}</style>
</head>
<body class="${density.bodyClass}">
${bodySections.join('\n')}
</body>
</html>`;
}

module.exports = { renderDaySheetHtml };
