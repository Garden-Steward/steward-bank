'use strict';

/**
 * Pure HTML renderer for the printable volunteer day sheet.
 *
 * No `strapi` access, no filesystem, no network. `renderDaySheetHtml(sheet)` takes
 * exactly the `data` object the day-sheet JSON endpoint returns (see design.md D2 /
 * tasks.md Task 2) and returns a complete, self-contained HTML document as a string.
 *
 * The renderer — not the caller — applies `excludedKeys` / `hiddenTaskIds`.
 *
 * The sheet is a two-column table of checkboxes and work, with a priority column on
 * the day's tasks. It must come out of the printer on ONE page: a second sheet that
 * is nine-tenths blank is worse than a tighter first one, so as the day gets busier
 * the row spacing closes up and task notes are trimmed, in that order. Type sizes
 * never shrink — the sheet is read outdoors in glare, and that is the one thing worth
 * spending the space on.
 */

const { format, utcToZonedTime } = require('date-fns-tz');

const TIME_ZONE = 'America/Los_Angeles';

/** Abbreviations keep the priority column narrow enough to earn its place. */
const PRIORITY_LABEL = { High: 'HIGH', Normal: 'NORM', Low: 'LOW' };

/**
 * Blank write-in rows, always printed at the foot of the task table. Work gets
 * discovered standing in the garden, and a sheet with nowhere to add it sends
 * people back to their phones.
 */
const BLANK_ROWS = 3;

/**
 * The most rows that fit on one page, measured by rendering to PDF and counting
 * pages — not estimated. Thirty rows spills onto a second, near-empty page, which
 * is worse than printing one task fewer. The cap sits one row below the measured
 * limit so the "not shown" notice, which only appears when trimming happened, has
 * somewhere to go.
 */
const MAX_ROWS = 28;

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

/**
 * Pick the layout tier from the number of rows that will actually print.
 *
 * Tuned against rendered page counts, not guessed: `rowPad` and `noteChars` are the
 * only levers, and the tiers are set so the busiest realistic sheet still lands on
 * one page. `noteChars` of 0 drops task notes entirely, which only happens once the
 * row count alone would overflow. The blank write-in rows are counted here too —
 * they occupy the page exactly like a printed task.
 */
function densityFor(printedRows) {
  if (printedRows <= 11) {
    return { bodyClass: 'density-normal', rowPad: '0.070in', noteChars: 200, noteGap: '0.38in' };
  }
  if (printedRows <= 16) {
    return { bodyClass: 'density-compact', rowPad: '0.038in', noteChars: 72, noteGap: '0.24in' };
  }
  if (printedRows <= 21) {
    return { bodyClass: 'density-dense', rowPad: '0.026in', noteChars: 0, noteGap: '0.18in' };
  }
  if (printedRows <= 26) {
    return { bodyClass: 'density-packed', rowPad: '0.014in', noteChars: 0, noteGap: '0.13in' };
  }
  return { bodyClass: 'density-max', rowPad: '0.005in', noteChars: 0, noteGap: '0.09in' };
}

