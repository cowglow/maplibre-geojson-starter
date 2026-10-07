/**
 * fast-check guide §04: test your generators, not only your code.
 * If arbAisReport never produced lat 91, every "sentinel" property would pass vacuously.
 */
import { describe, expect, it } from 'vitest';
import { fc } from '@fast-check/vitest';
import { arbAisReport, arbReadsbAircraft } from '../../../test/arbitraries';

describe('our domain arbitraries', () => {
  // #region check-the-generator
  it('arbAisReport mixes in sentinels and garbage at the rates we intended', () => {
    const reports = fc.sample(arbAisReport, { seed: 2026, numRuns: 2000 });
    const share = (pred: (m: (typeof reports)[number]) => boolean) =>
      reports.filter(pred).length / reports.length;

    expect(share((m) => m.lat === 91)).toBeGreaterThan(0.05); // weight 2 of 21 ≈ 9.5%
    expect(share((m) => m.lat === 91)).toBeLessThan(0.15);
    expect(share((m) => Number.isNaN(m.lat))).toBeGreaterThan(0); // decoder garbage occurs
    expect(share((m) => m.heading === 511)).toBeGreaterThan(0.05);
  });

  it('arbReadsbAircraft sometimes omits the position (Mode S only)', () => {
    const aircraft = fc.sample(arbReadsbAircraft, { seed: 2026, numRuns: 500 });
    expect(aircraft.some((a) => a.lat === undefined)).toBe(true);
    expect(aircraft.some((a) => a.lat !== undefined && a.lon !== undefined)).toBe(true);
  });
  // #endregion
});
