---
title: Geospatial operations with Turf.js
kicker: TEAM ONBOARDING · OCTOBER 2026
lede: MapLibre draws, Turf computes. Coverage areas, DF cross-fixes, geofences, track speeds and great-circle paths for our ADS-B, AIS, radio and HF data, plus the gotchas that bit us. Every example runs in npm test.
---

## Where Turf fits

MapLibre renders GeoJSON. It doesn't measure anything. **Turf** is a library of pure functions on GeoJSON: features go in, numbers or new features come out, and you hand those to a MapLibre `<Source>`. There is no map, no DOM and no state, so everything Turf does can be unit tested.

| Layer | Does | In this repo |
|---|---|---|
| Feeds | Raw messages: readsb JSON, AIS reports, DF bearings, HF spots | `src/data/raw` |
| Factories | Raw message → GeoJSON. Turf does the geometry | `src/geo` |
| Turf | Distances, bearings, circles, great circles, point-in-polygon | `@turf/turf` 7.4 |
| MapLibre | Draws the GeoJSON. Styling, clicks, popups | `src/map`, `src/examples` |

@snippet docs/examples/turf/01-where-it-fits.test.ts#range-rings

**One package or many.** Turf 7 is published as one package per function (`@turf/distance`, `@turf/circle`, …), and `@turf/turf` re-exports all of them. We install `@turf/turf` and import by name. The package is ES modules with `"sideEffects": false`, so Vite only bundles the functions you import. In a small library that needs one or two functions, install just those packages (`npm install @turf/distance`); the API is the same.

@snippet docs/examples/turf/01-where-it-fits.test.ts#imports

:::warning
**Coming from Turf 6?** Turf 7 uses named exports (`import { distance } from '@turf/distance'`, not a default import) and the types from `@types/geojson`. `polygon()` now throws if a ring isn't closed. `buffer()` can return `undefined` for invalid input. In 7.4, `nearestPointOnLine` renamed its result properties (`index` → `segmentIndex`, `location` → `totalDistance`, `dist` → `pointDistance`). The old names still work but are deprecated.
:::

## Conventions

Five rules that every Turf call relies on:

| Convention | What it means |
|---|---|
| `[lng, lat]` | Longitude first, always. A swapped position is still valid input, so nothing warns you. |
| GeoJSON in, GeoJSON out | Inputs take a Position, a Point or a Point Feature. Results are Features: read `.geometry.coordinates`. |
| `units` | Kilometres by default (`distance`, `length`, `along`, `destination`, `circle`, `buffer`). `area()` is always m². Use `'nauticalmiles'` for AIS and aviation. |
| Geodesic vs planar | `distance`, `bearing`, `destination`, `circle`, `greatCircle`, `length` and `area` work on a sphere (radius 6,371,008.8 m). `booleanPointInPolygon`, `lineIntersect`, `simplify` and `bbox` work on the raw numbers, as if lng/lat were flat. |
| Bearings | `bearing()` returns −180…180 (0 = north, clockwise). `destination()` documents −180…180 as input. `bearingToAzimuth` converts to the 0…360 a DF display shows. |

Swapped coordinates are the most common bug, and Turf will not catch them:

@snippet docs/examples/turf/02-conventions.test.ts#lng-lat

@snippet docs/examples/turf/02-conventions.test.ts#inputs

@snippet docs/examples/turf/02-conventions.test.ts#units

@snippet docs/examples/turf/02-conventions.test.ts#bearings

Geodesic vs planar matters as soon as shapes get big. A polygon edge is a straight line in lng/lat, not a great circle:

@snippet docs/examples/turf/02-conventions.test.ts#planar

## Function map

The functions we use or reach for, checked against the 7.4 type definitions. Distances are in kilometres unless `units` says otherwise.

### Measurement

| Function | Returns | Notes |
|---|---|---|
| `distance(a, b, { units })` | number | Great-circle (haversine) distance |
| `bearing(a, b, { final })` | number, −180…180 | Initial bearing; `final: true` for the bearing on arrival |
| `destination(origin, dist, bearing, { units })` | `Feature<Point>` | Where you end up. Doesn't wrap longitudes (§05) |
| `length(line, { units })` | number | Sum of the segment distances |
| `area(polygon)` | number, m² | Geodesic; holes are subtracted |
| `along(line, dist, { units })` | `Feature<Point>` | The point `dist` along a line |
| `midpoint(a, b)` | `Feature<Point>` | Halfway along the great circle, not the lng/lat average |
| `nearestPoint(target, points)` | `Feature<Point>` | Adds `featureIndex` and `distanceToPoint` |

