/**
 * Every hand-written example GeoJSON file in src/data must be spec-valid
 * and lie in the area it claims to (catches swapped lng/lat).
 */
import { describe, expect, it } from 'vitest';
import { booleanClockwise, booleanValid } from '@turf/turf';
import type { Feature, FeatureCollection, GeoJSON, Polygon, Position } from 'geojson';
import adsb from '../src/data/adsb.geo.json';
import ais from '../src/data/ais.geo.json';
import radio from '../src/data/radio.geo.json';
import hf from '../src/data/hf.geo.json';
import anchorage from '../src/data/anchorage-zone.geo.json';
import { expectInBounds, expectValidGeoJSON } from './helpers';

const fixtures: Array<[name: string, data: unknown, bbox: [number, number, number, number]]> = [
  ['adsb.geo.json', adsb, [11, 47.8, 12.3, 48.6]],
  ['ais.geo.json', ais, [3, 51, 11, 54.5]],
  ['radio.geo.json', radio, [11, 47.8, 12.2, 48.5]],
  ['hf.geo.json', hf, [-180, -90, 180, 90]],
  ['anchorage-zone.geo.json', anchorage, [3.9, 51.9, 4.1, 52.1]],
];

describe.each(fixtures)('%s', (_name, data, bbox) => {
  it('is valid RFC 7946 GeoJSON', () => expectValidGeoJSON(data));
  it('lies inside its expected area', () => expectInBounds(data as GeoJSON, bbox));

  it('polygons are valid with correct winding (outer CCW, holes CW)', () => {
    const feats = (data as FeatureCollection).type === 'FeatureCollection'
      ? (data as FeatureCollection).features
      : [data as Feature];
    for (const f of feats.filter((x): x is Feature<Polygon> => x.geometry?.type === 'Polygon')) {
      expect(booleanValid(f)).toBe(true);
      f.geometry.coordinates.forEach((ring: Position[], i: number) => {
        expect(booleanClockwise(ring), `ring ${i}`).toBe(i > 0);
      });
    }
  });
});
