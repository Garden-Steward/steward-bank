'use strict';

const DEFAULT_RADIUS_METERS = 150;

const Geo = {};

/**
 * @returns {number}
 */
Geo.getDefaultRadiusMeters = () => {
  const parsed = parseInt(process.env.GARDEN_PROXIMITY_RADIUS_METERS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RADIUS_METERS;
};

/**
 * Haversine distance between two WGS84 points in meters.
 */
Geo.haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Validate a GeoJSON Polygon boundary (outer ring only, v1).
 * @returns {{ valid: boolean, error?: string }}
 */
Geo.validateBoundary = (boundary) => {
  if (boundary === null || boundary === undefined) {
    return { valid: true };
  }

  if (typeof boundary !== 'object' || Array.isArray(boundary)) {
    return { valid: false, error: 'boundary must be a GeoJSON Polygon object' };
  }

  if (boundary.type !== 'Polygon') {
    return { valid: false, error: 'boundary.type must be "Polygon"' };
  }

  if (!Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
    return { valid: false, error: 'boundary.coordinates must be a non-empty array' };
  }

  const ring = boundary.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return { valid: false, error: 'boundary outer ring must have at least 4 positions' };
  }

  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return { valid: false, error: 'each coordinate must be [longitude, latitude]' };
    }
    const [lng, lat] = coord;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { valid: false, error: 'longitude and latitude must be finite numbers' };
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { valid: false, error: 'coordinates out of valid WGS84 range' };
    }
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'outer ring must be closed (first and last coordinate must match)' };
  }

  return { valid: true };
};

/**
 * Ray-casting point-in-polygon test for a GeoJSON Polygon.
 * @param {number} lat WGS84 latitude
 * @param {number} lng WGS84 longitude
 * @param {{ type: string, coordinates: number[][][] }} geoJsonPolygon
 */
Geo.pointInPolygon = (lat, lng, geoJsonPolygon) => {
  if (!geoJsonPolygon || geoJsonPolygon.type !== 'Polygon') {
    return false;
  }

  const ring = geoJsonPolygon.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return false;
  }

  let inside = false;
  const x = lng;
  const y = lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

Geo.hasGardenCenter = (garden) =>
  typeof garden.latitude === 'number' &&
  typeof garden.longitude === 'number' &&
  Number.isFinite(garden.latitude) &&
  Number.isFinite(garden.longitude);

Geo.distanceToGardenCenter = (lat, lng, garden) => {
  if (!Geo.hasGardenCenter(garden)) {
    return null;
  }
  return Geo.haversineDistanceMeters(lat, lng, garden.latitude, garden.longitude);
};

/**
 * Find gardens matching a pin location. Polygon hits rank above radius hits.
 * @param {number} lat
 * @param {number} lng
 * @param {object[]} gardens
 * @param {{ radiusMeters?: number }} [options]
 * @returns {{ garden: object, distanceMeters: number|null, matchMethod: 'inside_polygon'|'within_radius' }[]}
 */
Geo.findMatchingGardens = (lat, lng, gardens, options = {}) => {
  const radiusMeters = options.radiusMeters ?? Geo.getDefaultRadiusMeters();
  const polygonMatches = [];
  const radiusMatches = [];

  for (const garden of gardens) {
    const distanceMeters = Geo.distanceToGardenCenter(lat, lng, garden);

    if (garden.boundary && Geo.validateBoundary(garden.boundary).valid) {
      if (Geo.pointInPolygon(lat, lng, garden.boundary)) {
        polygonMatches.push({
          garden,
          distanceMeters,
          matchMethod: 'inside_polygon',
        });
      }
      continue;
    }

    if (distanceMeters !== null && distanceMeters <= radiusMeters) {
      radiusMatches.push({
        garden,
        distanceMeters,
        matchMethod: 'within_radius',
      });
    }
  }

  const byDistance = (a, b) => {
    const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
    return da - db;
  };

  polygonMatches.sort(byDistance);
  radiusMatches.sort(byDistance);

  return [...polygonMatches, ...radiusMatches];
};

/**
 * Apply the best garden match to location-tracking create/update data.
 */
Geo.applyGardenSuggestion = (data, gardens, options = {}) => {
  const lat = data.latitude;
  const lng = data.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const matches = Geo.findMatchingGardens(lat, lng, gardens, options);
  if (matches.length === 0) {
    data.garden = null;
    data.garden_assignment_status = 'unassigned';
    data.suggested_distance_meters = null;
    data.suggested_match_method = null;
    return;
  }

  const best = matches[0];
  data.garden = best.garden.id;
  data.garden_assignment_status = 'pending_confirmation';
  data.suggested_distance_meters = best.distanceMeters;
  data.suggested_match_method = best.matchMethod;
};

Geo.formatGardenMatch = (match) => ({
  garden: {
    id: match.garden.id,
    title: match.garden.title,
    slug: match.garden.slug,
    latitude: match.garden.latitude,
    longitude: match.garden.longitude,
  },
  distanceMeters: match.distanceMeters,
  matchMethod: match.matchMethod,
});

module.exports = Geo;
