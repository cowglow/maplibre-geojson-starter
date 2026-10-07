/**
 * Turf guide §01: MapLibre draws, Turf computes.
 */
import { describe, expect, it } from 'vitest';
// #region imports
// One package with everything, imported by name so Vite can drop what you don't use:
import { circle, featureCollection } from '@turf/turf';
// #endregion
import { expectValidGeoJSON } from '../../../test/helpers';

describe('Turf output is ready for a MapLibre <Source>', () => {
  // #region range-rings
  it('range rings around a station: plain GeoJSON in, plain GeoJSON out', () => {
    const station = [11.582, 48.1351]; // [lng, lat], Munich
    const rings = featureCollection(
      [10, 25, 50].map((km) => circle(station, km, { steps: 64, properties: { km } })),
    );

    expectValidGeoJSON(rings); // hand it straight to <Source type="geojson" data={rings}>
    expect(rings.features.map((f) => f.properties.km)).toEqual([10, 25, 50]);
    expect(rings.features[0]!.geometry.coordinates[0]).toHaveLength(65); // closed ring
  });
  // #endregion
});
