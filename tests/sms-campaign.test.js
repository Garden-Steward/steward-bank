/**
 * Unit tests for sms-campaign service helpers
 *
 * Tests for pollOptionDesc(), formatPollOption(), and other pure functions
 * from the sms-campaign service, without requiring Strapi boot.
 */

// ---------- Helpers extracted from sms-campaign service ----------

const pollOptionDesc = (o) => {
  const dateTime = o.date && o.time ? `${o.date} @ ${o.time}` : (o.date || o.time || '');
  return [dateTime, o.text_option || o.location].filter(Boolean).join(' - ');
};

const formatPollOption = (o) => `${o.label?.toUpperCase()}: ${pollOptionDesc(o)}`;

// Tally and winner logic from closePoll()
function calculateTally(campaign) {
  return {
    a: (campaign.option_a || []).length,
    b: (campaign.option_b || []).length,
    c: (campaign.option_c || []).length,
    d: (campaign.option_d || []).length,
  };
}

function determineWinner(tally) {
  const entries = Object.entries(tally)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

function buildVoteSummary(tally, totalVotes, winnerLetter, pollOptions) {
  if (!winnerLetter) {
    return 'Poll closed with no votes.';
  }
  const winningOption = (pollOptions || []).find(
    o => o.label?.toLowerCase() === winnerLetter
  );
  const winnerDesc = winningOption ? ` (${pollOptionDesc(winningOption)})` : '';
  const tallyLines = Object.entries(tally)
    .filter(([, count]) => count > 0)
    .map(([letter, count]) => `${letter.toUpperCase()}: ${count} vote${count !== 1 ? 's' : ''}`)
    .join(', ');
  return `Winner: ${winnerLetter.toUpperCase()}${winnerDesc} with ${tally[winnerLetter]} of ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}. Tally: ${tallyLines}.`;
}

// ---------- Tests ----------

describe('sms-campaign pollOptionDesc', () => {

  it('should format date and time with @ separator', () => {
    expect(pollOptionDesc({ date: 'June 1st', time: '11am' })).toBe('June 1st @ 11am');
  });

  it('should return date only when no time', () => {
    expect(pollOptionDesc({ date: 'June 1st' })).toBe('June 1st');
  });

  it('should return time only when no date', () => {
    expect(pollOptionDesc({ time: '11am' })).toBe('11am');
  });

  it('should append text_option with dash separator', () => {
    const opt = { date: 'June 1st', time: '11am', text_option: 'Main Garden' };
    expect(pollOptionDesc(opt)).toBe('June 1st @ 11am - Main Garden');
  });

  it('should fall back to location when text_option missing', () => {
    const opt = { date: 'June 1st', time: '11am', location: 'Community Center' };
    expect(pollOptionDesc(opt)).toBe('June 1st @ 11am - Community Center');
  });

  it('should prefer text_option over location', () => {
    const opt = { date: 'June 1st', text_option: 'Garden A', location: 'Garden B' };
    expect(pollOptionDesc(opt)).toBe('June 1st - Garden A');
  });

  it('should return empty string for empty object', () => {
    expect(pollOptionDesc({})).toBe('');
  });

  it('should handle null fields', () => {
    expect(pollOptionDesc({ date: null, time: undefined, text_option: null })).toBe('');
  });

  it('should handle date + location without time', () => {
    expect(pollOptionDesc({ date: 'Oct 15', location: 'Tool Shed' })).toBe('Oct 15 - Tool Shed');
  });

  it('should handle time + text_option without date', () => {
    expect(pollOptionDesc({ time: '2pm', text_option: 'Secret Garden' })).toBe('2pm - Secret Garden');
  });

  it('should handle only text_option', () => {
    expect(pollOptionDesc({ text_option: 'Rose Garden' })).toBe('Rose Garden');
  });

  it('should handle only location', () => {
    expect(pollOptionDesc({ location: 'Main Entrance' })).toBe('Main Entrance');
  });
});

describe('sms-campaign formatPollOption', () => {

  it('should uppercase a lowercase label', () => {
    expect(formatPollOption({ label: 'a', date: 'June 1st' })).toBe('A: June 1st');
  });

  it('should keep uppercase label', () => {
    expect(formatPollOption({ label: 'B', time: '11am' })).toBe('B: 11am');
  });

  it('should format with full details', () => {
    const opt = { label: 'c', date: 'June 1st', time: '11am', text_option: 'Main Garden' };
    expect(formatPollOption(opt)).toBe('C: June 1st @ 11am - Main Garden');
  });

  it('should handle undefined label with optional chaining', () => {
    const result = formatPollOption({ date: 'June 1st' });
    // undefined?.toUpperCase() → undefined, String(undefined) → 'undefined'
    expect(result.startsWith('undefined:')).toBe(true);
  });

  it('should handle null label', () => {
      const result = formatPollOption({ label: null, date: 'June 1st' });
      // null?.toUpperCase() returns undefined, so output starts with 'undefined:'
      expect(result.startsWith('undefined:')).toBe(true);
    });
});

describe('sms-campaign poll tally and winner logic', () => {

  it('should tally votes correctly', () => {
    const campaign = {
      option_a: [{ id: 1 }, { id: 2 }],
      option_b: [{ id: 3 }],
      option_c: [],
      option_d: [{ id: 4 }, { id: 5 }, { id: 6 }],
    };
    const tally = calculateTally(campaign);
    expect(tally).toEqual({ a: 2, b: 1, c: 0, d: 3 });
  });

  it('should handle empty options', () => {
    const campaign = {};
    const tally = calculateTally(campaign);
    expect(tally).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('should determine winner by highest count', () => {
    const tally = { a: 2, b: 1, c: 5, d: 0 };
    expect(determineWinner(tally)).toBe('c');
  });

  it('should resolve ties by earliest letter', () => {
    const tally = { a: 3, b: 3, c: 1, d: 0 };
    expect(determineWinner(tally)).toBe('a');
  });

  it('should return null when no votes', () => {
    const tally = { a: 0, b: 0, c: 0, d: 0 };
    expect(determineWinner(tally)).toBeNull();
  });

  it('should build vote summary with winner', () => {
    const tally = { a: 3, b: 1, c: 0, d: 0 };
    const summary = buildVoteSummary(tally, 4, 'a', [
      { label: 'a', date: 'June 1st', time: '11am' },
    ]);
    expect(summary).toContain('Winner: A');
    expect(summary).toContain('June 1st @ 11am');
    expect(summary).toContain('3 of 4');
    expect(summary).toContain('A: 3 votes');
    expect(summary).toContain('B: 1 vote');
  });

  it('should build vote summary with no winner', () => {
    const summary = buildVoteSummary({ a: 0, b: 0, c: 0, d: 0 }, 0, null, []);
    expect(summary).toBe('Poll closed with no votes.');
  });

  it('should build vote summary with single vote totals', () => {
    const tally = { a: 1, b: 0, c: 0, d: 0 };
    const summary = buildVoteSummary(tally, 1, 'a', []);
    expect(summary).toContain('A: 1 vote');
    expect(summary).toContain('1 of 1');
    expect(summary).not.toContain('votes'); // singular
  });

  it('should handle missing poll_options gracefully in summary', () => {
    const tally = { a: 3, b: 0, c: 0, d: 0 };
    const summary = buildVoteSummary(tally, 3, 'a', undefined);
    // Should not crash — pollOptions || [] catches undefined
    expect(summary).toContain('Winner: A');
    expect(summary).not.toContain('undefined');
  });
});

describe('sms-campaign poll input parsing', () => {

  it('should normalize comma-separated letters', () => {
    const input = 'A,B';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['a', 'b']);
  });

  it('should normalize space-separated letters', () => {
    const input = 'a b';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['a', 'b']);
  });

  it('should normalize combined letters without separator', () => {
    const input = 'ab';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['a', 'b']);
  });

  it('should deduplicate repeated letters', () => {
    const input = 'a a a';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['a']);
  });

  it('should reject invalid letters', () => {
    const input = 'a e x';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['a']);
  });

  it('should return empty array for completely invalid input', () => {
    const input = 'xyz';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toHaveLength(0);
  });

  it('should handle single letter', () => {
    const input = 'c';
    const letters = [...new Set(
      input.replace(/[\s,]+/g, '').toLowerCase().split('').filter(l => /^[a-d]$/.test(l))
    )];
    expect(letters).toEqual(['c']);
  });
});