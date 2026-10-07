/**
 * Layer styles, defined once at module level so they are stable between renders.
 * `test/style.test.ts` validates all of them against the MapLibre style spec.
 *
 * `LayerSpec` = a layer without `source`; <Source> supplies it in React.
 */
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

type WithoutSource<T> = Omit<T, 'source'>;
export type LayerSpec =
  | WithoutSource<CircleLayerSpecification>
  | WithoutSource<LineLayerSpecification>
  | WithoutSource<FillLayerSpecification>
  | WithoutSource<SymbolLayerSpecification>;

// ---------- ADS-B ----------
export const aircraftLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'aircraft',
  type: 'circle',
  paint: {
    'circle-radius': 6,
    'circle-color': [
      'case',
      ['get', 'emergency'], '#dc2626',
      ['get', 'onGround'], '#6b7280',
      ['interpolate', ['linear'], ['coalesce', ['get', 'altBaroFt'], 0], 0, '#f59e0b', 20000, '#0b6670', 40000, '#1d4ed8'],
    ],
    'circle-opacity': ['case', ['get', 'stale'], 0.35, 1],
    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1],
    'circle-stroke-color': '#ffffff',
  },
};

export const aircraftLabelLayer: WithoutSource<SymbolLayerSpecification> = {
  id: 'aircraft-label',
  type: 'symbol',
  layout: {
    'text-field': ['coalesce', ['get', 'callsign'], ['get', 'icao24']],
    'text-font': ['Noto Sans Regular'], // must exist on the basemap's glyph server
    'text-size': 11,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
  },
  paint: { 'text-color': '#18212b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
};

export const trackLayer: WithoutSource<LineLayerSpecification> = {
  id: 'aircraft-track',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': '#0b6670', 'line-width': 2, 'line-dasharray': [2, 1] },
};

// ---------- AIS ----------
export const vesselLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'vessels',
  type: 'circle',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 12, 7],
    // navStatus 1 = at anchor, 5 = moored
    'circle-color': ['match', ['coalesce', ['get', 'navStatus'], -1], [1, 5], '#6b7280', '#b4470f'],
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
  },
};

export const zoneFillLayer: WithoutSource<FillLayerSpecification> = {
  id: 'zone-fill',
  type: 'fill',
  paint: { 'fill-color': '#0b6670', 'fill-opacity': 0.15 },
};

export const zoneOutlineLayer: WithoutSource<LineLayerSpecification> = {
  id: 'zone-outline',
  type: 'line',
  paint: { 'line-color': '#0b6670', 'line-width': 1.5 },
};

// ---------- Radio ----------
export const coverageLayer: WithoutSource<FillLayerSpecification> = {
  id: 'coverage',
  type: 'fill',
  filter: ['==', ['get', 'kind'], 'coverage'],
  paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.12, 'fill-outline-color': '#1d4ed8' },
};

export const bearingLayer: WithoutSource<LineLayerSpecification> = {
  id: 'bearings',
  type: 'line',
  filter: ['==', ['get', 'kind'], 'bearing'],
  paint: { 'line-color': '#7c3aed', 'line-width': 2 },
};

export const stationLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'stations',
  type: 'circle',
  filter: ['==', ['geometry-type'], 'Point'],
  paint: { 'circle-radius': 6, 'circle-color': '#1d4ed8', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
};

// ---------- HF ----------
export const hfPathLayer: WithoutSource<LineLayerSpecification> = {
  id: 'hf-paths',
  type: 'line',
  filter: ['==', ['get', 'kind'], 'path'],
  layout: { 'line-cap': 'round' },
  paint: {
    'line-width': 2,
    // SNR: weak = orange, strong = teal
    'line-color': ['interpolate', ['linear'], ['get', 'snrDb'], -25, '#f97316', 0, '#eab308', 20, '#0b6670'],
  },
};

export const hfEndpointLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'hf-endpoints',
  type: 'circle',
  filter: ['in', ['get', 'kind'], ['literal', ['tx', 'rx']]],
  paint: {
    'circle-radius': 4,
    'circle-color': ['match', ['get', 'kind'], 'tx', '#18212b', '#ffffff'],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#18212b',
  },
};

// ---------- Clustering (Source patterns example) ----------
export const clusterLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'clusters',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#f97316',
    'circle-radius': ['step', ['get', 'point_count'], 15, 50, 22, 200, 30],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
};

export const clusterCountLayer: WithoutSource<SymbolLayerSpecification> = {
  id: 'cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
  paint: { 'text-color': '#ffffff' },
};

export const unclusteredLayer: WithoutSource<CircleLayerSpecification> = {
  id: 'unclustered',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: { 'circle-radius': 4, 'circle-color': '#18212b' },
};

/** Every layer, grouped by the source it belongs to (used by the style validation test). */
export const LAYERS_BY_SOURCE: Record<string, LayerSpec[]> = {
  aircraft: [aircraftLayer, aircraftLabelLayer],
  track: [trackLayer],
  vessels: [vesselLayer],
  zone: [zoneFillLayer, zoneOutlineLayer],
  radio: [coverageLayer, bearingLayer, stationLayer],
  hf: [hfPathLayer, hfEndpointLayer],
  clustered: [clusterLayer, clusterCountLayer, unclusteredLayer],
};
