/**
 * ADS-B aircraft (readsb / dump1090 `aircraft.json` shape) -> GeoJSON.
 *
 * Notes:
 * - ICAO24 is a hex STRING, so it is not used as the Feature id (MapLibre feature-state
 *   needs numeric ids). Use `promoteId="icao24"` on the <Source> instead.
 * - Barometric altitude is pressure altitude in feet, NOT ellipsoid height, so it stays
 *   in properties. Positions are 2D.
 */
import type { Feature, LineString, Point, Position } from 'geojson';
import { isValidLngLat, round6 } from './factories';

export type ReadsbAircraft = {
  hex: string; // "3c6a4f", or "~3c6a4f" for non-ICAO (TIS-B) addresses
  flight?: string; // callsign, often padded with spaces
  alt_baro?: number | 'ground'; // feet
  alt_geom?: number; // feet, GNSS
  gs?: number; // ground speed, knots
  track?: number; // degrees
  baro_rate?: number; // ft/min
  squawk?: string;
  category?: string;
  lat?: number;
  lon?: number;
  seen?: number; // seconds since last message
  seen_pos?: number; // seconds since last position
};

export type AircraftProps = {
  icao24: string;
  nonIcao: boolean;
  callsign: string | null;
  onGround: boolean;
  altBaroFt: number | null;
  altGeomM: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  squawk: string | null;
  category: string | null;
  emergency: boolean;
  stale: boolean;
};

export type AircraftFeature = Feature<Point, AircraftProps>;

export const FT_TO_M = 0.3048;
export const STALE_AFTER_S = 60;
const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normaliseIcao24(hex: string): { icao24: string; nonIcao: boolean } {
  const nonIcao = hex.startsWith('~');
  return { icao24: hex.replace(/^~/, '').toLowerCase(), nonIcao };
}

/** Returns null when the aircraft has no (valid) position, e.g. Mode S only. */
export function adsbToFeature(a: ReadsbAircraft): AircraftFeature | null {
  if (a.lat === undefined || a.lon === undefined || !isValidLngLat(a.lon, a.lat)) return null;

  const { icao24, nonIcao } = normaliseIcao24(a.hex);
  const altGeomFt = num(a.alt_geom);
  const squawk = a.squawk ?? null;
  const ageS = num(a.seen_pos) ?? num(a.seen) ?? 0;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round6(a.lon), round6(a.lat)] },
    properties: {
      icao24,
      nonIcao,
      callsign: a.flight?.trim() || null,
      onGround: a.alt_baro === 'ground',
      altBaroFt: a.alt_baro === 'ground' ? null : num(a.alt_baro),
      altGeomM: altGeomFt === null ? null : Math.round(altGeomFt * FT_TO_M),
      groundSpeedKt: num(a.gs),
      trackDeg: num(a.track),
      verticalRateFpm: num(a.baro_rate),
      squawk,
      category: a.category ?? null,
      emergency: squawk !== null && EMERGENCY_SQUAWKS.has(squawk),
      stale: ageS > STALE_AFTER_S,
    },
  };
}

export type TrackSample = { lon: number; lat: number; t: string };

export type TrackProps = { icao24: string; startTime: string; endTime: string; pointCount: number };

/**
 * Track history -> LineString. Drops invalid samples and consecutive duplicate positions.
 * Returns null if fewer than 2 distinct positions remain.
 */
export function adsbTrackToFeature(icao24: string, samples: TrackSample[]): Feature<LineString, TrackProps> | null {
  const sorted = samples
    .filter((s) => isValidLngLat(s.lon, s.lat))
    .slice()
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  const coords: Position[] = [];
  const kept: TrackSample[] = [];
  for (const s of sorted) {
    const p: Position = [round6(s.lon), round6(s.lat)];
    const last = coords[coords.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    coords.push(p);
    kept.push(s);
  }
  if (coords.length < 2) return null;

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      icao24: normaliseIcao24(icao24).icao24,
      startTime: kept[0]!.t,
      endTime: kept[kept.length - 1]!.t,
      pointCount: coords.length,
    },
  };
}
