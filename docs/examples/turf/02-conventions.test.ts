/**
 * Turf guide §02: conventions every Turf call relies on.
 */
import { describe, expect, it } from 'vitest';
import {
  bearing,
  bearingToAzimuth,
  booleanPointInPolygon,
  destination,
  distance,
  point,
  polygon,
} from '@turf/turf';

const munich = [11.582, 48.1351];
const hamburg = [9.9937, 53.5511];

describe('conventions', () => {
  // #region lng-lat
  it('positions are [lng, lat]; swapping them is valid input, just the wrong place', () => {
    const swapped = [munich[1]!, munich[0]!]; // [48.1351, 11.582]: in the Gulf of Aden
    expect(distance(munich, swapped)).toBeGreaterThan(5000); // km, and no error raised
  });
  // #endregion

  // #region inputs
  it('accepts a Position, a Point geometry or a Point Feature, and returns GeoJSON', () => {
    const asFeature = point(munich, { stationId: 'rx-wst-01' });
    expect(distance(asFeature, hamburg)).toBe(distance(asFeature.geometry, hamburg));

    const end = destination(munich, 40, 90); // a Feature<Point>, not a Position
    expect(end.type).toBe('Feature');
    expect(end.geometry.coordinates[0]).toBeGreaterThan(munich[0]!);
  });
  // #endregion

  // #region units
  it('kilometres unless you say otherwise', () => {
    expect(distance(munich, hamburg)).toBeCloseTo(612.4, 1);
    expect(distance(munich, hamburg, { units: 'nauticalmiles' })).toBeCloseTo(330.7, 1);
    expect(distance(munich, hamburg, { units: 'meters' })).toBeCloseTo(612_429, 0);
  });
  // #endregion

  // #region bearings
  it('bearing() returns -180..180; compass bearings are 0..360', () => {
    const towardsAugsburg = bearing(munich, [10.8978, 48.3705]); // west-north-west
    expect(towardsAugsburg).toBeCloseTo(-62.4, 1);
    expect(bearingToAzimuth(towardsAugsburg)).toBeCloseTo(297.6, 1); // what a DF display shows
  });
  // #endregion

  // #region planar
  it('distances are great-circle, but polygon edges are straight lines in lng/lat', () => {
    // A strip between 40°N and 50°N, 200° of longitude wide.
    const strip = polygon([[[-100, 40], [100, 40], [100, 50], [-100, 50], [-100, 40]]]);
    // On the globe, the great circle from [-100, 50] to [100, 50] passes near 82°N,
    // so [0, 55] would be inside. booleanPointInPolygon follows the straight edge at 50°N:
    expect(booleanPointInPolygon([0, 55], strip)).toBe(false);
  });
  // #endregion
});
