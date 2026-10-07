/**
 * Turf guide §06: testing Turf-based code with fast-check, using Turf as the oracle.
 */
import { expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { bearing, bearingToAzimuth, destination, distance, length } from '@turf/turf';
import type { Position } from 'geojson';
import { adsbTrackToFeature } from '../../../src/geo/adsb';
import { arbTrackSamples } from '../../../test/arbitraries';
import { crossFix } from './cross-fix';

// #region oracle-track
// Oracle: the straight-line (great-circle) distance can never exceed the flown distance.
const t = '2020-01-01T00:00:00.000Z';
const toTheAntipode = [
  { lon: -179.99999850000003, lat: 0, t },
  { lon: 0, lat: 2.75e-5, t },
  { lon: 0, lat: 0, t },
];
// fast-check found that one: haversine loses precision near the antipode
test.prop([arbTrackSamples], { examples: [[toTheAntipode]] })(
  'a track is never shorter than its end-to-end distance',
  (s) => {
    const track = adsbTrackToFeature('3c6a4f', s);
    if (!track) return;
    const c = track.geometry.coordinates;
    const straight = distance(c[0]!, c.at(-1)!);
    expect(length(track)).toBeGreaterThanOrEqual(straight * (1 - 1e-9)); // relative tolerance
  },
);
// #endregion

// #region oracle-cross-fix
// Build the scenario backwards: place a transmitter, put two stations around it,
// measure the true bearings with Turf, then check that the fix lands on the transmitter.
const arbScenario = fc.record({
  tx: fc.tuple(
    fc.double({ min: -150, max: 150, noNaN: true }),
    fc.double({ min: -60, max: 60, noNaN: true }),
  ),
  bearingA: fc.double({ min: -180, max: 180, noNaN: true }), // from tx to station A
  turn: fc.double({ min: 30, max: 150, noNaN: true }), // angle between the two stations
  kmA: fc.double({ min: 20, max: 1500, noNaN: true }),
  kmB: fc.double({ min: 20, max: 1500, noNaN: true }),
});

test.prop([arbScenario])('the cross-fix lands within 1 km of the transmitter', (s) => {
  const place = (deg: number, km: number): Position =>
    destination(s.tx, km, deg).geometry.coordinates;
  const a = place(s.bearingA, s.kmA);
  const b = place(s.bearingA + s.turn, s.kmB);
  const towardsTx = (station: Position) => bearingToAzimuth(bearing(station, s.tx));

  const fix = crossFix(
    { station: a, bearingDeg: towardsTx(a) },
    { station: b, bearingDeg: towardsTx(b) },
    2000,
  );
  expect(fix).not.toBeNull();
  expect(distance(fix!, s.tx)).toBeLessThan(1);
});
// #endregion
