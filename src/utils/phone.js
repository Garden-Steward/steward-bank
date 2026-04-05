'use strict';

/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 * Strips non-digit characters, validates 10 or 11 digit US numbers,
 * and prepends +1 if missing.
 *
 * @param {string|number} phoneNumber
 * @returns {{ valid: boolean, phoneNumber?: string, message?: string }}
 */
function normalizePhoneNumber(phoneNumber) {
  const digits = `${phoneNumber}`.replace(/[^\d]/g, '');

  const phoneRegex = /^(1?[2-9]\d{9})$/;
  if (!phoneRegex.test(digits)) {
    return {
      valid: false,
      message: 'Invalid US phone number format. Please provide a 10-digit number with or without the country code.',
    };
  }

  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  return { valid: true, phoneNumber: normalized };
}

module.exports = { normalizePhoneNumber };
