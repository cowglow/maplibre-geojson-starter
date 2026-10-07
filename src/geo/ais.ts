/**
 * AIS position reports -> GeoJSON Point features.
 *
 * "Not available" sentinels (ITU-R M.1371):
 *   latitude 91, longitude 181, SOG 102.3 kn, COG 360°, true heading 511
 */
import type { Feature, FeatureCollection, Point } from 'geojson';
import { isValidLngLat, notNull, round6 } from './factories';

export type AisPositionReport = {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number; // knots
  cog: number; // degrees
  heading: number; // degrees
  navStatus?: number;
  name?: string;
  timestamp: string; // ISO 8601
};

export type VesselProps = {
  mmsi: number;
  name: string | null;
  sogKt: number | null;
  cogDeg: number | null;
  headingDeg: number | null;
  navStatus: number | null;
  timestamp: string;
};

export type VesselFeature = Feature<Point, VesselProps>;

export const AIS_LAT_NA = 91;
export const AIS_LON_NA = 181;
export const AIS_SOG_NA = 102.3;
export const AIS_COG_NA = 360;
export const AIS_HEADING_NA = 511;

/** Returns null when the report has no usable position. */
export function aisToFeature(m: AisPositionReport): VesselFeature | null {
  if (m.lat === AIS_LAT_NA || m.lon === AIS_LON_NA) return null;
  if (!isValidLngLat(m.lon, m.lat)) return null; // NaN, Infinity or out of range from a bad decode

  return {
    type: 'Feature',
    id: m.mmsi, // numeric id -> works with map.setFeatureState directly
    geometry: { type: 'Point', coordinates: [round6(m.lon), round6(m.lat)] },
    properties: {
      mmsi: m.mmsi,
      name: m.name?.trim() || null,
      sogKt: m.sog === AIS_SOG_NA || !Number.isFinite(m.sog) ? null : m.sog,
      cogDeg: m.cog === AIS_COG_NA || !Number.isFinite(m.cog) ? null : m.cog,
      headingDeg: m.heading === AIS_HEADING_NA || !Number.isFinite(m.heading) ? null : m.heading,
      navStatus: m.navStatus ?? null,
      timestamp: m.timestamp,
    },
  };
}

/**
 * Latest position per MMSI, as a FeatureCollection.
 * Reports without a position are skipped; for each vessel the newest timestamp wins.
 */
export function vesselsToCollection(reports: AisPositionReport[]): FeatureCollection<Point, VesselProps> {
  const latest = new Map<number, VesselFeature>();
  for (const f of reports.map(aisToFeature).filter(notNull)) {
    const prev = latest.get(f.properties.mmsi);
    if (!prev || f.properties.timestamp >= prev.properties.timestamp) latest.set(f.properties.mmsi, f);
  }
  return { type: 'FeatureCollection', features: [...latest.values()] };
}
