/**
 * fast-check guide §07: what Turf returned for the inputs fast-check found,
 * and what our factory returns for them now.
 */
import { describe, expect, it } from 'vitest';
import { greatCircle } from '@turf/turf';
import type { Position } from 'geojson';
import { hfPathToFeature, type HfSpot } from '../../../src/geo/hf';
import { expectValidGeoJSON } from '../../../test/helpers';

const spot = (tx: Position, rx: Position): HfSpot => ({
  tx, rx, txCall: 'DL1ABC', rxCall: 'W2XYZ', frequencyKHz: 14074, mode: 'FT8', snrDb: -12,
  timestamp: '2026-10-06T19:30:15Z',
});

/** Largest longitude step between consecutive points of any part. */
const maxLngJump = (parts: Position[][]) =>
  Math.max(...parts.flatMap((p) => p.slice(1).map((q, i) => Math.abs(q[0]! - p[i]![0]!))));

describe('bug 1: a path ending at +180 after approaching from the west', () => {
  // #region bug-1
  it('raw Turf output jumps across the whole map; ours does not', () => {
    // 16 points: one LineString whose last step goes from about -170.7 to +180
    const coarse = greatCircle([-30, 10], [180, 0], { npoints: 16 }).geometry;
    expect(coarse.type).toBe('LineString');
    expect((coarse.coordinates as Position[]).at(-1)).toEqual([180, 0]);
    expect(maxLngJump([coarse.coordinates as Position[]])).toBeGreaterThan(350);

    // 64 points: Turf splits, but adds a zero-length part on the far side of the map
    const fine = greatCircle([-30, 10], [180, 0], { npoints: 64 }).geometry;
    expect((fine.coordinates as Position[][]).at(-1)).toEqual([[180, 0], [180, 0]]);

    const ours = hfPathToFeature(spot([-30, 10], [180, 0]))!;
    expect((ours.geometry.coordinates as Position[]).at(-1)).toEqual([-180, 0]);
  });
  // #endregion
});

describe('bug 2: a MultiLineString part with a single point', () => {
  // #region bug-2
  it('raw Turf output is invalid GeoJSON; ours is valid', () => {
    const raw = greatCircle([-180, 0], [179, 0], { npoints: 64 }).geometry;
    expect(raw.type).toBe('MultiLineString');
    expect((raw.coordinates as Position[][]).map((part) => part.length)).toEqual([1, 63]);

    const ours = hfPathToFeature(spot([-180, 0], [179, 0]))!;
    expectValidGeoJSON(ours);
    expect(ours.geometry.type).toBe('LineString');
  });
  // #endregion
});

describe('known limit: paths over a pole', () => {
  // #region pole
  it('a great circle over the pole flips longitude by 180°', () => {
    const coords = greatCircle([0, 60], [180, 60], { npoints: 7 }).geometry.coordinates;
    expect(coords).toEqual([
      [0, 60], [0, 70], [0, 80], [90, 90], [180, 80], [180, 70], [180, 60],
    ]);
  });
  // #endregion
});
