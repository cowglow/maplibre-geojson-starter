/**
 * Turf guide §04: domain recipes. Each `it` is one recipe in the PDF.
 */
import { describe, expect, it } from 'vitest';
import {
  booleanPointInPolygon,
  circle,
  distance,
  featureCollection,
  greatCircle,
  length,
  nearestPoint,
  point,
} from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import { adsbTrackToFeature } from '../../../src/geo/adsb';
import { aisToFeature, type AisPositionReport } from '../../../src/geo/ais';
import { notNull } from '../../../src/geo/factories';
import { hfPathToFeature, type HfSpot } from '../../../src/geo/hf';
import { coverageToFeature, dfBearingToFeature } from '../../../src/geo/radio';
import { featuresInZone } from '../../../src/geo/zones';
import anchorageZone from '../../../src/data/anchorage-zone.geo.json';
import trackRaw from '../../../src/data/raw/adsb-track.json';
import { expectValidGeoJSON } from '../../../test/helpers';
import { crossFix, naiveCrossFix } from './cross-fix';

const munichRx: Position = [11.582, 48.1351];

describe('coverage area from a station', () => {
  // #region coverage
  it('circle() gives a 64-sided polygon; our factory adds rounding and properties', () => {
    const raw = circle(munichRx, 28, { steps: 64, units: 'kilometers' });
    const ours = coverageToFeature(munichRx, 28, 'rx-wst-01');

    expect(ours.geometry.coordinates[0]).toHaveLength(raw.geometry.coordinates[0]!.length);
    expect(ours.properties).toEqual({ stationId: 'rx-wst-01', kind: 'coverage', rangeKm: 28 });
    expect(booleanPointInPolygon([11.9, 48.2], ours)).toBe(true); // ~25 km east: covered
    expect(booleanPointInPolygon([12.0, 48.2], ours)).toBe(false); // ~32 km east: not covered
  });
  // #endregion

  // #region coverage-antimeridian
  it('near ±180 the ring stays continuous, so longitudes run past 180', () => {
    const fiji = coverageToFeature([179.9, -17], 50, 'rx-fj');
    const lngs = fiji.geometry.coordinates[0]!.map(([lng]) => lng!);
    expect(Math.max(...lngs)).toBeGreaterThan(180); // MapLibre draws this without a seam

    // ...but a contact reported at -179.95 is not "inside" until you shift it by 360°
    expect(booleanPointInPolygon([-179.95, -17], fiji)).toBe(false);
    expect(booleanPointInPolygon([-179.95 + 360, -17], fiji)).toBe(true);
  });
  // #endregion
});

describe('DF bearing lines and a cross-fix', () => {
  // #region df-line
  it('a bearing line is the station plus destination()', () => {
    const line = dfBearingToFeature(munichRx, 22.8, 40, { stationId: 'rx-wst-01' });
    const [start, end] = line.geometry.coordinates as [Position, Position];
    expect(start).toEqual(munichRx);
    expect(distance(start, end)).toBeCloseTo(40, 3); // km; rounding to 6 decimals costs cm
  });
  // #endregion

  // #region cross-fix-test
  it('two bearings cross at the transmitter', () => {
    // Bearings measured at Munich and Augsburg to a transmitter near Freising [11.75, 48.40]
    const fix = crossFix(
      { station: munichRx, bearingDeg: 22.82 },
      { station: [10.8978, 48.3705], bearingDeg: 86.70 },
      100,
    )!;
    expect(distance(fix, [11.75, 48.4])).toBeLessThan(0.1); // km
  });

  it('long HF bearings need densified rays: two-point lines miss by hundreds of km', () => {
    // Edinburgh and Cyprus taking bearings on a transmitter near Warsaw [21.0, 52.2]
    const edinburgh = { station: [-3.2, 55.95], bearingDeg: 94.73 };
    const cyprus = { station: [33.4, 35.2], bearingDeg: 336.36 };
    expect(distance(crossFix(edinburgh, cyprus, 3000)!, [21.0, 52.2])).toBeLessThan(1);
    expect(distance(naiveCrossFix(edinburgh, cyprus, 3000)!, [21.0, 52.2])).toBeGreaterThan(100);
  });
  // #endregion
});