### Creation

| Function | Returns | Notes |
|---|---|---|
| `point`, `lineString`, `polygon` | Feature | Validate their input; `polygon` needs closed rings of ≥ 4 positions |
| `circle(center, radius, { steps, units })` | `Feature<Polygon>` | 64 steps by default |
| `bbox(geojson)` | `[w, s, e, n]` | Min/max of the raw numbers (§05) |
| `bboxPolygon(bbox)` | `Feature<Polygon>` | Rectangle from a bbox |

### Booleans

| Function | Returns | Notes |
|---|---|---|
| `booleanPointInPolygon(pt, poly, { ignoreBoundary })` | boolean | Holes respected; on the boundary counts as inside by default |
| `booleanIntersects(a, b)` | boolean | True when the two geometries share any point |
| `booleanValid(f)` | boolean | OGC Simple Features validity (self-intersections and so on) |
| `booleanClockwise(ring)` | boolean | RFC 7946: outer rings are counter-clockwise |

### Transformation

| Function | Returns | Notes |
|---|---|---|
| `buffer(geojson, radius, { units, steps })` | Feature or `undefined` | 8 steps by default. `undefined` for invalid input |
| `simplify(geojson, { tolerance, highQuality })` | same type | Douglas-Peucker in degrees, not km |
| `rewind(geojson, { reverse })` | same type | Fixes winding: outer CCW, holes CW |
| `truncate(geojson, { precision, coordinates })` | same type | 6 decimals and 3 coordinates by default; a copy unless `mutate` |
| `cleanCoords(geojson)` | same type | Drops duplicate and collinear points |

### Lines

| Function | Returns | Notes |
|---|---|---|
| `lineIntersect(a, b)` | `FeatureCollection<Point>` | Planar; densify long lines first (§04) |
| `nearestPointOnLine(line, pt)` | `Feature<Point>` | `segmentIndex`, `totalDistance`, `pointDistance` (7.4 names) |
| `lineSlice(start, stop, line)` | `Feature<LineString>` | The part of a line between two points |
| `greatCircle(a, b, { npoints, offset })` | LineString or MultiLineString | 100 points by default. Read §04 and §05 before you use it |

## Domain recipes

### Coverage area from a station

`circle()` gives a polygon with 64 points, which is a fine first model of a receiver's range. Swap in a terrain-aware model later; the polygon's shape on the map stays the same. `coverageToFeature` wraps it with rounding and properties:

@snippet docs/examples/turf/04-recipes.test.ts#coverage

**Near ±180**, Turf keeps the ring continuous, so longitudes run past 180. MapLibre draws that without a seam. Point-in-polygon tests are planar, though, so a contact reported at −179.95 has to be shifted by 360° before it counts as inside:

@snippet docs/examples/turf/04-recipes.test.ts#coverage-antimeridian

### DF bearing line and a cross-fix

A bearing line is the station plus `destination()` along the bearing. `dfBearingToFeature` normalises the bearing to 0…360 for display and converts it to −180…180 for Turf:

@snippet docs/examples/turf/04-recipes.test.ts#df-line

Two bearings from two stations cross at the transmitter. `lineIntersect` treats each segment as a straight line in lng/lat, so make each bearing a great-circle ray with enough points to follow the curve:

@snippet docs/examples/turf/cross-fix.ts#cross-fix

@snippet docs/examples/turf/04-recipes.test.ts#cross-fix-test

:::warning
**Two-point lines are fine for VHF, wrong for HF.** For bearings a few tens of km long, a straight line in lng/lat is close enough (the Freising fix is within 100 m). At HF ranges the same shortcut misses by hundreds of km. MapLibre also draws a two-point LineString as a straight line on the Mercator map, so draw long bearings from the densified ray as well.
:::

@snippet docs/examples/turf/cross-fix.ts#naive-cross-fix

### Geofence alerts for AIS, including holes

`featuresInZone` is one line of Turf. The work is in the zone: the outer ring is the anchorage, and the hole is a cable area where anchoring is forbidden. `booleanPointInPolygon` respects holes:

