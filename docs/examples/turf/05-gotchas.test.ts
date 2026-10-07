/**
 * Turf guide §05: gotchas, each one demonstrated.
 */
import { describe, expect, it } from 'vitest';
import {
  area,
  bbox,
  booleanPointInPolygon,
  bboxPolygon,
  buffer,
  circle,
  destination,
  featureCollection,
  geojsonRbush,
  lineSlice,
  lineString,
  point,
  pointToLineDistance,
  truncate,
} from '@turf/turf';
import type { Feature, Point, Polygon, Position } from 'geojson';

describe('the antimeridian', () => {
  // #region antimeridian
  it('destination() does not wrap longitudes', () => {
    const end = destination([179.9, 10], 50, 90).geometry.coordinates;
    expect(end[0]).toBeGreaterThan(180); // 180.357, not -179.643
  });

  it('bbox() of a line across ±180 spans the whole world the other way', () => {
    const crossing = lineString([[170, 0], [-170, 1]]); // 20° wide on the globe
    expect(bbox(crossing)).toEqual([-170, 0, 170, 1]); // 340° wide as a bbox
  });
  // #endregion
});

describe('near the poles', () => {
  // #region poles
  it('a coverage circle around a polar station does not contain the pole', () => {
    const ring = circle([0, 89.5], 100, { steps: 64 }); // the pole is 56 km away
    expect(booleanPointInPolygon([0, 89.5], ring)).toBe(true);
    expect(booleanPointInPolygon([0, 90], ring)).toBe(false); // geographically it should be true
  });
  // #endregion
});

describe('accuracy at large scales', () => {
  // #region scale
  it('buffer() is exact around a point, approximate along a long line', () => {
    const line = lineString([[-30, 60], [30, 60]]); // 3,300 km across the North Atlantic
    const zone = buffer(line, 100) as Feature<Polygon>; // km
    const gaps = zone.geometry.coordinates[0]!.map((p) => pointToLineDistance(p, line));
    expect(Math.min(...gaps)).toBeLessThan(99); // up to ~1 km short of the requested 100 km
  });

  it('area() is geodesic: one square degree shrinks with latitude', () => {
    const atEquator = area(bboxPolygon([0, 0, 1, 1])); // m²
    const at60North = area(bboxPolygon([0, 60, 1, 61]));
    expect(at60North / atEquator).toBeCloseTo(0.49, 2);
  });
  // #endregion
});

describe('precision', () => {
  // #region precision
  it('results carry floating-point noise; truncate() before snapshots or comparisons', () => {
    const route = lineString([[0, 0], [2, 0], [4, 0]]);
    const leg = lineSlice([1, 0.1], [3, -0.1], route);
    expect(leg.geometry.coordinates.at(-1)).toEqual([3.0000000000000004, -0]); // noise and -0

    const clean = truncate(leg, { precision: 6 }); // returns a copy unless { mutate: true }
    expect(clean.geometry.coordinates).toEqual([[1, 0], [2, 0], [3, 0]] satisfies Position[]);
  });
  // #endregion
});

describe('many features', () => {
  // #region index
  it('an R-tree narrows 10,000 contacts to a handful before Turf looks at them', () => {
    // A 100 x 100 grid of contacts over the North Sea and around it.
    const contacts = featureCollection(
      Array.from({ length: 10_000 }, (_, i) =>
        point([-10 + (i % 100) * 0.3, 45 + Math.floor(i / 100) * 0.15], { id: i }),
      ),
    );
    const index = geojsonRbush<Point, { id: number }>().load(contacts); // once per update

    const zone = circle([4, 52], 25); // km
    const candidates = index.search(zone).features; // bbox overlap only: cheap
    const inside = candidates.filter((c) => booleanPointInPolygon(c, zone)); // exact: Turf

    expect(candidates.length).toBeLessThan(20);
    expect(inside).toHaveLength(
      contacts.features.filter((c) => booleanPointInPolygon(c, zone)).length, // the slow way
    );
  });
  // #endregion
});
