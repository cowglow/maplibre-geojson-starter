/**
 * fast-check guide §08: pitfalls, each one demonstrated.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { adsbTrackToFeature } from '../../../src/geo/adsb';
import { round6 } from '../../../src/geo/factories';
import { normaliseBearing } from '../../../src/geo/radio';
import { arbLat, arbLng } from '../../../test/arbitraries';

describe('pitfall: restating the implementation', () => {
  const arbDeg = fc.double({ min: -1e6, max: 1e6, noNaN: true });

  // #region mirror
  // ✗ Avoid: a copy of the implementation. If the formula is wrong, both are wrong.
  test.prop([arbDeg])('mirror test', (deg) => {
    expect(normaliseBearing(deg)).toBe(((deg % 360) + 360) % 360 || 0);
  });

  // ✓ Prefer: what must be true, without saying how to compute it.
  test.prop([arbDeg])('in range, and a whole number of turns away from the input', (deg) => {
    const b = normaliseBearing(deg);
    expect(b >= 0 && b < 360).toBe(true);
    const turns = (deg - b) / 360;
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6);
  });
  // #endregion
});

describe('pitfall: filter vs fc.pre vs a constrained arbitrary', () => {
  const arbSample = fc.record({
    lon: arbLng,
    lat: arbLat,
    t: fc
      .integer({ min: 0, max: 600 })
      .map((s) => new Date(Date.UTC(2026, 9, 6, 19, 30, s)).toISOString()),
  });
  const uniqueTimes = (s: { t: string }[]) => new Set(s.map((x) => x.t)).size === s.length;

  // #region pre-vs-constrained
  // 1. filter: generated values that fail the predicate are thrown away and regenerated.
  const viaFilter = fc.array(arbSample, { maxLength: 40 }).filter(uniqueTimes);

  // 2. fc.pre: the run is skipped (counted in numSkips); too many skips fail the test.
  const withPre = fc.property(fc.array(arbSample, { maxLength: 40 }), (samples) => {
    fc.pre(uniqueTimes(samples));
  });

  // 3. Constrained: unique by construction, nothing is thrown away.
  const viaUnique = fc.uniqueArray(arbSample, { maxLength: 40, selector: (s) => s.t });
  // #endregion

  it('all three generate unique timestamps; only 1 and 2 waste runs', () => {
    fc.assert(fc.property(viaFilter, (s) => uniqueTimes(s)));
    expect(fc.check(withPre, { seed: 3, numRuns: 100 }).numSkips).toBeGreaterThan(0);
    fc.assert(fc.property(viaUnique, (s) => uniqueTimes(s)));
  });

  test.prop([fc.uniqueArray(arbSample, { maxLength: 40, selector: (s) => s.t })])(
    'with unique timestamps, a track does not depend on input order',
    (s) => {
      expect(adsbTrackToFeature('a', [...s].reverse())).toEqual(adsbTrackToFeature('a', s));
    },
  );
});

describe('pitfall: comparing floats', () => {
  // #region floats
  test.prop([arbLng])('round6 moves a longitude by less than 0.000005°', (lng) => {
    // expect(round6(lng)).toBe(lng) fails for almost every input
    expect(round6(lng)).toBeCloseTo(lng, 5); // |difference| < 0.000005
  });
  // #endregion
});

describe('pitfall: NaN, Infinity and -0', () => {
  // #region special-numbers
  it('fc.double() without constraints generates NaN, ±Infinity and -0', () => {
    const xs = fc.sample(fc.double(), { seed: 1, numRuns: 1000 });
    expect(xs.some(Number.isNaN)).toBe(true);
    expect(xs).toContain(Number.POSITIVE_INFINITY);
    expect(xs.some((x) => Object.is(x, -0))).toBe(true);
  });

  it('Vitest treats -0 and 0 as different; JSON does not', () => {
    expect(() => expect(-0).toEqual(0)).toThrow(); // toBe and toEqual use Object.is for numbers
    expect(JSON.parse(JSON.stringify(-0))).toBe(0); // the sign is lost in GeoJSON files
    expect(Object.is(round6(-0.0000001), 0)).toBe(true); // so our factories normalise it
  });
  // #endregion
});

describe('pitfall: returning expect() from a property', () => {
  // #region return-expect
  it('a returned assertion fails the property, even though the assertion passed', () => {
    // An arrow function with an expression body *returns* the assertion object.
    // fast-check only accepts true or undefined, so this reports
    // "Property failed by returning false".
    const returnsAssertion = fc.property(fc.integer(), (n) => expect(n).toBe(n));
    expect(fc.check(returnsAssertion).failed).toBe(true);

    // Fix: use a block body, so nothing is returned.
    const fixed = fc.property(fc.integer(), (n) => {
      expect(n).toBe(n);
    });
    expect(fc.check(fixed).failed).toBe(false);
  });
  // #endregion
});
