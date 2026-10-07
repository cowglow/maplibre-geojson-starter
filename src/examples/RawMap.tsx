// Guide §6: maplibre-gl without the React wrapper (v6-style namespace import).
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { STYLE_URL } from '../map/style';
import { vessels } from '../data/datasets';

export function RawMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [7, 52.8],
      zoom: 5.5,
    });
    map.addControl(new maplibregl.NavigationControl());
    map.on('error', (e) => console.error('MapLibre error (no WebGL2?)', e.error));

    map.on('load', () => {
      map.addSource('vessels', { type: 'geojson', data: vessels });
      map.addLayer({
        id: 'vessels',
        type: 'circle',
        source: 'vessels',
        paint: { 'circle-radius': 7, 'circle-color': '#b4470f', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' },
      });
      map.on('click', 'vessels', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setText(`${f.properties.name ?? f.properties.mmsi} · ${f.properties.sogKt ?? '–'} kn`)
          .addTo(map);
      });
      map.on('mouseenter', 'vessels', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'vessels', () => (map.getCanvas().style.cursor = ''));
    });

    return () => map.remove(); // essential: StrictMode mounts effects twice in dev
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
