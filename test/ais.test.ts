import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { aisToFeature, vesselsToCollection, type AisPositionReport } from '../src/geo/ais';
import { arbAisReport } from './arbitraries';
import { expectValidGeoJSON } from './helpers';

const base: AisPositionReport = {
  mmsi: 211234560, lat: 53.544, lon: 9.9705, sog: 11.2, cog: 285, heading: 284,
  navStatus: 0, name: 'ELBE TRADER', timestamp: '2026-10-06T19:34:58Z',
};

const hasPosition = (m: AisPositionReport) =>
  m.lat !== 91 && m.lon !== 181 && Number.isFinite(m.lat) && Number.isFinite(m.lon) &&
  Math.abs(m.lat) <= 90 && Math.abs(m.lon) <= 180;

describe('aisToFeature: domain rules', () => {
  it('puts longitude first', () => {
    expect(aisToFeature(base)!.geometry.coordinates).toEqual([9.9705, 53.544]);
  });

  it('uses the numeric MMSI as feature id (feature-state friendly)', () => {
    expect(aisToFeature(base)!.id).toBe(211234560);
  });

  it.each([
    ['lat 91 (not available)', { lat: 91 }],
    ['lon 181 (not available)', { lon: 181 }],
    ['NaN latitude from a bad decode', { lat: Number.NaN }],
    ['Infinity longitude', { lon: Number.POSITIVE_INFINITY }],
    ['out-of-range latitude', { lat: 95 }],
  ])('drops reports with %s', (_label, patch) => {
    expect(aisToFeature({ ...base, ...patch })).toBeNull();
  });

  it('maps heading 511, COG 360 and SOG 102.3 to null', () => {
    const p = aisToFeature({ ...base, heading: 511, cog: 360, sog: 102.3 })!.properties;
    expect(p.headingDeg).toBeNull();
    expect(p.cogDeg).toBeNull();
    expect(p.sogKt).toBeNull();
  });

  it('trims names and turns empty names into null', () => {
    expect(aisToFeature({ ...base, name: 'ELBE TRADER   ' })!.properties.name).toBe('ELBE TRADER');
    expect(aisToFeature({ ...base, name: '   ' })!.properties.name).toBeNull();
  });
});

describe('aisToFeature: properties (fast-check)', () => {
  test.prop([arbAisReport])('always valid GeoJSON, or null exactly when there is no position', (m) => {
    const f = aisToFeature(m);
    if (!hasPosition(m)) { expect(f).toBeNull(); return; }
    expect(f).not.toBeNull();
    expectValidGeoJSON(f);
  });

  test.prop([arbAisReport])('preserves the position in [lng, lat] order', (m) => {
    fc.pre(hasPosition(m));
    const [lng, lat] = aisToFeature(m)!.geometry.coordinates as [number, number];
    expect(lng).toBeCloseTo(m.lon, 5);
    expect(lat).toBeCloseTo(m.lat, 5);
  });

  test.prop([arbAisReport])('properties are flat primitives (MapLibre stringifies nested values)', (m) => {
    const f = aisToFeature(m);
    if (!f) return;
    for (const v of Object.values(f.properties)) expect(['string', 'number', 'boolean'].includes(typeof v) || v === null).toBe(true);
  });
});

describe('vesselsToCollection', () => {
  it('keeps the newest report per MMSI', () => {
    const older = { ...base, lon: 9.99, timestamp: '2026-10-06T19:33:58Z' };
    const fcol = vesselsToCollection([base, older]);
    expect(fcol.features).toHaveLength(1);
    expect(fcol.features[0]!.geometry.coordinates[0]).toBe(9.9705);
  });

  test.prop([fc.array(arbAisReport, { maxLength: 50 })])('one feature per MMSI that has a position', (reports) => {
    const expected = new Set(reports.filter(hasPosition).map((r) => r.mmsi)).size;
    const fcol = vesselsToCollection(reports);
    expect(fcol.features).toHaveLength(expected);
    expectValidGeoJSON(fcol);
  });

  test.prop([fc.array(arbAisReport, { maxLength: 30 })])('order of input does not matter', (reports) => {
    const ids = (r: AisPositionReport[]) => vesselsToCollection(r).features.map((f) => f.id).sort();
    expect(ids([...reports].reverse())).toEqual(ids(reports));
  });
});
