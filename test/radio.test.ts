import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { booleanClockwise, booleanPointInPolygon, distance, point } from '@turf/turf';
import type { Position } from 'geojson';
import { coverageToFeature, dfBearingToFeature, normaliseBearing, stationToFeature } from '../src/geo/radio';
import { arbPosition, arbSafePosition } from './arbitraries';
import { allPositions, expectValidGeoJSON } from './helpers';

const munich: Position = [11.582, 48.1351];
const arbRange = fc.double({ min: 0.5, max: 500, noNaN: true });

describe('stationToFeature', () => {
  it('is a valid Point', () => {
    expectValidGeoJSON(stationToFeature(11.582, 48.1351, { stationId: 'rx', role: 'receiver', band: 'VHF', frequencyMHz: 156.8, status: 'online' }));
  });
});

describe('coverageToFeature', () => {
  it('is a closed, valid, counter-clockwise ring', () => {
    const f = coverageToFeature(munich, 28, 'rx-wst-01');
    expectValidGeoJSON(f);
    const ring = f.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(booleanClockwise(ring)).toBe(false);
  });

  it('rejects bad ranges', () => {
    expect(() => coverageToFeature(munich, 0, 'x')).toThrow(RangeError);
    expect(() => coverageToFeature(munich, Number.NaN, 'x')).toThrow(RangeError);
  });

  // #region geometric
  test.prop([arbSafePosition, arbRange])(
    'contains its station and every vertex is ~rangeKm away',
    (station, rangeKm) => {
      const f = coverageToFeature(station, rangeKm, 'x');
      expectValidGeoJSON(f);
      expect(booleanPointInPolygon(point(station), f)).toBe(true);
      for (const v of f.geometry.coordinates[0]!) {
        expect(distance(station, v, { units: 'kilometers' })).toBeCloseTo(rangeKm, 0);
      }
    },
  );
  // #endregion

  // Documents a real-world edge case that fast-check surfaces quickly:
  it('keeps the ring continuous across the antimeridian (lng may exceed 180)', () => {
    const f = coverageToFeature([179.9, 10], 50, 'x');
    const lngs = allPositions(f).map(([lng]) => lng!);
    expect(Math.max(...lngs)).toBeGreaterThan(180); // continuous -> MapLibre draws it without a seam
    for (let i = 1; i < lngs.length; i++) expect(Math.abs(lngs[i]! - lngs[i - 1]!)).toBeLessThan(180);
  });
});

describe('dfBearingToFeature', () => {
  it.each([
    [0, 'north', (s: Position, e: Position) => e[1]! > s[1]!],
    [90, 'east', (s: Position, e: Position) => e[0]! > s[0]!],
    [180, 'south', (s: Position, e: Position) => e[1]! < s[1]!],
    [270, 'west', (s: Position, e: Position) => e[0]! < s[0]!],
  ])('bearing %i° points %s', (bearing, _dir, check) => {
    const [s, e] = dfBearingToFeature(munich, bearing, 40, { stationId: 'x' }).geometry.coordinates as [Position, Position];
    expect(check(s, e)).toBe(true);
  });

  it.each([[-90, 270], [360, 0], [725, 5]])('normalises %i° to %i°', (input, expected) => {
    expect(normaliseBearing(input)).toBe(expected);
  });

  test.prop([arbPosition, fc.double({ min: -720, max: 720, noNaN: true }), arbRange])(
    'starts at the station and is rangeKm long',
    (station, bearing, rangeKm) => {
      const f = dfBearingToFeature(station, bearing, rangeKm, { stationId: 'x' });
      expectValidGeoJSON(f);
      const [start, end] = f.geometry.coordinates as [Position, Position];
      expect(start[0]).toBeCloseTo(station[0]!, 5);
      expect(start[1]).toBeCloseTo(station[1]!, 5);
      expect(distance(start, end, { units: 'kilometers' })).toBeCloseTo(rangeKm, 0);
      expect(f.properties.bearingDeg).toBeGreaterThanOrEqual(0);
      expect(f.properties.bearingDeg).toBeLessThan(360);
    },
  );
});
