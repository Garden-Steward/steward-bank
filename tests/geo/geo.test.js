/**
 * Unit tests for garden geographic matching helpers.
 */

const Geo = require('../../config/helpers/geo');

const DOWNTOWN_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[
    [-122.3326, 47.6057],
    [-122.3316, 47.6057],
    [-122.3316, 47.6067],
    [-122.3326, 47.6067],
    [-122.3326, 47.6057],
  ]],
};

const downtownGarden = {
  id: 1,
  title: 'Downtown Community Garden',
  slug: 'downtown-garden',
  latitude: 47.6062,
  longitude: -122.3321,
  boundary: DOWNTOWN_BOUNDARY,
};

const legacyGarden = {
  id: 2,
  title: 'Legacy Garden',
  slug: 'legacy-garden',
  latitude: 47.6085,
  longitude: -122.3340,
};

describe('Geo.validateBoundary', () => {
  it('accepts null boundary', () => {
    expect(Geo.validateBoundary(null).valid).toBe(true);
  });

  it('accepts a valid closed polygon', () => {
    expect(Geo.validateBoundary(DOWNTOWN_BOUNDARY).valid).toBe(true);
  });

  it('rejects an unclosed ring', () => {
    const result = Geo.validateBoundary({
      type: 'Polygon',
      coordinates: [[
        [-122.3326, 47.6057],
        [-122.3316, 47.6057],
        [-122.3316, 47.6067],
        [-122.3326, 47.6067],
      ]],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/closed/i);
  });

  it('rejects non-polygon types', () => {
    const result = Geo.validateBoundary({ type: 'Point', coordinates: [-122.33, 47.60] });
    expect(result.valid).toBe(false);
  });
});

describe('Geo.pointInPolygon', () => {
  it('returns true for a point inside the square', () => {
    expect(Geo.pointInPolygon(47.6062, -122.3321, DOWNTOWN_BOUNDARY)).toBe(true);
  });

  it('returns false for a point outside the square', () => {
    expect(Geo.pointInPolygon(47.6100, -122.3321, DOWNTOWN_BOUNDARY)).toBe(false);
  });
});

describe('Geo.haversineDistanceMeters', () => {
  it('returns zero for identical points', () => {
    expect(Geo.haversineDistanceMeters(47.6062, -122.3321, 47.6062, -122.3321)).toBe(0);
  });

  it('returns a positive distance for separated points', () => {
    const distance = Geo.haversineDistanceMeters(47.6062, -122.3321, 47.6085, -122.3340);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(500);
  });
});

describe('Geo.findMatchingGardens', () => {
  it('matches by polygon when boundary exists', () => {
    const matches = Geo.findMatchingGardens(47.6062, -122.3321, [downtownGarden], {
      radiusMeters: 10,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchMethod).toBe('inside_polygon');
    expect(matches[0].garden.id).toBe(1);
  });

  it('does not radius-match a garden that has a boundary but pin is outside', () => {
    const matches = Geo.findMatchingGardens(47.6100, -122.3321, [downtownGarden], {
      radiusMeters: 5000,
    });
    expect(matches).toHaveLength(0);
  });

  it('falls back to radius when garden has no boundary', () => {
    const matches = Geo.findMatchingGardens(47.6085, -122.3340, [legacyGarden], {
      radiusMeters: 150,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchMethod).toBe('within_radius');
    expect(matches[0].garden.id).toBe(2);
  });

  it('returns multiple polygon matches when overlapping', () => {
    const overlapping = {
      id: 3,
      title: 'Overlap Garden',
      slug: 'overlap-garden',
      latitude: 47.6062,
      longitude: -122.3321,
      boundary: DOWNTOWN_BOUNDARY,
    };
    const matches = Geo.findMatchingGardens(47.6062, -122.3321, [downtownGarden, overlapping], {
      radiusMeters: 150,
    });
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.matchMethod === 'inside_polygon')).toBe(true);
  });

  it('sorts polygon matches before radius matches', () => {
    const matches = Geo.findMatchingGardens(47.6062, -122.3321, [legacyGarden, downtownGarden], {
      radiusMeters: 5000,
    });
    expect(matches).toHaveLength(2);
    expect(matches[0].matchMethod).toBe('inside_polygon');
    expect(matches[1].matchMethod).toBe('within_radius');
  });
});

describe('Geo.applyGardenSuggestion', () => {
  it('sets pending_confirmation when a match exists', () => {
    const data = { latitude: 47.6062, longitude: -122.3321 };
    Geo.applyGardenSuggestion(data, [downtownGarden], { radiusMeters: 150 });
    expect(data.garden).toBe(1);
    expect(data.garden_assignment_status).toBe('pending_confirmation');
    expect(data.suggested_match_method).toBe('inside_polygon');
  });

  it('sets unassigned when no match exists', () => {
    const data = { latitude: 47.7000, longitude: -122.5000 };
    Geo.applyGardenSuggestion(data, [downtownGarden, legacyGarden], { radiusMeters: 150 });
    expect(data.garden).toBeNull();
    expect(data.garden_assignment_status).toBe('unassigned');
    expect(data.suggested_match_method).toBeNull();
  });
});

describe('Geo.formatGardenMatch', () => {
  it('returns a compact garden payload for API responses', () => {
    const formatted = Geo.formatGardenMatch({
      garden: downtownGarden,
      distanceMeters: 12,
      matchMethod: 'inside_polygon',
    });
    expect(formatted.garden.slug).toBe('downtown-garden');
    expect(formatted.distanceMeters).toBe(12);
    expect(formatted.matchMethod).toBe('inside_polygon');
  });
});
