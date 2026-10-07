import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { Position } from 'geojson';
import { bandForKHz, hfEndpoints, hfPathToFeature, splitAtAntimeridian, type HfSpot } from '../src/geo/hf';
import { arbHfSpot } from './arbitraries';
import { expectValidGeoJSON } from './helpers';

const spot = (tx: Position, rx: Position, frequencyKHz = 14074): HfSpot => ({
  tx, rx, txCall: 'DL1ABC', rxCall: 'W2XYZ', frequencyKHz, mode: 'FT8', snrDb: -12, timestamp: '2026-10-06T19:30:15Z',
});

/** Angular difference between two longitudes, in degrees (0..180). */
const lngDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const lines = (g: { type: string; coordinates: unknown }) =>
  (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) as Position[][];

describe('bandForKHz', () => {
  it.each([[14074, '20m'], [7074, '40m'], [21025, '15m'], [28074, '10m'], [3573, '80m'], [15000, 'unknown']])(
    '%i kHz -> %s', (khz, band) => expect(bandForKHz(khz)).toBe(band),
  );
});

describe('hfPathToFeature', () => {
  it('Munich -> New York is a densified LineString with the right endpoints', () => {
    const f = hfPathToFeature(spot([11.58, 48.14], [-73.98, 40.75]))!;
    expectValidGeoJSON(f);
    expect(f.geometry.type).toBe('LineString');
    const c = lines(f.geometry)[0]!;
    expect(c.length).toBeGreaterThan(10);
    expect(c[0]).toEqual([11.58, 48.14]);
    expect(c[c.length - 1]).toEqual([-73.98, 40.75]);
    expect(f.properties.band).toBe('20m');
    expect(f.properties.distanceKm).toBeGreaterThan(6000);
  });

  it('Tokyo -> San Francisco crosses the antimeridian -> MultiLineString', () => {
    const f = hfPathToFeature(spot([139.69, 35.69], [-122.42, 37.77]))!;
    expectValidGeoJSON(f);
    expect(f.geometry.type).toBe('MultiLineString');
  });

  // Regression pinned from a fast-check counterexample: Turf ended this path at +180 after
  // approaching from the west, which drew a line across the whole map.
  it('endpoint exactly on the antimeridian stays on the near side', () => {
    const f = hfPathToFeature(spot([-30, 10], [180, 0]))!;
    const c = lines(f.geometry)[0]!;
    expect(c[c.length - 1]![0]).toBe(-180);
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i]![0]! - c[i - 1]![0]!)).toBeLessThan(180);
  });

  it('returns null for identical or antipodal endpoints', () => {
    expect(hfPathToFeature(spot([10, 10], [10, 10]))).toBeNull();
    expect(hfPathToFeature(spot([0, 0], [180, 0]))).toBeNull();
  });

  // fast-check found this limit: a great circle that passes over (or right next to) a pole flips
  // longitude by exactly 180° there. Those paths can't be drawn on Web Mercator (which stops at
  // ~85°) anyway, so the property covers paths that stay inside the drawable band.
  test.prop([arbHfSpot])('never jumps across the map (no segment spans ≥ 180° of longitude)', (s) => {
    const f = hfPathToFeature(s);
    if (!f) return;
    expectValidGeoJSON(f);
    fc.pre(lines(f.geometry).flat().every((p) => Math.abs(p[1]!) < 85));
    for (const l of lines(f.geometry))
      for (let i = 1; i < l.length; i++) expect(Math.abs(l[i]![0]! - l[i - 1]![0]!)).toBeLessThan(180);
  });

  test.prop([arbHfSpot])('path starts at tx and ends at rx', (s) => {
    const f = hfPathToFeature(s);
    fc.pre(f !== null);
    const all = lines(f!.geometry);
    const first = all[0]![0]!;
    const lastLine = all[all.length - 1]!;
    const last = lastLine[lastLine.length - 1]!;
    expect(lngDiff(first[0]!, s.tx[0]!)).toBeLessThan(1e-4); // -180 and 180 are the same meridian
    expect(first[1]).toBeCloseTo(s.tx[1]!, 4);
    expect(lngDiff(last[0]!, s.rx[0]!)).toBeLessThan(1e-4);
    expect(last[1]).toBeCloseTo(s.rx[1]!, 4);
  });
});

describe('hfEndpoints', () => {
  it('gives a tx and an rx point', () => {
    const [tx, rx] = hfEndpoints(spot([11.58, 48.14], [-73.98, 40.75]));
    expect(tx!.properties.kind).toBe('tx');
    expect(rx!.properties.kind).toBe('rx');
    expectValidGeoJSON(tx);
  });
});

describe('splitAtAntimeridian', () => {
  it('splits a crossing exactly at ±180 with an interpolated latitude', () => {
    expect(splitAtAntimeridian([[170, 0], [-170, 10]])).toEqual([
      [[170, 0], [180, 5]],
      [[-180, 5], [-170, 10]],
    ]);
  });

  it('drops single-point parts (Turf produced one for a near-antipodal path)', () => {
    const parts = splitAtAntimeridian([[-174.3, 0], [-177.15, 0], [180, 0]]);
    expect(parts).toEqual([[[-174.3, 0], [-177.15, 0], [-180, 0]]]);
  });

  // Regression from a fast-check counterexample: an over-the-pole path has consecutive points
  // on the antimeridian; interpolating between them divided 0 by 0 and emitted null latitudes.
  it('never emits NaN for consecutive antimeridian points (over-the-pole path)', () => {
    const parts = splitAtAntimeridian([[0, -89.03], [-180, -88.13], [-180, -85.29], [-180, -82.44]]);
    for (const p of parts.flat()) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
  });

  test.prop([fc.array(fc.tuple(fc.oneof(fc.double({ min: -180, max: 180, noNaN: true }), fc.constantFrom(-180, 180, 0)), fc.double({ min: -85, max: 85, noNaN: true })), { minLength: 2, maxLength: 40 })])(
    'every part has ≥ 2 positions and no segment spans ≥ 180°',
    (pts) => {
      for (const part of splitAtAntimeridian(pts)) {
        expect(part.length).toBeGreaterThanOrEqual(2);
        for (const p of part) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
        for (let i = 1; i < part.length; i++) expect(Math.abs(part[i]![0]! - part[i - 1]![0]!)).toBeLessThanOrEqual(180);
      }
    },
  );
});
