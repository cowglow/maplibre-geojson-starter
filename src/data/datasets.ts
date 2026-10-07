/**
 * Builds every demo dataset from the raw sample messages through the factories,
 * i.e. the same pipeline your app would run on live feeds.
 */
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import {
  adsbToFeature,
  adsbTrackToFeature,
  aisToFeature,
  collection,
  coverageToFeature,
  dfBearingToFeature,
  hfEndpoints,
  hfPathToFeature,
  notNull,
  stationToFeature,
  vesselsToCollection,
  type AisPositionReport,
  type HfSpot,
  type ReadsbAircraft,
} from '../geo';
import aisRaw from './raw/ais-reports.json';
import readsbRaw from './raw/readsb-aircraft.json';
import trackRaw from './raw/adsb-track.json';
import hfRaw from './raw/hf-spots.json';
import dfRaw from './raw/df-bearings.json';
import anchorageZoneJson from './anchorage-zone.geo.json';

export const aircraft = collection((readsbRaw.aircraft as ReadsbAircraft[]).map(adsbToFeature).filter(notNull));

export const track = collection([adsbTrackToFeature(trackRaw.icao24, trackRaw.samples)].filter(notNull));

export const vessels = vesselsToCollection(aisRaw as AisPositionReport[]);

export const anchorageZone = anchorageZoneJson as unknown as Feature<Polygon>;

const station = dfRaw.station.position as [number, number];
export const radio: FeatureCollection<Geometry> = collection<Geometry, Record<string, unknown>>([
  stationToFeature(station[0], station[1], {
    stationId: dfRaw.station.stationId,
    role: 'receiver',
    band: 'VHF',
    frequencyMHz: 145.5,
    status: 'online',
  }),
  coverageToFeature(station, 28, dfRaw.station.stationId),
  ...dfRaw.bearings.map((b) =>
    dfBearingToFeature(station, b.bearingDeg, 40, {
      stationId: dfRaw.station.stationId,
      frequencyMHz: b.frequencyMHz,
      timestamp: b.timestamp,
    }),
  ),
]);

const spots = hfRaw as HfSpot[];
export const hf: FeatureCollection<Geometry> = collection<Geometry, Record<string, unknown>>([
  ...spots.map((s) => hfPathToFeature(s)).filter(notNull),
  ...spots.flatMap(hfEndpoints),
]);

/** Deterministic pseudo-random AIS traffic for the clustering demo (no Math.random -> stable). */
export function syntheticVessels(count: number, seed = 42): FeatureCollection {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const reports: AisPositionReport[] = Array.from({ length: count }, (_, i) => ({
    mmsi: 200_000_000 + i,
    lat: 53.6 + rand() * 2.9, // offshore North Sea
    lon: 2 + rand() * 4.5,
    sog: Math.round(rand() * 200) / 10,
    cog: Math.round(rand() * 3599) / 10,
    heading: 511,
    timestamp: '2026-10-06T19:30:00Z',
  }));
  return collection(reports.map(aisToFeature).filter(notNull));
}
