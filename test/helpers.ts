import { getIssues } from '@placemarkio/check-geojson';
import { expect } from 'vitest';
import type { GeoJSON, Position } from 'geojson';

/** Strict RFC 7946 structure check: no issues allowed. */
export function expectValidGeoJSON(obj: unknown): void {
  const issues = getIssues(JSON.stringify(obj));
  expect(issues, issues.map((i) => i.message).join('\n')).toEqual([]);
}

/** Every position in any GeoJSON object (Feature, FeatureCollection, geometry). */
export function allPositions(g: GeoJSON | null): Position[] {
  if (!g) return [];
  switch (g.type) {
    case 'FeatureCollection': return g.features.flatMap(allPositions);
    case 'Feature': return allPositions(g.geometry);
    case 'GeometryCollection': return g.geometries.flatMap(allPositions);
    case 'Point': return [g.coordinates];
    case 'MultiPoint':
    case 'LineString': return g.coordinates;
    case 'MultiLineString':
    case 'Polygon': return g.coordinates.flat();
    case 'MultiPolygon': return g.coordinates.flat(2);
  }
}

/**
 * Catches swapped lng/lat: spec validators can't, when both values are within ±90.
 * bbox = [west, south, east, north] of the area your data should be in.
 */
export function expectInBounds(g: GeoJSON, [w, s, e, n]: [number, number, number, number]): void {
  for (const [lng, lat] of allPositions(g) as [number, number][]) {
    expect(lng, `lng ${lng} outside [${w}, ${e}]`).toBeGreaterThanOrEqual(w);
    expect(lng, `lng ${lng} outside [${w}, ${e}]`).toBeLessThanOrEqual(e);
    expect(lat, `lat ${lat} outside [${s}, ${n}]`).toBeGreaterThanOrEqual(s);
    expect(lat, `lat ${lat} outside [${s}, ${n}]`).toBeLessThanOrEqual(n);
  }
}

/** Max decimal places used by any coordinate (precision check). */
export function maxDecimals(g: GeoJSON): number {
  return Math.max(0, ...allPositions(g).flat().map((n) => (String(n).split('.')[1] ?? '').length));
}
