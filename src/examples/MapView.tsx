// Guide §4: the smallest useful map.
import Map, { NavigationControl } from 'react-map-gl/maplibre';
import { STYLE_URL } from '../map/style';

export function MapView() {
  return (
    <Map
      initialViewState={{ longitude: 2.35, latitude: 48.86, zoom: 11 }}
      style={{ width: '100%', height: '100%' }} // the map MUST have a height
      mapStyle={STYLE_URL}
    >
      <NavigationControl position="top-right" />
    </Map>
  );
}
