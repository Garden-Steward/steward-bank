'use strict';

/**
 * SMS segment counting.
 *
 * Pure helper, no Strapi and no I/O. Estimates how many segments Twilio will
 * bill for a message body, so the ledger has a number before the send and a
 * fallback when Twilio's own `numSegments` is missing.
 *
 * Rules (3GPP TS 23.038 / Twilio):
 * - GSM-7 body: 160 septets in one segment, 153 per segment once concatenated.
 *   Extension characters cost 2 septets and are never split across segments.
 * - Anything else is UCS-2: 70 code units in one segment, 67 per segment once
 *   concatenated. A surrogate pair (emoji) is never split.
 * - No Smart Encoding substitution: a curly quote makes the whole message UCS-2.
 */

// 3GPP TS 23.038 default alphabet, minus ESC (0x1B). The backtick is not in it,
// so a message containing one is UCS-2 (this matches the standard and Twilio).
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split('')
);

// Reached via the ESC prefix, so each costs 2 septets.
const GSM7_EXTENSION = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€', '\f']);

const GSM7_SINGLE = 160;
const GSM7_MULTI = 153;
const UCS2_SINGLE = 70;
const UCS2_MULTI = 67;

// Greedy packing: an item that does not fit in the current segment starts a new one.
const pack = (costs, perSegment) => {
  let segments = 1;
  let used = 0;
  for (const c of costs) {
    if (used + c > perSegment) {
      segments++;
      used = 0;
    }
    used += c;
  }
  return segments;
};

const countSegments = (body) => {
  const text = body == null ? '' : String(body);

  let isGsm7 = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENSION.has(ch)) {
      isGsm7 = false;
      break;
    }
  }

  if (isGsm7) {
    const costs = [];
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      const c = GSM7_EXTENSION.has(text[i]) ? 2 : 1;
      costs.push(c);
      total += c;
    }
    if (total <= GSM7_SINGLE) return { segments: 1, encoding: 'gsm7' };
    return { segments: pack(costs, GSM7_MULTI), encoding: 'gsm7' };
  }

  if (text.length <= UCS2_SINGLE) return { segments: 1, encoding: 'ucs2' };
  const costs = [];
  for (const ch of text) costs.push(ch.length);
  return { segments: pack(costs, UCS2_MULTI), encoding: 'ucs2' };
};

module.exports = { countSegments, GSM7_BASIC, GSM7_EXTENSION };
