/**
 * Validates every layer definition (paint/layout properties and expressions)
 * against the MapLibre style spec, using the real demo data as sources.
 * Catches typos like 'circle-colour' or a malformed expression in CI, not in the browser.
 */
import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { LAYERS_BY_SOURCE } from '../src/map/layers';
import * as data from '../src/data/datasets';

const sourceData: Record<string, unknown> = {
  aircraft: data.aircraft,
  track: data.track,
  vessels: data.vessels,
  zone: data.anchorageZone,
  radio: data.radio,
  hf: data.hf,
  clustered: data.syntheticVessels(20),
};

describe('MapLibre style validation', () => {
  it('every layer + source combination is a valid style', () => {
    const sources = Object.fromEntries(
      Object.entries(sourceData).map(([id, d]) => [id, { type: 'geojson', data: d, ...(id === 'clustered' ? { cluster: true } : {}) }]),
    );
    const layers = Object.entries(LAYERS_BY_SOURCE).flatMap(([source, ls]) => ls.map((l) => ({ ...l, source })));
    const errors = validateStyleMin({ version: 8, glyphs: 'https://example.com/{fontstack}/{range}.pbf', sources, layers } as never);
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('catches a typo (proves the validator is working)', () => {
    const errors = validateStyleMin({
      version: 8,
      sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [{ id: 'bad', type: 'circle', source: 's', paint: { 'circle-colour': '#f00' } }],
    } as never);
    expect(errors.length).toBeGreaterThan(0);
  });
});
