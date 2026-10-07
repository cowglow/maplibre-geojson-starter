/**
 * Radio: stations, coverage areas and direction-finding (DF) bearing lines.
 */
import { circle, destination } from '@turf/turf';
import type { Feature, LineString, Point, Polygon, Position } from 'geojson';
import { isValidLngLat, round6, roundPosition } from './factories';

export type StationProps = {
  stationId: string;
  role: 'receiver' | 'transmitter' | 'transceiver';
  band: string;
  frequencyMHz: number;
  status: 'online' | 'offline';
};

export function stationToFeature(lng: number, lat: number, props: StationProps): Feature<Point, StationProps> {
  if (!isValidLngLat(lng, lat)) throw new RangeError(`Invalid station position [${lng}, ${lat}]`);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round6(lng), round6(lat)] },
    properties: props,
  };
}

export type CoverageProps = { stationId: string; kind: 'coverage'; rangeKm: number };

/**
 * Circular coverage polygon around a station (a simple model; swap in a terrain-aware one later).
 *
 * Near the antimeridian Turf keeps the ring continuous, so longitudes may run past ±180
 * (e.g. 180.3). MapLibre draws that correctly without a seam; strict RFC validators may
 * complain. See the test "keeps the ring continuous across the antimeridian".
 */
export function coverageToFeature(
  station: Position,
  rangeKm: number,
  stationId: string,
  steps = 64,
): Feature<Polygon, CoverageProps> {
  const [lng, lat] = station as [number, number];
  if (!isValidLngLat(lng, lat)) throw new RangeError('Invalid station position');
  if (!(rangeKm > 0) || !Number.isFinite(rangeKm)) throw new RangeError('rangeKm must be a positive number');

  const c = circle([lng, lat], rangeKm, { steps, units: 'kilometers' });
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: c.geometry.coordinates.map((ring) => ring.map(roundPosition)) },
    properties: { stationId, kind: 'coverage', rangeKm },
  };
}

export type BearingProps = {
  stationId: string;
  kind: 'bearing';
  bearingDeg: number;
  rangeKm: number;
  frequencyMHz: number | null;
  timestamp: string | null;
};

/** Normalise any bearing to [0, 360). */
export function normaliseBearing(deg: number): number {
  const b = ((deg % 360) + 360) % 360;
  return b === 0 ? 0 : b;
}

/** DF bearing line from the station out to `rangeKm` along `bearingDeg` (true north). */
export function dfBearingToFeature(
  station: Position,
  bearingDeg: number,
  rangeKm: number,
  meta: { stationId: string; frequencyMHz?: number; timestamp?: string },
): Feature<LineString, BearingProps> {
  const [lng, lat] = station as [number, number];
  if (!isValidLngLat(lng, lat)) throw new RangeError('Invalid station position');
  if (!Number.isFinite(bearingDeg)) throw new RangeError('bearingDeg must be finite');
  if (!(rangeKm > 0) || !Number.isFinite(rangeKm)) throw new RangeError('rangeKm must be a positive number');

  const bearing = normaliseBearing(bearingDeg);
  // Turf wants bearings in [-180, 180]
  const end = destination([lng, lat], rangeKm, bearing > 180 ? bearing - 360 : bearing, { units: 'kilometers' });

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[round6(lng), round6(lat)], roundPosition(end.geometry.coordinates)] },
    properties: {
      stationId: meta.stationId,
      kind: 'bearing',
      bearingDeg: bearing,
      rangeKm,
      frequencyMHz: meta.frequencyMHz ?? null,
      timestamp: meta.timestamp ?? null,
    },
  };
}
