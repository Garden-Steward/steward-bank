'use strict';

/**
 * Coordinates → { city, zip } via OpenStreetMap Nominatim.
 *
 * Used once per approved project (see api::project-alert), well inside
 * Nominatim's 1 request/second policy. Returns null on any failure so callers
 * can skip quietly.
 */

const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'GardenSteward/1.0 (noreply@steward.garden)';

/** Pull city + 5-digit zip out of a Nominatim `address` object. */
function parseAddress(address) {
  if (!address) return null;
  const city = address.city || address.town || address.village || address.hamlet || address.municipality || null;
  const zipMatch = String(address.postcode || '').match(/\d{5}/);
  const state = address.state || null;
  if (!city && !zipMatch) return null;
  return { city, zip: zipMatch ? zipMatch[0] : null, state };
}

async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: { format: 'jsonv2', lat, lon: lng, zoom: 18, addressdetails: 1 },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 5000,
    });
    return parseAddress(data?.address);
  } catch (err) {
    global.strapi?.log?.warn?.(`[reverse-geocode] ${lat},${lng} failed: ${err.message}`);
    return null;
  }
}

module.exports = { reverseGeocode, parseAddress };
