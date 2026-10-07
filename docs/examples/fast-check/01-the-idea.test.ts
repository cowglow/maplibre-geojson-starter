/**
 * fast-check guide §01: example-based tests vs properties, generation bias, shrinking, seeds.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { normaliseBearing } from '../../../src/geo/radio';

// #region example-vs-property
// Example-based: we choose the inputs, so we only test the cases we thought of.
describe('normaliseBearing: examples', () => {
  it.each([[-90, 270], [360, 0], [725, 5]])('%i° -> %i°', (input, expected) => {
    expect(normaliseBearing(input)).toBe(expected);
  });
});

// Property-based: fast-check chooses the inputs; we state what must hold for all of them.
describe('normaliseBearing: properties', () => {
  const arbAnyBearing = fc.double({ min: -1e6, max: 1e6, noNaN: true });
  const rad = (deg: number) => (deg * Math.PI) / 180;

  test.prop([arbAnyBearing])('lands in [0, 360)', (deg) => {
    const b = normaliseBearing(deg);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  test.prop([arbAnyBearing])('still points the same way', (deg) => {
    const b = normaliseBearing(deg);
    expect(Math.cos(rad(b))).toBeCloseTo(Math.cos(rad(deg)), 6);
    expect(Math.sin(rad(b))).toBeCloseTo(Math.sin(rad(deg)), 6);
  });
});
// #endregion

describe('what fast-check does for you', () => {
  // #region bias
  it('biases generation toward edge cases', () => {
    const arbLat = fc.double({ min: -90, max: 90, noNaN: true });
    const lats = fc.sample(arbLat, { seed: 1, numRuns: 1000 });
    expect(lats).toContain(-90); // both bounds
    expect(lats).toContain(90);
    expect(lats.some((x) => Object.is(x, -0))).toBe(true); // negative zero
    expect(lats.some((x) => x !== 0 && Math.abs(x) < 1e-300)).toBe(true); // tiny values
  });
  // #endregion

  // #region shrinking
  it('shrinks a failure to a minimal counterexample', () => {
    const naiveNormalise = (deg: number) => deg % 360; // forgets negative bearings
    const details = fc.check(
      fc.property(fc.integer({ min: -720, max: 720 }), (deg) => naiveNormalise(deg) >= 0),
      { seed: 42, verbose: true },
    );
    expect(details.failed).toBe(true);
    expect(details.failures[0]).toEqual([-428]); // the first failing input it generated
    expect(details.counterexample).toEqual([-1]); // what it reports after shrinking
  });
  // #endregion

  // #region seeds
  it('is reproducible: the same seed generates the same values', () => {
    const arbMmsi = fc.integer({ min: 200_000_000, max: 799_999_999 });
    expect(fc.sample(arbMmsi, { seed: 7, numRuns: 5 })).toEqual(
      fc.sample(arbMmsi, { seed: 7, numRuns: 5 }),
    );
  });
  // #endregion
});
