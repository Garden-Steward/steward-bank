'use strict';

// Standalone unit tests for countSegments (no Strapi boot).
const { countSegments, GSM7_BASIC, GSM7_EXTENSION } = require('../../src/utils/sms-segments');

const rep = (s, n) => s.repeat(n);

describe('billing: segments', () => {
  describe('AC1: empty input', () => {
    it.each([['empty string', ''], ['null', null], ['undefined', undefined]])('%s gives one gsm7 segment', (_label, input) => {
      expect(countSegments(input)).toEqual({ segments: 1, encoding: 'gsm7' });
    });
  });

  describe('AC2: GSM-7 boundaries', () => {
    it.each([
      [160, 1],
      [161, 2],
      [306, 2],
      [307, 3],
    ])("'a' x%i gives %i segment(s)", (n, segments) => {
      expect(countSegments(rep('a', n))).toEqual({ segments, encoding: 'gsm7' });
    });
  });

  describe('AC3: extension characters cost 2 septets', () => {
    it('158 chars plus a euro sign fits in one segment', () => {
      expect(countSegments(rep('a', 158) + '€')).toEqual({ segments: 1, encoding: 'gsm7' });
    });

    it('159 chars plus a euro sign needs two segments', () => {
      expect(countSegments(rep('a', 159) + '€')).toEqual({ segments: 2, encoding: 'gsm7' });
    });

    it.each(['^', '{', '}', '\\', '[', '~', ']', '|', '€'])('%s x80 gives 1 and x81 gives 2', (ch) => {
      expect(countSegments(rep(ch, 80))).toEqual({ segments: 1, encoding: 'gsm7' });
      expect(countSegments(rep(ch, 81))).toEqual({ segments: 2, encoding: 'gsm7' });
    });
  });

  describe('AC4: an escape sequence is never split', () => {
    it("'a' x152 + euro + 'a' x152 gives 3 segments", () => {
      expect(countSegments(rep('a', 152) + '€' + rep('a', 152))).toEqual({ segments: 3, encoding: 'gsm7' });
    });
  });

  describe('AC5: UCS-2 boundaries', () => {
    it.each([
      [70, 1],
      [71, 2],
      [134, 2],
      [135, 3],
    ])("'中' x%i gives %i segment(s)", (n, segments) => {
      expect(countSegments(rep('中', n))).toEqual({ segments, encoding: 'ucs2' });
    });

    it('a single non-GSM character switches the whole message to ucs2', () => {
      expect(countSegments(rep('a', 100) + '’')).toEqual({ segments: 2, encoding: 'ucs2' });
    });
  });

  describe('AC6: an emoji is never split', () => {
    it("'😀' x35 gives 1 and x36 gives 2", () => {
      expect(countSegments(rep('😀', 35))).toEqual({ segments: 1, encoding: 'ucs2' });
      expect(countSegments(rep('😀', 36))).toEqual({ segments: 2, encoding: 'ucs2' });
    });

    it("'中' x66 + emoji + '中' x66 gives 3 segments", () => {
      expect(countSegments(rep('中', 66) + '😀' + rep('中', 66))).toEqual({ segments: 3, encoding: 'ucs2' });
    });
  });

  describe('extras', () => {
    it('a backtick is not in the GSM alphabet, so it is ucs2', () => {
      expect(countSegments('`')).toEqual({ segments: 1, encoding: 'ucs2' });
    });

    it('form feed is a GSM extension character', () => {
      expect(countSegments('\f')).toEqual({ segments: 1, encoding: 'gsm7' });
    });

    it('exports the character sets as sets of single code units', () => {
      expect(GSM7_BASIC.size).toBe(127);
      expect(GSM7_BASIC.has('\u001b')).toBe(false);
      expect(GSM7_EXTENSION.size).toBe(10);
      for (const ch of [...GSM7_BASIC, ...GSM7_EXTENSION]) expect(ch).toHaveLength(1);
    });
  });
});
