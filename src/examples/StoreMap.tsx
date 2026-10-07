// Guide §5: typed GeoJSON source, data-driven layer, click -> popup, flyTo via ref.
import { useCallback, useRef, useState } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { FeatureCollection, Point } from 'geojson';
import { STYLE_URL } from '../map/style';

type StoreProps = { name: string; revenue: number };

const stores: FeatureCollection<Point, StoreProps> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.86] }, properties: { name: 'Central', revenue: 120 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3, 48.87] }, properties: { name: 'West', revenue: 40 } },
  ],
};

// Defined OUTSIDE the component so it is stable between renders
const storeLayer: LayerProps = {
  id: 'stores',
  type: 'circle',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'revenue'], 0, 4, 200, 20],
    'circle-color': ['case', ['>=', ['get', 'revenue'], 100], '#16a34a', '#f97316'],
    'circle-stroke-width': 1,
    'circle-stroke-color': '#fff',
  },
};

type Selected = { lng: number; lat: number; props: StoreProps } | null;

export function StoreMap() {
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [cursor, setCursor] = useState('');

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return setSelected(null);
    const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
    setSelected({ lng, lat, props: f.properties as StoreProps });
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
  }, []);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 2.33, latitude: 48.865, zoom: 12 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={STYLE_URL}
      interactiveLayerIds={['stores']}
      onClick={onClick}
      onMouseEnter={() => setCursor('pointer')}
      onMouseLeave={() => setCursor('')}
      cursor={cursor}
    >
      <NavigationControl />
      <Source id="stores-src" type="geojson" data={stores}>
        <Layer {...storeLayer} />
      </Source>
      {selected && (
        <Popup longitude={selected.lng} latitude={selected.lat} onClose={() => setSelected(null)} closeOnClick={false}>
          <strong>{selected.props.name}</strong>
          <div>Revenue: {selected.props.revenue}k</div>
        </Popup>
      )}
    </Map>
  );
}