@snippet src/geo/zones.ts#fn:featuresInZone

@snippet docs/examples/turf/04-recipes.test.ts#geofence

For entry and exit alerts, run this on each new position and compare with the vessel's previous state. Decide once whether "on the boundary" counts as inside, and write it in a test.

### Track length and average speed from ADS-B

`length()` sums the great-circle distances between consecutive points. Dividing by the time between the first and last kept sample gives the average ground speed. Speeds between consecutive samples are a cheap check for bad positions:

@snippet docs/examples/turf/04-recipes.test.ts#track

### Nearest vessel or aircraft to a point

`nearestPoint` returns a copy of the closest feature, with its index and distance added to the properties. It checks every feature, which is fine for hundreds of contacts (§05 covers thousands):

@snippet docs/examples/turf/04-recipes.test.ts#nearest

### HF great-circle paths, and why we normalise Turf's output

A great circle is the shortest path, and on a Mercator map it curves. `greatCircle` densifies it so it draws correctly. It splits at the antimeridian *sometimes*, depending on `npoints` and `offset`. It can also end a path at +180 after approaching from the west, and return a part with a single point. `hfPathToFeature` therefore always flattens Turf's output and runs it through `splitAtAntimeridian` (both bugs are in the fast-check guide, §07):

@snippet docs/examples/turf/04-recipes.test.ts#hf

@snippet src/geo/hf.ts#fn:hfPathToFeature

## Gotchas

| Gotcha | What happens | What we do |
|---|---|---|
| Antimeridian | `circle` and `destination` return longitudes past ±180. `bbox` of a line across ±180 spans the world the other way. `greatCircle` splits inconsistently | Normalise with `splitAtAntimeridian`. Shift by 360° for point-in-polygon tests near ±180 |
| Antipodes | `greatCircle` throws for antipodal points, where every great circle is equally short | `hfPathToFeature` returns `null` within 100 km of antipodal |
| Poles | A circle around a polar station doesn't contain the pole. Great circles over a pole flip longitude by 180° | Web Mercator stops at about 85°. Use the globe projection for polar work |
| Large scales | `buffer` is exact around a point, approximate along a long line. `lineIntersect` and `bbox` are planar | Densify, prefer geodesic functions, and check the error at your scale in a test |
| Precision | Results carry floating-point noise and `-0` | `truncate` (or our `round6`) before comparing or snapshotting |
| Many features | Turf functions check every feature you pass them | Index first: Turf's `geojsonRbush`, or `kdbush` / `geokdbush` for points |

**The antimeridian.** −180 and +180 are the same meridian, but Turf mostly does arithmetic on the numbers:

@snippet docs/examples/turf/05-gotchas.test.ts#antimeridian

**Near the poles.** A ring in lng/lat can't go *around* a pole, so the pole ends up outside:

@snippet docs/examples/turf/05-gotchas.test.ts#poles

**Accuracy at large scales.** `buffer` projects around the feature's centre, so it is exact for a point and drifts along a long line. `area` is geodesic, so a square degree at 60° N is about half the size of one at the equator:

@snippet docs/examples/turf/05-gotchas.test.ts#scale

**Precision.** Turf returns full doubles. Truncate before you snapshot or compare, or a refactor that changes the 16th digit breaks your tests:

@snippet docs/examples/turf/05-gotchas.test.ts#precision

**Many features.** `nearestPoint`, `booleanPointInPolygon` over a list and `lineIntersect` on big collections check every feature. That is fine for one AIS feed area. For a whole region's ADS-B every second, build an index once per update, query it with a bounding box, and run Turf only on the candidates. Turf includes `geojsonRbush`, an R-tree over GeoJSON features:

@snippet docs/examples/turf/05-gotchas.test.ts#index

:::note
**For points only**, **kdbush** is a faster static index, and **geokdbush** adds nearest-neighbour queries on the sphere that handle the date line. Neither is a dependency of this repo yet.
:::

## Testing Turf-based code

Geometry code is where property-based testing pays off most: the edge cases (±180, the poles, antipodes, zero length) are exactly the inputs nobody writes by hand. The **fast-check onboarding guide** (`docs/fast-check-onboarding.pdf`) covers the tooling. Three patterns are specific to geometry:

