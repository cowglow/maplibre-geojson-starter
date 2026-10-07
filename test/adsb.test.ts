import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { adsbToFeature, adsbTrackToFeature, FT_TO_M, type ReadsbAircraft } from '../src/geo/adsb';
import { arbReadsbAircraft, arbTrackSamples } from './arbitraries';
import { expectValidGeoJSON } from './helpers';

const base: ReadsbAircraft = {
  hex: '3c6a4f', flight: 'DLH4KT  ', alt_baro: 4100, alt_geom: 4325, gs: 182, track: 262.4,
  baro_rate: 1408, squawk: '1000', category: 'A3', lat: 48.3538, lon: 11.7861, seen: 0.4,
};

describe('adsbToFeature: domain rules', () => {
  it('puts longitude first and stays 2D (baro altitude is not ellipsoid height)', () => {
    const f = adsbToFeature(base)!;
    expect(f.geometry.coordinates).toEqual([11.7861, 48.3538]);
    expect(f.geometry.coordinates).toHaveLength(2);
    expect(f.properties.altBaroFt).toBe(4100);
  });

  it('does not set a string feature id (use promoteId="icao24" instead)', () => {
    expect(adsbToFeature(base)!.id).toBeUndefined();
    expect(adsbToFeature(base)!.properties.icao24).toBe('3c6a4f');
  });

  it('returns null without a position (Mode S only)', () => {
    expect(adsbToFeature({ hex: '3c55aa', alt_baro: 12000 })).toBeNull();
  });

  it('trims padded callsigns; empty becomes null', () => {
    expect(adsbToFeature(base)!.properties.callsign).toBe('DLH4KT');
    expect(adsbToFeature({ ...base, flight: '        ' })!.properties.callsign).toBeNull();
  });

  it('handles alt_baro "ground"', () => {
    const p = adsbToFeature({ ...base, alt_baro: 'ground' })!.properties;
    expect(p.onGround).toBe(true);
    expect(p.altBaroFt).toBeNull();
  });

  it('converts geometric altitude feet -> metres', () => {
    expect(adsbToFeature(base)!.properties.altGeomM).toBe(Math.round(4325 * FT_TO_M));
  });

  it.each(['7500', '7600', '7700'])('flags emergency squawk %s', (squawk) => {
    expect(adsbToFeature({ ...base, squawk })!.properties.emergency).toBe(true);
  });

  it('normalises non-ICAO (~) addresses', () => {
    const p = adsbToFeature({ ...base, hex: '~2A1F00' })!.properties;
    expect(p.icao24).toBe('2a1f00');
    expect(p.nonIcao).toBe(true);
  });

  it('marks positions older than 60 s as stale', () => {
    expect(adsbToFeature({ ...base, seen: 95 })!.properties.stale).toBe(true);
    expect(adsbToFeature({ ...base, seen: 5 })!.properties.stale).toBe(false);
  });
});

describe('adsbToFeature: properties (fast-check)', () => {
  test.prop([arbReadsbAircraft])('valid GeoJSON, or null exactly when lat/lon is missing', (a) => {
    const f = adsbToFeature(a);
    if (a.lat === undefined || a.lon === undefined) { expect(f).toBeNull(); return; }
    expectValidGeoJSON(f);
    expect(f!.geometry.coordinates[0]).toBeCloseTo(a.lon, 5);
    expect(f!.geometry.coordinates[1]).toBeCloseTo(a.lat, 5);
  });

  test.prop([arbReadsbAircraft])('icao24 is always 6 lowercase hex chars', (a) => {
    const f = adsbToFeature(a);
    if (f) expect(f.properties.icao24).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe('adsbTrackToFeature', () => {
  const samples = [
    { lon: 11.7861, lat: 48.3538, t: '2026-10-06T19:33:40Z' },
    { lon: 11.7402, lat: 48.3471, t: '2026-10-06T19:34:10Z' },
    { lon: 11.7402, lat: 48.3471, t: '2026-10-06T19:34:15Z' }, // duplicate position
    { lon: 11.683, lat: 48.3389, t: '2026-10-06T19:34:40Z' },
  ];

  it('drops consecutive duplicates and sorts by time', () => {
    const f = adsbTrackToFeature('3c6a4f', [...samples].reverse())!;
    expect(f.geometry.coordinates).toEqual([[11.7861, 48.3538], [11.7402, 48.3471], [11.683, 48.3389]]);
    expect(f.properties.startTime).toBe('2026-10-06T19:33:40Z');
    expect(f.properties.pointCount).toBe(3);
  });

  it('returns null for fewer than 2 distinct positions', () => {
    expect(adsbTrackToFeature('3c6a4f', [samples[1]!, samples[2]!])).toBeNull();
    expect(adsbTrackToFeature('3c6a4f', [])).toBeNull();
  });

  test.prop([arbTrackSamples])('valid LineString or null; never two identical consecutive points', (s) => {
    const f = adsbTrackToFeature('3c6a4f', s);
    if (!f) return;
    expectValidGeoJSON(f);
    const c = f.geometry.coordinates;
    expect(c.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < c.length; i++) expect(c[i]).not.toEqual(c[i - 1]);
    expect(f.properties.pointCount).toBe(c.length);
  });

  // #region order-independence
  test.prop([arbTrackSamples])('is order-independent (sorted by timestamp)', (s) => {
    fc.pre(new Set(s.map((x) => x.t)).size === s.length); // unique timestamps
    expect(adsbTrackToFeature('a', [...s].reverse())).toEqual(adsbTrackToFeature('a', s));
  });
  // #endregion
});
