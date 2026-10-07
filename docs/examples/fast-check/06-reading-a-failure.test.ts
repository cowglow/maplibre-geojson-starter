/**
 * fast-check guide §06: what a failure report contains, replaying it, pinning it.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { Position } from 'geojson';
import { hfPathToFeature, type HfSpot } from '../../../src/geo/hf';
import { arbHfSpot } from '../../../test/arbitraries';

// A deliberately wrong property, so we have a failure to look at.
const naiveNormalise = (deg: number) => deg % 360;
const neverNegative = fc.property(fc.integer({ min: -720, max: 720 }), (deg) => {
  expect(naiveNormalise(deg)).toBeGreaterThanOrEqual(0);
});

describe('reading a failure', () => {
  it('produces this report (the text Vitest prints above the "Caused by" error)', () => {
    const details = fc.check(neverNegative, { seed: 42 });
    // #region report
    const report = [
      'Property failed after 3 tests',
      '{ seed: 42, path: "2:1:0:0:0:0:0:0:0:0", endOnFailure: true }',
      'Counterexample: [-1]',
      'Shrunk 9 time(s)',
    ];
    // #endregion
    expect((fc.defaultReportMessage(details) ?? '').split('\n').slice(0, 4)).toEqual(report);
  });

  // #region replay
  it('replays straight to the shrunk counterexample with seed + path', () => {
    const replay = fc.check(neverNegative, { seed: 42, path: '2:1:0:0:0:0:0:0:0:0' });
    expect(replay.numRuns).toBe(1); // no search, no shrinking: one run
    expect(replay.counterexample).toEqual([-1]);
  });
  // #endregion
});

// #region examples
const spot = (tx: Position, rx: Position): HfSpot => ({
  tx, rx, txCall: 'DL1ABC', rxCall: 'W2XYZ', frequencyKHz: 14074, mode: 'FT8', snrDb: -12,
  timestamp: '2026-10-06T19:30:15Z',
});

test.prop([arbHfSpot], {
  // Run before the random values, on every run of the suite.
  examples: [
    [spot([-30, 10], [180, 0])], // Turf ended this path at +180 (see 07)
    [spot([-180, 0], [179, 0])], // Turf returned a part with a single point
  ],
})('HF paths never jump across the map', (s) => {
  const f = hfPathToFeature(s);
  if (!f) return;
  const g = f.geometry;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  fc.pre(parts.flat().every(([, lat]) => Math.abs(lat!) < 85)); // known limit at the poles
  for (const part of parts) {
    expect(part.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < part.length; i++) {
      expect(Math.abs(part[i]![0]! - part[i - 1]![0]!)).toBeLessThan(180);
    }
  }
});
// #endregion