**1. Use Turf as an oracle, through different functions.** If the code under test builds a circle with `circle()`, check it with `booleanPointInPolygon` and `distance`, not by calling `circle()` again:

@snippet test/radio.test.ts#geometric

An oracle can also be a plain geometric fact. A track can never be shorter than the straight line between its ends. Our first version compared the two with an absolute tolerance of 10<sup>−9</sup> km. fast-check found a track that runs out to the antipode, where Turf's haversine rounding made the track 0.65 mm *shorter* than its end-to-end distance. Comparing two computed distances needs a relative tolerance:

@snippet docs/examples/turf/06-testing.test.ts#oracle-track

**2. Build the scenario backwards.** Choose the answer first (the transmitter), derive the inputs from it (bearings measured with `bearing()`), then check that the code finds the answer again. This property checks `crossFix` between 60° S and 60° N, at ranges from 20 to 1,500 km:

@snippet docs/examples/turf/06-testing.test.ts#oracle-cross-fix

**3. Pin Turf's quirks.** The tests in §04 and §05, and the case study in the fast-check guide, assert what Turf does today: longitudes past 180, inconsistent splitting, the single-point part and the `+180` endpoint. When a Turf upgrade changes any of them, a test fails and tells you which of our workarounds to revisit.

Use `arbPosition` (whole globe) by default. Switch to `arbSafePosition` only for models that are known to break at the poles or the antimeridian, and write a separate test that documents that limit.

## Exercises and bookmarks

1. **Range rings.** Write `rangeRings(station, kms)` returning a FeatureCollection. Property: every ring contains the station and every vertex of the smaller rings.
2. **Closest point of approach.** For two AIS vessels with SOG and COG, project both positions every minute for 30 minutes with `destination()` and return the minimum distance and when it occurs. Test it with two vessels on a collision course.
3. **Entry and exit events.** From a sequence of positions for one MMSI, emit `enter` and `exit` events for the anchorage zone. Test with a track that crosses the cable-area hole.
4. **Geofence across ±180.** Make `featuresInZone` work for a zone that crosses the antimeridian. Write the failing test first (the coverage recipe in §04 shows the problem).
5. **Three stations.** Cross-fix three DF bearings pairwise and return the centroid of the triangle plus its area as an error estimate (`centroid`, `area`).
6. **Simplify a track.** Simplify a long ADS-B track for display with `simplify`. Property: every original sample is within the tolerance of the simplified line. Watch the units: `tolerance` is in degrees.

### Bookmarks

- Turf API reference (every function, with live examples): [turfjs.org](https://turfjs.org/)
- Units Turf accepts: [turfjs.org/docs/api/types/Units](https://turfjs.org/docs/api/types/Units)
- Turf releases (breaking changes per version): [github.com/Turfjs/turf/releases](https://github.com/Turfjs/turf/releases)
- RFC 7946, GeoJSON (§3.1.6 winding, §3.1.9 antimeridian cutting): [datatracker.ietf.org/doc/html/rfc7946](https://datatracker.ietf.org/doc/html/rfc7946)
- The formulas behind distance, bearing and destination: [movable-type.co.uk/scripts/latlong.html](https://www.movable-type.co.uk/scripts/latlong.html)
- Spatial indexes: [github.com/mourner/rbush](https://github.com/mourner/rbush), [github.com/mourner/kdbush](https://github.com/mourner/kdbush), [github.com/mourner/geokdbush](https://github.com/mourner/geokdbush)

### Sources

<div class="sources">

- Signatures, defaults and units: the installed type definitions, `node_modules/@turf/*/dist/esm/index.d.ts` (Turf 7.4.0)
- Behaviour (antimeridian, poles, planar intersections, precision): demonstrated by `docs/examples/turf/*.test.ts`, which run in `npm test`
- Turf 6 → 7 changes: Turf changelog, 7.0.0 — [github.com/Turfjs/turf/blob/master/CHANGELOG.md](https://github.com/Turfjs/turf/blob/master/CHANGELOG.md)
- `nearestPointOnLine` property names: the deprecation notes in `node_modules/@turf/nearest-point-on-line/dist/esm/index.d.ts`
- geokdbush features: its README — [github.com/mourner/geokdbush](https://github.com/mourner/geokdbush)

</div>
