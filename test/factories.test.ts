import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { booleanClockwise, booleanValid } from '@turf/turf';
import type { Position } from 'geojson';
import { bboxPolygon, collection, line, point, round6 } from '../src/geo/factories';
import { arbLat, arbLng, arbPosition } from './arbitraries';
import { expectInBounds, expectValidGeoJSON, maxDecimals } from './helpers';

describe('point', () => {
  it('is valid GeoJSON in [lng, lat] order', () => {
    const f = point(2.35, 48.86, { name: 'Central' }, 1);
    expectValidGeoJSON(f);
    expect(f.geometry.coordinates).toEqual([2.35, 48.86]);
    expectInBounds(f, [2.2, 48.8, 2.5, 48.95]);
  });

  it('rejects out-of-range and non-finite positions', () => {
    expect(() => point(181, 0, {})).toThrow(RangeError);
    expect(() => point(0, 91, {})).toThrow(RangeError);
    expect(() => point(Number.NaN, 0, {})).toThrow(RangeError);
  });

  test.prop([arbLng, arbLat])('always valid, rounded to ≤ 6 decimals', (lng, lat) => {
    const f = point(lng, lat, {});
    expectValidGeoJSON(f);
    expect(maxDecimals(f)).toBeLessThanOrEqual(6);
    expect(f.geometry.coordinates[0]).toBeCloseTo(lng, 5);
    expect(f.geometry.coordinates[1]).toBeCloseTo(lat, 5);
  });
});

describe('round6', () => {
  test.prop([fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 })])('is idempotent', (x) => {
    expect(round6(round6(x))).toBe(round6(x));
  });

  it('normalises -0 to 0', () => {
    expect(Object.is(round6(-0.0000001), 0)).toBe(true);
  });
});

describe('line', () => {
  it('rejects fewer than 2 positions', () => {
    expect(() => line([[2.35, 48.86]], {})).toThrow(RangeError);
  });

  test.prop([fc.array(arbPosition, { minLength: 2, maxLength: 50 })])('always valid, same length', (coords) => {
    const f = line(coords, {});
    expectValidGeoJSON(f);
    expect(f.geometry.coordinates).toHaveLength(coords.length);
  });
});

describe('bboxPolygon', () => {
  it('has a closed, valid, counter-clockwise outer ring', () => {
    const f = bboxPolygon([2.3, 48.85, 2.4, 48.9], {});
    expectValidGeoJSON(f);
    expect(booleanValid(f)).toBe(true);
    const ring = f.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(booleanClockwise(ring)).toBe(false); // RFC 7946 right-hand rule
  });

  const arbBbox = fc
    .tuple(arbLng, arbLng, arbLat, arbLat)
    .filter(([a, b, c, d]) => Math.abs(a - b) > 1e-4 && Math.abs(c - d) > 1e-4)
    .map(([a, b, c, d]) => [Math.min(a, b), Math.min(c, d), Math.max(a, b), Math.max(c, d)] as [number, number, number, number]);

  test.prop([arbBbox])('any bbox gives a valid CCW polygon', (bbox) => {
    const f = bboxPolygon(bbox, {});
    expectValidGeoJSON(f);
    expect(booleanClockwise(f.geometry.coordinates[0] as Position[])).toBe(false);
  });

  it('rejects inverted bboxes', () => {
    expect(() => bboxPolygon([2.4, 48.85, 2.3, 48.9], {})).toThrow(RangeError);
  });
});

describe('collection', () => {
  it('wraps features', () => {
    const fc1 = collection([point(0, 0, {}), point(1, 1, {})]);
    expectValidGeoJSON(fc1);
    expect(fc1.features).toHaveLength(2);
  });

  it('empty collection is valid', () => {
    expectValidGeoJSON(collection([]));
  });
});