function renderStyle(d) {
  // Every colour here is #000 or #fff. Type sizes are identical in all four tiers;
  // only row padding, note length and the notes gap vary.
  return `
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body {
      font-family: system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13pt;
      line-height: 1.28;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hint { font-size: 10pt; margin-bottom: 0.10in; }
    @media print { .hint { display: none; } }

    h1 {
      font-family: Charter, "Bitstream Charter", Georgia, serif;
      font-size: 22pt;
      font-weight: 700;
      margin: 0 0 0.02in 0;
      line-height: 1.12;
    }
    .sub-line { font-size: 12pt; margin: 0; }
    .meta-line { font-size: 11pt; margin: 0.03in 0 0 0; }
    .canceled-line {
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin: 0.06in 0 0 0;
      padding: 0.04in 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
    }

    .section { margin-top: 0.11in; }
    .section-head {
      font-family: Charter, "Bitstream Charter", Georgia, serif;
      font-size: 15pt;
      font-weight: 700;
      margin: 0 0 0.03in 0;
      padding-bottom: 0.02in;
      border-bottom: 2px solid #000;
    }

    table.sheet { width: 100%; border-collapse: collapse; }
    table.sheet th {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: left;
      padding: 0 0.12in 0.03in 0;
      border-bottom: 1px solid #000;
      white-space: nowrap;
    }
    table.sheet td {
      padding-top: ${d.rowPad};
      padding-bottom: ${d.rowPad};
      padding-right: 0.12in;
      border-bottom: 1px solid #000;
      vertical-align: top;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.sheet tr { break-inside: avoid; page-break-inside: avoid; }

    .col-box { width: 0.46in; }
    .col-pri { width: 0.80in; }

    .checkbox {
      display: block;
      width: 16px;
      height: 16px;
      border: 2px solid #000;
      margin-top: 0.02in;
    }
    .pri { font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
    .title { font-size: 13pt; font-weight: 700; }
    .note { font-size: 11pt; font-weight: 400; margin-top: 0.01in; }
    .empty { font-size: 12pt; padding: 0.06in 0; }

    .notes-head {
      font-family: Charter, "Bitstream Charter", Georgia, serif;
      font-size: 13pt;
      font-weight: 700;
      margin: 0 0 ${d.noteGap} 0;
    }
    .notes-line { border-bottom: 1px solid #000; margin-bottom: ${d.noteGap}; }
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

  // Event date and print date share one line — two lines of dates at the top of a
  // one-page sheet is space the tasks need more.
  const metaBits = [];
  if (event.startDatetime) {
    const dateStr = formatPacific(event.startDatetime, 'EEEE, MMMM d, yyyy');
    const timeStr = formatPacific(event.startDatetime, 'h:mm a');
    metaBits.push(`${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}`);
  }
  metaBits.push(`printed ${escapeHtml(formatPacific(new Date().toISOString(), 'MMM d'))}`);
  parts.push(`<div class="meta-line">${metaBits.join(' · ')}</div>`);

  if (event.canceled) {
    parts.push('<div class="canceled-line">THIS EVENT IS CANCELED</div>');
  }

  return parts.join('\n');
}

function renderEveryWorkday(printedStanding, printedExtras, noteChars) {
  const rows = [];

  printedStanding.forEach((s) => {
    const hasNote = noteChars > 0 && s.note && String(s.note).trim() !== '';
    const noteHtml = hasNote
      ? `<div class="note">${escapeHtml(truncateWords(s.note, noteChars))}</div>`
      : '';
    rows.push(`
      <tr>
        <td class="col-box"><span class="checkbox"></span></td>
        <td><div class="title">${escapeHtml(s.title)}</div>${noteHtml}</td>
      </tr>
    `);
  });

  printedExtras.forEach((line) => {
    rows.push(`
      <tr>
        <td class="col-box"><span class="checkbox"></span></td>
        <td><div class="title">${escapeHtml(line)}</div></td>
      </tr>
    `);
  });

  if (rows.length === 0) {
    return '';
  }

  return `
    <div class="section">
      <div class="section-head">Every Workday</div>
      <table class="sheet">
        <thead>
          <tr><th class="col-box">Done</th><th>Task</th></tr>
        </thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTasks(printedTasks, noteChars, omittedCount) {
  const rows = printedTasks.map((t) => {
    const label = PRIORITY_LABEL[t.priority] || String(t.priority || '').toUpperCase();

    const detailBits = [];
    if (t.type) detailBits.push(escapeHtml(t.type));
    if (typeof t.max_volunteers === 'number') detailBits.push(`needs ${t.max_volunteers}`);
    if (noteChars > 0 && t.overview) {
      detailBits.push(escapeHtml(truncateWords(t.overview, noteChars)));
    }
    const detailHtml = detailBits.length
      ? `<div class="note">${detailBits.join(' · ')}</div>`
      : '';

    return `
      <tr>
        <td class="col-box"><span class="checkbox"></span></td>
        <td class="col-pri"><span class="pri">${escapeHtml(label)}</span></td>
        <td><div class="title">${escapeHtml(t.title)}</div>${detailHtml}</td>
      </tr>
    `;
  });

  // Blank rows mirror the shape of a real task row at this density — title line,
  // plus a note line when the printed tasks carry one — so they stand the same
  // height as the rows above them. A shorter line is awkward to write on.
  const blankSpacer = noteChars > 0
    ? '<div class="title">&nbsp;</div><div class="note">&nbsp;</div>'
    : '<div class="title">&nbsp;</div>';
  for (let i = 0; i < BLANK_ROWS; i += 1) {
    rows.push(`
      <tr class="blank-row">
        <td class="col-box"><span class="checkbox"></span></td>
        <td class="col-pri"><span class="pri">&nbsp;</span></td>
        <td>${blankSpacer}</td>
      </tr>
    `);
  }

  const emptyLine = printedTasks.length === 0
    ? '<div class="empty">No tasks on this sheet.</div>'
    : '';

  const omittedLine = omittedCount > 0
    ? `<div class="empty">${omittedCount} lower-priority task${omittedCount === 1 ? '' : 's'} not shown — see the app.</div>`
    : '';

  return `
    <div class="section">
      <div class="section-head">Today's Tasks</div>
      ${emptyLine}
      <table class="sheet">
        <thead>
          <tr>
            <th class="col-box">Done</th>
            <th class="col-pri">Priority</th>
            <th>Task</th>
          </tr>
        </thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
      ${omittedLine}
    </div>
  `;
}

/**
 * Two ruled lines with generous space around them. People write directly on the
 * paper; a block of tightly packed rules just wastes the bottom of the sheet.
 */
function renderNotes() {
  return `
    <div class="section">
      <div class="notes-head">Notes</div>
      <div class="notes-line"></div>
      <div class="notes-line"></div>
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
  const allPrintedTasks = tasks.filter((t) => !hiddenTaskIds.includes(t.id));

  // The three write-in rows are not negotiable, so they claim their space first.
  // Tasks arrive sorted High -> Normal -> Low, so trimming from the tail sheds the
  // least important work; the reader is told a count is missing rather than being
  // left to wonder.
  const fixedRows = printedStanding.length + printedExtras.length + BLANK_ROWS;
  const roomForTasks = Math.max(0, MAX_ROWS - fixedRows);
  // Trimming costs one further row for the "not shown" notice, so the capacity when
  // we do trim is one lower than the capacity when everything fits.
  const willTrim = allPrintedTasks.length > roomForTasks;
  const taskCapacity = willTrim ? Math.max(0, roomForTasks - 1) : roomForTasks;
  const omittedCount = Math.max(0, allPrintedTasks.length - taskCapacity);
  const printedTasks = omittedCount > 0 ? allPrintedTasks.slice(0, taskCapacity) : allPrintedTasks;

  const printedRows = fixedRows + printedTasks.length;

  const density = densityFor(printedRows);

  const bodySections = [
    renderHint(),
    renderHeader(event),
    renderEveryWorkday(printedStanding, printedExtras, density.noteChars),
    renderTasks(printedTasks, density.noteChars, omittedCount),
    renderNotes(),
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Day Sheet — ${escapeHtml(event.title)}</title>
<style>${renderStyle(density)}</style>
</head>
<body class="${density.bodyClass}">
${bodySections.join('\n')}
</body>
</html>`;
}

module.exports = { renderDaySheetHtml };
