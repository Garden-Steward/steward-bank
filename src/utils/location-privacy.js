'use strict';

/**
 * Approximate garden locations for signed-out callers.
 *
 * Port of garden-vue src/helpers/location-privacy.js; keep the two in step.
 * The point is moved about 20 ft off the true spot, in a direction taken from
 * a hash of the garden's id, so it is the same on every request: a fresh
 * random offset each time would let someone average a few calls back to the
 * real point.
 */

const FOOT_M = 0.3048;
const CENTER_OFFSET_M = 20 * FOOT_M;
const EARTH_RADIUS_M = 6371000;

function hashToUnit(seed) {
  const str = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** About 20 ft off the true center, or null when the input isn't a point. */
function approximateCenter(latitude, longitude, seed) {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const bearing = hashToUnit(seed) * 2 * Math.PI;
  const dLat = (CENTER_OFFSET_M * Math.cos(bearing)) / EARTH_RADIUS_M;
  const dLng = (CENTER_OFFSET_M * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180));

  return {
    latitude: lat + dLat * 180 / Math.PI,
    longitude: lng + dLng * 180 / Math.PI,
  };
}

module.exports = { approximateCenter, hashToUnit, CENTER_OFFSET_M };
