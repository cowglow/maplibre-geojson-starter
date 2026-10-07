/**
 * HF spots (e.g. PSK Reporter / WSPR / DX cluster style) -> great-circle path features.
 */
import { distance, greatCircle } from '@turf/turf';
import type { Feature, LineString, MultiLineString, Point, Position } from 'geojson';
import { isValidLngLat, round6, roundPosition } from './factories';

export type HfSpot = {
  tx: Position; // [lng, lat]
  rx: Position;
  txCall: string;
  rxCall: string;
  frequencyKHz: number;
  mode: string;
  snrDb: number;
  timestamp: string;
};

export type HfPathProps = {
  kind: 'path';
  txCall: string;
  rxCall: string;
  frequencyKHz: number;
  band: string;
  mode: string;
  snrDb: number;
  distanceKm: number;
  timestamp: string;
};

export type HfEndpointProps = { kind: 'tx' | 'rx'; call: string };

/** Amateur HF bands (IARU, simplified; exact edges vary by region). */
const HF_BANDS: Array<[name: string, lowKHz: number, highKHz: number]> = [
  ['160m', 1800, 2000],
  ['80m', 3500, 4000],
  ['60m', 5250, 5450],
  ['40m', 7000, 7300],
  ['30m', 10100, 10150],
  ['20m', 14000, 14350],
  ['17m', 18068, 18168],
  ['15m', 21000, 21450],
  ['12m', 24890, 24990],
  ['10m', 28000, 29700],
];

export function bandForKHz(kHz: number): string {
  for (const [name, lo, hi] of HF_BANDS) if (kHz >= lo && kHz <= hi) return name;
  return 'unknown';
}

/**
 * -180 and 180 are the same meridian. Turf sometimes ends a path at +180 when the line
 * approaches from the west (or vice versa), which MapLibre draws as a line across the whole
 * map. Flip such points to the side of their previous neighbour.
 * (Found by the fast-check tests.)
 */
export function alignAntimeridian(line: Position[]): Position[] {
  const out: Position[] = [];
  line.forEach((p, i) => {
    if (Math.abs(p[0]!) !== 180) return void out.push(p);
    // Side of the previous point (already aligned, so a run of ±180 points stays on one side),
    // or, for a leading ±180 point, of the first point that isn't on the antimeridian.
    const ref =
      out[out.length - 1]?.[0] ?? line.slice(i + 1).find((q) => Math.abs(q[0]!) !== 180)?.[0];
    out.push(ref === undefined ? p : [(Math.sign(ref) || 1) * 180, ...p.slice(1)]);
  });
  return out;
}

const samePos = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/**
 * Normalise a path for Web Mercator rendering:
 * - one ordered list of points in, any number of parts out
 * - split wherever consecutive points jump more than 180° of longitude (an antimeridian
 *   crossing), interpolating the crossing latitude so each part ends exactly at ±180 (no gap)
 * - drop degenerate parts (fewer than 2 distinct positions), which are invalid GeoJSON
 *
 * Turf's greatCircle output is fed through this because fast-check found both a wrong-side
 * ±180 endpoint and a MultiLineString part containing a single point.
 */
export function splitAtAntimeridian(points: Position[]): Position[][] {
  const pts = alignAntimeridian(points.map(roundPosition));
  if (pts.length === 0) return [];
  const parts: Position[][] = [[pts[0]!]];
  const pushTo = (part: Position[], p: Position) => {
    if (!samePos(part[part.length - 1]!, p)) part.push(p);
  };

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const current = parts[parts.length - 1]!;
    const side = Math.sign(a[0]!) || 1; // +1: leaving eastwards over +180
    const bUnwrapped = b[0]! + side * 360;
    if (Math.abs(b[0]! - a[0]!) > 180 && bUnwrapped !== a[0]) {
      const t = (side * 180 - a[0]!) / (bUnwrapped - a[0]!);
      const lat = round6(a[1]! + t * (b[1]! - a[1]!));
      pushTo(current, [side * 180, lat]);
      parts.push([[-side * 180, lat]]);
      pushTo(parts[parts.length - 1]!, b);
    } else {
      pushTo(current, b);
    }
  }
  return parts.filter((part) => part.length >= 2);
}

/** Points closer than this are treated as "same place" (no meaningful path). */
const MIN_PATH_KM = 1;

/**
 * Great-circle path between tx and rx, densified so it curves correctly on a Mercator map.
 * Paths that cross the antimeridian come back as a MultiLineString split exactly at ±180.
 * Returns null when tx and rx are (nearly) the same point, or (nearly) antipodal,
 * where the great circle is undefined.
 *
 * Known limit (found by the fast-check tests): a path that passes over or close to a pole
 * flips longitude by 180° at the pole. Web Mercator can't show latitudes beyond ~85°,
 * so such paths look odd on any Mercator map; use a globe projection if you need them.
 */
export function hfPathToFeature(
  spot: HfSpot,
  npoints = 64,
): Feature<LineString | MultiLineString, HfPathProps> | null {
  const [txLng, txLat] = spot.tx as [number, number];
  const [rxLng, rxLat] = spot.rx as [number, number];
  if (!isValidLngLat(txLng, txLat) || !isValidLngLat(rxLng, rxLat)) return null;

  const distanceKm = distance([txLng, txLat], [rxLng, rxLat], { units: 'kilometers' });
  const HALF_EARTH_KM = 20015; // half the circumference: antipodal
  if (distanceKm < MIN_PATH_KM || distanceKm > HALF_EARTH_KM - 100) return null;

  const g = greatCircle([txLng, txLat], [rxLng, rxLat], { npoints }).geometry;
  const flat = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
  const parts = splitAtAntimeridian(flat);
  if (parts.length === 0) return null;
  const geometry: LineString | MultiLineString =
    parts.length === 1
      ? { type: 'LineString', coordinates: parts[0]! }
      : { type: 'MultiLineString', coordinates: parts };

  return {
    type: 'Feature',
    geometry,
    properties: {
      kind: 'path',
      txCall: spot.txCall,
      rxCall: spot.rxCall,
      frequencyKHz: spot.frequencyKHz,
      band: bandForKHz(spot.frequencyKHz),
      mode: spot.mode,
      snrDb: spot.snrDb,
      distanceKm: Math.round(distanceKm),
      timestamp: spot.timestamp,
    },
  };
}

export function hfEndpoints(spot: HfSpot): Feature<Point, HfEndpointProps>[] {
  return [
    { type: 'Feature', geometry: { type: 'Point', coordinates: spot.tx.map(round6) }, properties: { kind: 'tx', call: spot.txCall } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: spot.rx.map(round6) }, properties: { kind: 'rx', call: spot.rxCall } },
  ];
}
