// The GeoJSON <Source> patterns: clustering, polygons + feature-state hover (promoteId),
// line gradient (lineMetrics) and mixed geometry split by type (generateId).
import { useCallback, useMemo, useRef } from 'react';
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import { STYLE_URL } from '../map/style';
import { clusterCountLayer, clusterLayer, unclusteredLayer } from '../map/layers';
import { syntheticVessels } from '../data/datasets';
import { bboxPolygon, collection, line, point } from '../geo';

type DistrictProps = { districtId: number; density: number };

// 4×4 grid of "districts" around Utrecht, each with a density value
const districts: FeatureCollection<Polygon, DistrictProps> = collection(
  Array.from({ length: 16 }, (_, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const w = 4.95 + col * 0.08, s = 51.98 + row * 0.05;
    return bboxPolygon([w, s, w + 0.08, s + 0.05], { districtId: i + 1, density: ((i * 7919) % 5000) + 200 });
  }),
);

const route = collection([
  line([[4.4777, 51.9244], [4.55, 52.0], [4.65, 52.12], [4.76, 52.25], [4.8945, 52.3667]], { name: 'Rotterdam → Amsterdam' }),
]);

const annotations: FeatureCollection<Geometry> = collection<Geometry, Record<string, unknown>>([
  point(4.3, 52.08, { label: 'Point' }),
  line([[4.2, 52.0], [4.35, 52.05], [4.4, 52.12]], { label: 'LineString' }),
  bboxPolygon([4.15, 52.1, 4.25, 52.16], { label: 'Polygon' }) as Feature<Geometry, Record<string, unknown>>,
]);

export function SourcePatterns() {
  const mapRef = useRef<MapRef>(null);
  const hovered = useRef<number | null>(null);
  const clustered = useMemo(() => syntheticVessels(2000), []);

  const setHover = (id: number | null) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (hovered.current !== null) map.setFeatureState({ source: 'districts', id: hovered.current }, { hover: false });
    hovered.current = id;
    if (id !== null) map.setFeatureState({ source: 'districts', id }, { hover: true });
  };

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const id = e.features?.find((f) => f.layer.id === 'districts-fill')?.id;
    setHover(typeof id === 'number' ? id : null);
  }, []);

  return (
    <>
      <div className="panel">
        <strong>GeoJSON Source patterns</strong>
        <p>North Sea: 2,000 clustered points. Utrecht: polygons with hover (promoteId). Rotterdam → Amsterdam: line gradient (lineMetrics). The Hague: mixed geometry split by type (generateId).</p>
      </div>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 4.6, latitude: 53.4, zoom: 6.4 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={STYLE_URL}
        interactiveLayerIds={['districts-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <NavigationControl />

        <Source id="clustered" type="geojson" data={clustered} cluster clusterRadius={50} clusterMaxZoom={14}
          clusterProperties={{ totalSog: ['+', ['coalesce', ['get', 'sogKt'], 0]] }}>
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
        </Source>

        <Source id="districts" type="geojson" data={districts} promoteId="districtId">
          <Layer id="districts-fill" type="fill" paint={{
            'fill-color': ['interpolate', ['linear'], ['get', 'density'], 0, '#e0f2f1', 5000, '#0b6670'],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.55],
          }} />
          <Layer id="districts-outline" type="line" paint={{ 'line-color': '#18212b', 'line-width': 1 }} />
        </Source>

        <Source id="route" type="geojson" data={route} lineMetrics>
          <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{
            'line-width': 6,
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#16a34a', 1, '#dc2626'],
          }} />
        </Source>

        <Source id="annotations" type="geojson" data={annotations} generateId>
          <Layer id="ann-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'fill-color': '#7c3aed', 'fill-opacity': 0.3 }} />
          <Layer id="ann-line" type="line" filter={['==', ['geometry-type'], 'LineString']} paint={{ 'line-color': '#7c3aed', 'line-width': 3 }} />
          <Layer id="ann-pt" type="circle" filter={['==', ['geometry-type'], 'Point']} paint={{ 'circle-radius': 6, 'circle-color': '#7c3aed' }} />
        </Source>
      </Map>
    </>
  );
}
