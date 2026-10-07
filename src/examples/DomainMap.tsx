// All domain datasets, built from raw sample messages by the factories in src/geo.
import { useCallback, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import { STYLE_URL } from '../map/style';
import * as L from '../map/layers';
import { aircraft, anchorageZone, hf, radio, track, vessels } from '../data/datasets';

const GROUPS = {
  adsb: 'ADS-B aircraft + track',
  ais: 'AIS vessels + anchorage zone',
  radio: 'Radio station, coverage, DF bearings',
  hf: 'HF great-circle paths',
} as const;
type Group = keyof typeof GROUPS;

const INTERACTIVE = ['aircraft', 'vessels', 'stations', 'coverage', 'bearings', 'hf-paths', 'zone-fill'];

type Picked = { lng: number; lat: number; layer: string; props: Record<string, unknown> } | null;

export function DomainMap() {
  const mapRef = useRef<MapRef>(null);
  const [visible, setVisible] = useState<Record<Group, boolean>>({ adsb: true, ais: true, radio: true, hf: true });
  const [picked, setPicked] = useState<Picked>(null);
  const [cursor, setCursor] = useState('');
  const selectedRef = useRef<{ source: string; id: string | number } | null>(null);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (selectedRef.current && map) map.setFeatureState(selectedRef.current, { selected: false });
    const f = e.features?.[0];
    if (!f) return setPicked(null);
    if (f.id !== undefined && f.source && map) {
      // aircraft ids come from promoteId="icao24"; vessel ids are numeric MMSIs
      selectedRef.current = { source: f.source, id: f.id };
      map.setFeatureState(selectedRef.current, { selected: true });
    }
    setPicked({ lng: e.lngLat.lng, lat: e.lngLat.lat, layer: f.layer.id, props: f.properties });
  }, []);

  const visibility = (g: Group) => (visible[g] ? 'visible' : 'none') as 'visible' | 'none';

  return (
    <>
      <div className="panel">
        <strong>Layers</strong>
        {(Object.keys(GROUPS) as Group[]).map((g) => (
          <label key={g}>
            <input type="checkbox" checked={visible[g]} onChange={(e) => setVisible((v) => ({ ...v, [g]: e.target.checked }))} />
            {GROUPS[g]}
          </label>
        ))}
        <p>Click a feature to see the properties the factories produced. Zoom out for the HF paths.</p>
      </div>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 9, latitude: 50.5, zoom: 5 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={STYLE_URL}
        interactiveLayerIds={INTERACTIVE}
        onClick={onClick}
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('')}
        cursor={cursor}
      >
        <NavigationControl />
        <ScaleControl />

        <Source id="hf" type="geojson" data={hf}>
          <Layer {...L.hfPathLayer} layout={{ ...L.hfPathLayer.layout, visibility: visibility('hf') }} />
          <Layer {...L.hfEndpointLayer} layout={{ visibility: visibility('hf') }} />
        </Source>

        <Source id="radio" type="geojson" data={radio}>
          <Layer {...L.coverageLayer} layout={{ visibility: visibility('radio') }} />
          <Layer {...L.bearingLayer} layout={{ visibility: visibility('radio') }} />
          <Layer {...L.stationLayer} layout={{ visibility: visibility('radio') }} />
        </Source>

        <Source id="zone" type="geojson" data={anchorageZone}>
          <Layer {...L.zoneFillLayer} layout={{ visibility: visibility('ais') }} />
          <Layer {...L.zoneOutlineLayer} layout={{ visibility: visibility('ais') }} />
        </Source>
        <Source id="vessels" type="geojson" data={vessels}>
          <Layer {...L.vesselLayer} layout={{ visibility: visibility('ais') }} />
        </Source>

        <Source id="track" type="geojson" data={track}>
          <Layer {...L.trackLayer} layout={{ ...L.trackLayer.layout, visibility: visibility('adsb') }} />
        </Source>
        {/* ICAO24 is a hex string -> promoteId so feature-state works */}
        <Source id="aircraft" type="geojson" data={aircraft} promoteId="icao24">
          <Layer {...L.aircraftLayer} layout={{ visibility: visibility('adsb') }} />
          <Layer {...L.aircraftLabelLayer} layout={{ ...L.aircraftLabelLayer.layout, visibility: visibility('adsb') }} />
        </Source>

        {picked && (
          <Popup longitude={picked.lng} latitude={picked.lat} onClose={() => setPicked(null)} closeOnClick={false} maxWidth="320px">
            <strong>{picked.layer}</strong>
            <pre className="props">{JSON.stringify(picked.props, null, 2)}</pre>
          </Popup>
        )}
      </Map>
    </>
  );
}
