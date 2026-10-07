/**
 * Geofences: which features are inside a zone (holes respected).
 */
import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';

export function featuresInZone<P extends GeoJsonProperties>(
  features: Feature<Point, P>[],
  zone: Feature<Polygon | MultiPolygon>,
): Feature<Point, P>[] {
  return features.filter((f) => booleanPointInPolygon(f, zone));
}
