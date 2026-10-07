/**
 * Example code for the Turf guide §04: a DF cross-fix from two bearings.
 */
import { azimuthToBearing, destination, greatCircle, lineIntersect, lineString } from '@turf/turf';
import type { Feature, Point, Position } from 'geojson';

export type DfBearing = { station: Position; bearingDeg: number }; // compass bearing, 0-360

// #region cross-fix
/**
 * Where two DF bearings cross. Each bearing becomes a great-circle ray `rangeKm` long,
 * densified so lineIntersect (which works on straight lng/lat segments) follows the curve.
 * Returns null when the rays don't cross within range.
 */
export function crossFix(a: DfBearing, b: DfBearing, rangeKm = 500): Feature<Point> | null {
  const ray = ({ station, bearingDeg }: DfBearing) => {
    const end = destination(station, rangeKm, azimuthToBearing(bearingDeg)); // -> [-180, 180]
    return greatCircle(station, end, { npoints: 100 });
  };
  return lineIntersect(ray(a), ray(b)).features[0] ?? null;
}
// #endregion

// #region naive-cross-fix
/** The tempting version: two-point lines. Fine for short VHF bearings, not for HF. */
export function naiveCrossFix(a: DfBearing, b: DfBearing, rangeKm = 500) {
  const ray = ({ station, bearingDeg }: DfBearing) => {
    const end = destination(station, rangeKm, azimuthToBearing(bearingDeg));
    return lineString([station, end.geometry.coordinates]);
  };
  return lineIntersect(ray(a), ray(b)).features[0] ?? null;
}
// #endregion
