/**
 * Generic, typed GeoJSON building blocks (RFC 7946).
 * Domain factories (ais.ts, adsb.ts, ...) build on these.
 */
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from 'geojson';

/** Round to 6 decimals (~10 cm), the precision RFC 7946 suggests. Normalises -0 to 0. */
export function round6(n: number): number {
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

export function roundPosition(p: Position): Position {
  return p.map(round6);
}

export function isValidLngLat(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
  );
}

export function point<P extends GeoJsonProperties>(
  lng: number,
  lat: number,
  properties: P,
  id?: string | number,
): Feature<Point, P> {
  if (!isValidLngLat(lng, lat)) throw new RangeError(`Invalid position [${lng}, ${lat}]`);
  const f: Feature<Point, P> = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round6(lng), round6(lat)] },
    properties,
  };
  if (id !== undefined) f.id = id;
  return f;
}

export function line<P extends GeoJsonProperties>(coords: Position[], properties: P): Feature<LineString, P> {
  if (coords.length < 2) throw new RangeError('LineString needs at least 2 positions');
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords.map(roundPosition) },
    properties,
  };
}

/** bbox = [west, south, east, north]. Outer ring is counter-clockwise (RFC 7946 right-hand rule). */
export function bboxPolygon<P extends GeoJsonProperties>(
  [w, s, e, n]: [number, number, number, number],
  properties: P,
): Feature<Polygon, P> {
  if (!(w < e && s < n)) throw new RangeError('bbox must satisfy west < east and south < north');
  const ring: Position[] = [[w, s], [e, s], [e, n], [w, n], [w, s]];
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring.map(roundPosition)] },
    properties,
  };
}

export function collection<G extends Geometry | null, P extends GeoJsonProperties>(
  features: Feature<G, P>[],
): FeatureCollection<G, P> {
  return { type: 'FeatureCollection', features };
}

/** Type guard to drop nulls from factory output: `.filter(notNull)`. */
export function notNull<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}
