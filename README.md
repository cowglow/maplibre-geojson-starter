# MapLibre + GeoJSON starter

Typed GeoJSON factories for **ADS-B, AIS, radio and HF** data, tested three ways (example tests, fast-check property tests, golden snapshots), plus a MapLibre + React demo app with every example from the onboarding guide.

## Quick start

Needs Node 20+ (tested on Node 22).

```bash
npm install
npm test          # 100+ tests: examples, properties, golden snapshots, style validation
npm run dev       # demo app at http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on save |
| `npm run test:update` | Accept intentional changes to golden snapshots |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Typecheck + production build |
| `FC_RUNS=2000 npm test` | Hunt harder: 2,000 fast-check runs per property (default 100) |
| `FC_SEED=<seed> npm test` | Replay a fast-check failure exactly (seed is printed in the failure) |

Versions used: maplibre-gl 6.13, react-map-gl 8.1, React 19, Vite 8, Vitest 5, fast-check 4, Turf 7, TypeScript 7.

## What's inside

```
src/
  geo/                    ← the factories: pure functions, no React, no MapLibre
    factories.ts          point, line, bboxPolygon, collection, round6, notNull
    ais.ts                AIS report → Point (sentinels 91/181/102.3/360/511 handled)
    adsb.ts               readsb/dump1090 aircraft → Point; track history → LineString
    radio.ts              station, coverage polygon, DF bearing line
    hf.ts                 HF spot → great-circle path, split cleanly at the antimeridian
    zones.ts              geofence: features inside a polygon (holes respected)
  data/
    raw/*.json            sample raw feed messages (the factories' input)
    *.geo.json            hand-written example GeoJSON (from the onboarding examples)
    datasets.ts           raw messages → GeoJSON through the factories (used by demo + tests)
  map/
    layers.ts             all layer styles, defined once at module level
    maplibre-setup.ts     MapLibre v6 worker fix for bundlers (see below)
    style.ts              basemap URL
  examples/
    DomainMap.tsx         ADS-B · AIS · radio · HF on one map, toggles, click → properties
    SourcePatterns.tsx    clustering, polygon hover (promoteId), line gradient, mixed geometry
    StoreMap.tsx          guide §5: typed source, data-driven layer, popup, flyTo
    RawMap.tsx            guide §6: maplibre-gl without the wrapper
    MapView.tsx           guide §4: the smallest map
test/
  helpers.ts              expectValidGeoJSON, expectInBounds, allPositions, maxDecimals
  arbitraries.ts          fast-check generators for AIS, readsb, tracks, HF spots, positions
  *.test.ts               one file per factory module, plus:
  fixtures.test.ts        every example .geo.json is valid, in its area, correctly wound
  style.test.ts           every layer validated against the MapLibre style spec
  golden.test.ts          raw samples → GeoJSON snapshots (changes show up in review)
docs/
  MapLibre-React-Onboarding.pdf
```

## How the tests are layered

1. **Example tests**: one per domain rule ("heading 511 becomes null", "ICAO24 is not the feature id"). They document intent.
2. **Property tests (fast-check)**: for every factory, the output is always valid GeoJSON (or `null` exactly when it should be), positions survive in `[lng, lat]` order, nothing is lost or invented, and geometric invariants hold (coverage contains its station, a bearing line is `rangeKm` long, HF paths never jump across the map).
3. **Golden snapshots**: real sample messages in `src/data/raw` → GeoJSON snapshots.
4. **Style validation**: `validateStyleMin` catches typos in paint/layout properties and expressions in CI, not in the browser.

## Bugs fast-check found while building this

These are why the property tests exist. Each one is pinned as a regression test:

- **Turf ended an HF path at +180 when it approached from the west.** MapLibre would draw a line across the whole map. → `alignAntimeridian` in `hf.ts`.
- **Turf returned a MultiLineString part with a single point** for a near-antipodal path. That's invalid GeoJSON. → `splitAtAntimeridian` drops degenerate parts and splits exactly at ±180, with no gap.
- **My own fix divided 0 by 0** for over-the-pole paths (two consecutive points on the antimeridian) and emitted `null` latitudes. → fixed and pinned.
- **Known limit, documented rather than "fixed":** great circles over or near a pole flip longitude by 180° at the pole. Web Mercator can't show latitudes beyond ~85° anyway.
- **Known limit:** coverage circles near ±180 keep a continuous ring (longitudes like 180.3). MapLibre draws that without a seam; strict RFC validators may complain.

## MapLibre v6 + Vite: the worker fix

MapLibre GL JS v6 finds its web worker relative to `import.meta.url`. After bundling, that path is gone and the map fails with **"Worker failed to load"**. The fix is in `src/map/maplibre-setup.ts` (imported first in `main.tsx`) plus `worker: { format: 'es' }` in `vite.config.ts`:

```ts
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
setWorkerUrl(workerUrl);
```

Your work project needs the same thing if it uses v6 with a bundler.

## Adapting it to your feeds

1. Drop a few real raw messages into `src/data/raw/`.
2. Adjust the input type in the matching factory (`ReadsbAircraft`, `AisPositionReport`, …) and its arbitrary in `test/arbitraries.ts`.
3. Run `npm test`. Property tests will tell you which assumptions your real data breaks.
4. Run `npm run test:update` once the golden output looks right, and commit the snapshots.

## Notes

- **Basemap:** `src/map/style.ts` uses OpenFreeMap (free, no key). Swap it for your team's provider. Symbol layers use the font `Noto Sans Regular`; change `text-font` in `layers.ts` if your provider's glyph server doesn't have it.
- **IDs:** AIS uses the numeric MMSI as feature id. ADS-B uses `promoteId="icao24"` on the `<Source>`, because hex strings can't be feature-state ids.
- **Altitude:** barometric altitude is pressure altitude in feet, not ellipsoid height, so it stays in properties and positions are 2D.
