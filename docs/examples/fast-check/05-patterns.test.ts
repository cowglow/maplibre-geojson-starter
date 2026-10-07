/**
 * fast-check guide §05: the round-trip pattern.
 * The other patterns in §05 quote test/*.test.ts directly.
 */
import { describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { bearing } from '@turf/turf';
import type { Position } from 'geojson';
import { aisToFeature } from '../../../src/geo/ais';
import { dfBearingToFeature, normaliseBearing } from '../../../src/geo/radio';
import { arbAisReport, arbSafePosition } from '../../../test/arbitraries';

/** Smallest angle between two bearings, in degrees (0..180). */
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('round-trip', () => {
  // #region round-trip
  // MapLibre serialises source data to its worker; nothing may change on the way.
  test.prop([arbAisReport])('an AIS feature survives JSON.stringify -> JSON.parse', (m) => {
    const f = aisToFeature(m);
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });

  // Out with destination(), back with bearing(): we should get the DF bearing again.
  test.prop([
    arbSafePosition,
    fc.double({ min: 0, max: 359.99, noNaN: true }),
    fc.double({ min: 5, max: 500, noNaN: true }),
  ])('bearing(start, end) of a DF line is the bearing we drew', (station, deg, rangeKm) => {
    const line = dfBearingToFeature(station, deg, rangeKm, { stationId: 'df-1' });
    const [start, end] = line.geometry.coordinates as [Position, Position];
    expect(angleBetween(normaliseBearing(bearing(start, end)), deg)).toBeLessThan(0.01);
  });
  // #endregion
});
