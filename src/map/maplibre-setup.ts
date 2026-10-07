/**
 * MapLibre GL JS v6 + bundlers (Vite, webpack, …):
 * v6 locates its web worker relative to `import.meta.url`. After bundling that path no
 * longer exists and the map fails with "Worker failed to load". Let Vite bundle the worker
 * (as an ES module worker, with its shared chunk) and tell MapLibre where it ended up.
 *
 * Import this module once, before any map is created (see main.tsx).
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
