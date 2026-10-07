/**
 * fast-check guide §02: the two ways to write a property in Vitest.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { booleanPointInPolygon } from '@turf/turf';
import { aisToFeature } from '../../../src/geo/ais';
import { coverageToFeature } from '../../../src/geo/radio';
import { arbAisReport, arbSafePosition } from '../../../test/arbitraries';

describe('writing properties', () => {
  // #region test-prop
  // Tuple form: one arbitrary per argument.
  test.prop([arbAisReport])('an AIS feature never has a position outside ±180/±90', (m) => {
    const f = aisToFeature(m);
    if (f === null) return; // no position: nothing to check
    const [lng, lat] = f.geometry.coordinates as [number, number];
    expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    expect(Math.abs(lat)).toBeLessThanOrEqual(90);
  });

  // Record form: one named object, handy when there are several inputs.
  const arbCoverageInput = {
    station: arbSafePosition,
    rangeKm: fc.double({ min: 0.5, max: 500, noNaN: true }),
  };
  test.prop(arbCoverageInput)('coverage contains its station', ({ station, rangeKm }) => {
    expect(booleanPointInPolygon(station, coverageToFeature(station, rangeKm, 'rx'))).toBe(true);
  });
  // #endregion

  // #region fc-assert
  // Plain fast-check inside a normal Vitest test: useful inside loops, helpers or it.each.
  it('every report without a position becomes null', () => {
    fc.assert(
      fc.property(arbAisReport, (m) => {
        fc.pre(m.lat === 91 || m.lon === 181); // only reports with the "not available" sentinel
        expect(aisToFeature(m)).toBeNull();
      }),
    );
  });
  // #endregion

  // #region params
  // Per-test parameters override the global ones from test/setup.ts.
  test.prop([fc.array(arbAisReport, { maxLength: 200 })], { numRuns: 25 })(
    'a slow property over big batches: fewer runs',
    (reports) => {
      const features = reports.map(aisToFeature).filter((f) => f !== null);
      expect(features.length).toBeLessThanOrEqual(reports.length);
    },
  );
  // #endregion
});