describe('geofence alerts for AIS', () => {
  const zone = anchorageZone as unknown as Feature<Polygon>; // outer ring plus a cable-area hole
  const report = (mmsi: number, lon: number, lat: number): AisPositionReport => ({
    mmsi, lon, lat, sog: 0.2, cog: 0, heading: 511, timestamp: '2026-10-06T19:30:00Z',
  });

  // #region geofence
  it('alerts for vessels in the anchorage, not in the cable-area hole', () => {
    const vessels = [
      report(244_660_001, 4.0, 51.97), // in the anchorage
      report(244_660_002, 4.025, 51.98), // in the hole (cable area)
      report(244_660_003, 4.2, 51.97), // outside
    ].map(aisToFeature).filter(notNull);

    const inside = featuresInZone(vessels, zone); // booleanPointInPolygon under the hood
    expect(inside.map((v) => v.properties.mmsi)).toEqual([244_660_001]);
  });

  it('decide what "on the boundary" means', () => {
    const onEdge = point([3.98, 51.97]); // exactly on the western edge
    expect(booleanPointInPolygon(onEdge, zone)).toBe(true);
    expect(booleanPointInPolygon(onEdge, zone, { ignoreBoundary: true })).toBe(false);
  });
  // #endregion
});

describe('track length and average speed from ADS-B samples', () => {
  // #region track
  it('length() of the track, and speed from consecutive samples', () => {
    const track = adsbTrackToFeature(trackRaw.icao24, trackRaw.samples)!;
    const km = length(track); // kilometres by default
    const { startTime, endTime } = track.properties;
    const hours = (Date.parse(endTime) - Date.parse(startTime)) / 3_600_000;
    const avgKt = km / 1.852 / hours;

    expect(km).toBeCloseTo(13.3, 1);
    expect(avgKt).toBeGreaterThan(200); // a departure climbing out of EDDM
    expect(avgKt).toBeLessThan(300);

    // Segment speeds: the same samples, pairwise. A spike here means a bad position.
    const s = trackRaw.samples;
    const segmentKt = s.slice(1).map((b, i) => {
      const a = s[i]!;
      const dtH = (Date.parse(b.t) - Date.parse(a.t)) / 3_600_000;
      return distance([a.lon, a.lat], [b.lon, b.lat], { units: 'nauticalmiles' }) / dtH;
    });
    expect(Math.max(...segmentKt)).toBeLessThan(400);
  });
  // #endregion
});

describe('nearest vessel or aircraft to a point', () => {
  // #region nearest
  it('nearestPoint() returns the closest feature plus its index and distance', () => {
    const contacts = featureCollection([
      point([4.0, 51.97], { mmsi: 244_660_001 }),
      point([4.3, 52.1], { mmsi: 244_660_004 }),
      point([3.5, 51.8], { mmsi: 244_660_005 }),
    ]);
    const pilotBoat = [4.05, 51.98];
    const nearest = nearestPoint(pilotBoat, contacts);

    expect(nearest.properties.mmsi).toBe(244_660_001);
    expect(nearest.properties.featureIndex).toBe(0);
    expect(nearest.properties.distanceToPoint).toBeCloseTo(3.6, 1); // km
  });
  // #endregion
});

describe('HF great-circle paths', () => {
  const spot = (tx: Position, rx: Position): HfSpot => ({
    tx, rx, txCall: 'JA1AAA', rxCall: 'K6BBB', frequencyKHz: 14074, mode: 'FT8', snrDb: -9,
    timestamp: '2026-10-06T19:30:15Z',
  });

  // #region hf
  it('Turf splits at the antimeridian only sometimes; our factory always does', () => {
    const tokyo = [139.69, 35.69];
    const sanFrancisco = [-122.42, 37.77];
    expect(greatCircle(tokyo, sanFrancisco, { npoints: 8 }).geometry.type).toBe('LineString');
    expect(greatCircle(tokyo, sanFrancisco).geometry.type).toBe('MultiLineString'); // 100 points

    const path = hfPathToFeature(spot(tokyo, sanFrancisco), 8)!;
    expectValidGeoJSON(path);
    expect(path.geometry.type).toBe('MultiLineString'); // split exactly at ±180, no gap
    expect(path.properties.distanceKm).toBe(8271);
  });
  // #endregion
});
