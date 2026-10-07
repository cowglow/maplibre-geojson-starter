---
title: Property-based testing with fast-check
kicker: TEAM ONBOARDING · OCTOBER 2026
lede: How we test the GeoJSON factories. State what must always be true, let fast-check search for inputs that break it, and pin every bug it finds. All examples come from this repo and run in npm test.
---

## The idea

An example test checks one input that you picked. A **property** is a rule that must hold for every valid input, such as "a normalised bearing is always in [0, 360) and points the same way". fast-check then tries to break it: by default it generates 100 inputs per run.

@snippet docs/examples/fast-check/01-the-idea.test.ts#example-vs-property

The examples document intent. The properties catch the cases nobody wrote down. We keep both. fast-check does four things that a loop over `Math.random()` doesn't:

| Concept | What it means for you |
|---|---|
| Generation | You describe the *shape* of the input with an **arbitrary** (§03). fast-check builds values from it. |
| Bias | Bounds, `0`, `-0` and tiny numbers come up far more often than chance. This is where our bugs were. |
| Shrinking | After a failure, fast-check looks for a *smaller* input that still fails and reports that one. |
| Seeds | Every run comes from one seed. The same seed gives the same inputs, so any failure can be replayed. |

Bias, in numbers: out of 1,000 latitudes from `fc.double({ min: -90, max: 90 })`, the run below contains both bounds, negative zero and values smaller than 1e-300:

@snippet docs/examples/fast-check/01-the-idea.test.ts#bias

Shrinking turns the first failure fast-check stumbled on (here −428) into the simplest one (−1), which is the one you want to debug:

@snippet docs/examples/fast-check/01-the-idea.test.ts#shrinking

## Setup with Vitest

```bash
npm install -D fast-check @fast-check/vitest
```

We use **fast-check 4.10** with **@fast-check/vitest 0.5** on Vitest 5. Import both `test` and `fc` from `@fast-check/vitest`. It re-exports the `fc` it runs with, so the global settings in `test/setup.ts` are the ones `test.prop` uses.

`test.prop` takes the arbitraries either as a tuple (one argument each) or as a record (one named object):

@snippet docs/examples/fast-check/02-setup.test.ts#test-prop

`test.prop` adds the seed to the test name, e.g. `coverage contains its station (with seed=-1359808129)`. That is the seed you need to replay a failure (§06). Inside a normal `it`, use `fc.assert(fc.property(...))`. `fc.pre(condition)` skips the current input instead of failing:

@snippet docs/examples/fast-check/02-setup.test.ts#fc-assert

Parameters go in the second argument. These ones override the global settings for this test only:

@snippet docs/examples/fast-check/02-setup.test.ts#params

Global settings live in `test/setup.ts`, which Vitest loads before every test file, including `docs/examples`:

@snippet test/setup.ts

@snippet vite.config.ts#test-config

| Command | What it does |
|---|---|
| `npm test` | 100 runs per property, a new random seed every time |
| `FC_RUNS=2000 npm test` | Hunt harder before a release or after touching a factory |
| `FC_SEED=<seed> npm test` | Replay a failure exactly. Add `-t "<test name>"` to run just that test |

:::warning
**Upgrading from fast-check 3?** Version 4 changed some defaults. `fc.date()` now generates `Invalid Date` unless you pass `noInvalidDate: true` (this was the v3 default), and `toISOString()` throws on it. `fc.record()` and `fc.dictionary()` may now return objects with a null prototype (pass `noNullPrototype: true` if your code needs `Object.prototype`). `withDeletedKeys` is gone (use `requiredKeys: []`). So are `hexaString`, `stringOf`, `unicodeString`, `asciiString`, `char` and `ascii`; use `fc.string({ unit })` or `.map()` instead.
:::

## Arbitraries

An **arbitrary** (`fc.Arbitrary<T>`) knows how to generate values of type `T`, and how to shrink them. These are the building blocks we use:

| Building block | Generates | Used for |
|---|---|---|
| `fc.integer({ min, max })` | Whole numbers in range, biased toward the bounds and 0 | MMSI, heading, baro rate |
| `fc.double({ min, max, noNaN })` | 64-bit floats, including `-0` and tiny values. NaN unless `noNaN`; ±Infinity unless min and max are finite | lat, lng, SOG |
| `fc.constant(v)` | Always `v` | AIS sentinels: lat 91, heading 511 |
| `fc.constantFrom(a, b, …)` | One of the listed values | modes, call signs, categories |
| `fc.oneof({ weight, arbitrary }, …)` | A value from one of several arbitraries, chosen by weight | 18 real latitudes : 2 sentinels : 1 garbage |
| `fc.record({ … }, { requiredKeys })` | Objects. Keys not in `requiredKeys` may be missing | readsb aircraft (Mode S has no lat/lon) |
| `fc.array(arb, { minLength, maxLength })` | Arrays between the length bounds (`fc.uniqueArray` for no duplicates) | track samples, report batches |
| `fc.tuple(a, b)` | Fixed-length arrays of mixed types | `[lng, lat]` |
| `fc.option(arb, { nil, freq })` | A value or `nil` (`null` by default, about 1 run in 6) | optional squawk |
| `arb.map(f)` | `f(value)`. Shrinks through the source value | ICAO24 hex from an integer |
| `arb.filter(pred)` | Only values that pass; the rest are thrown away | vessels that are moving |
| `arb.chain(f)` | A second arbitrary built from a generated value | a fleet, then reports for that fleet |

The same blocks in code. Every line is checked by `03-arbitraries.test.ts`:

@snippet docs/examples/fast-check/03-arbitraries.test.ts#building-blocks

:::note
**You never write a shrinker.** Everything built from these blocks shrinks, including the results of `map` and `chain`. That is a good reason to build domain values from the blocks (as in §04) instead of generating them with your own random code.
:::

## Writing domain arbitraries

Our arbitraries live in `test/arbitraries.ts`. Every property in the repo uses them, so we only describe "what a real AIS report looks like" once.

**Positions.** Two versions: one covers the whole globe, and one stays away from the poles and the antimeridian for simple geometry models. Use the full one wherever you can, because the edges are where the bugs are:

@snippet test/arbitraries.ts#positions

**AIS, with sentinels.** ITU-R M.1371 encodes "not available" as in-band values (latitude 91, longitude 181, SOG 102.3, COG 360, heading 511). Real feeds also contain values a broken decoder produced. Weighted `oneof` mixes both in at a known rate, so most reports are still realistic:

@snippet test/arbitraries.ts#ais

**ICAO24 hex, built with `map`.** We don't use a string arbitrary with a regex. We generate the 24-bit integer and format it. Every value is then valid by construction, and shrinking heads toward `000000`:

@snippet test/arbitraries.ts#hex

**readsb aircraft.** Only `hex` is always present. Everything else may be missing, which is exactly what `aircraft.json` looks like for a Mode S-only target:

@snippet test/arbitraries.ts#readsb

**Times, tracks and HF spots.** `fc.date().map(toISOString)` gives the same ISO 8601 strings the feeds send. `noInvalidDate` matters in fast-check 4 (see the warning in §02):

@snippet test/arbitraries.ts#time

@snippet test/arbitraries.ts#tracks

@snippet test/arbitraries.ts#hf

**Test the generator too.** If `arbAisReport` never produced latitude 91, every property about sentinels would pass without testing anything. `fc.sample` with a fixed seed lets you check the mix. While exploring, `fc.statistics(arb, classify)` prints the share of each class you define:

@snippet docs/examples/fast-check/04-domain-arbitraries.test.ts#check-the-generator

## Property patterns

Most properties fall into a few patterns. If you can't think of a property, go through this list:

| Pattern | The question it asks | Our example |
|---|---|---|
| Validity | Is the output valid GeoJSON, or `null` exactly when it should be? | `aisToFeature` |
| Preservation | Does the input survive, in `[lng, lat]` order? | `aisToFeature` |
| Counting | Is nothing lost and nothing invented? | `vesselsToCollection` |
| Geometric invariant | Does the shape mean what it should? Turf checks it | `coverageToFeature` |
| Structural rule | Can MapLibre draw it without artefacts? | `hfPathToFeature` |
| Idempotence | Does doing it twice change anything? | `round6` |
| Round-trip | Out and back again: do we get the input? | JSON, bearings |
| Order-independence | Does the order of the input matter? | tracks, vessels |

**Validity.** The most valuable property, and the easiest to write: whatever goes in, the output is valid, or `null` exactly when the input has no position. `hasPosition` is a small helper at the top of the test file that spells out the AIS rules:

@snippet test/ais.test.ts#validity

**Preservation.** Catches swapped coordinates, which a validator can't catch when both values are within ±90:

@snippet test/ais.test.ts#preservation

**Counting.** One feature per MMSI that has a position, no more and no less:

@snippet test/ais.test.ts#counting

**Geometric invariants, with Turf as an independent checker.** `coverageToFeature` *uses* Turf's `circle`. The test checks the result with *different* Turf functions (`booleanPointInPolygon`, `distance`), so it doesn't repeat the implementation:

@snippet test/radio.test.ts#geometric

**Structural rules.** Valid GeoJSON can still draw badly. A segment that spans 180° or more of longitude is drawn across the whole map. `fc.pre` documents the known limit at the poles (§07):

@snippet test/hf.test.ts#antimeridian

**Idempotence.** Rounding something that is already rounded must not change it:

@snippet test/factories.test.ts#idempotence

**Round-trip.** MapLibre serialises source data to its worker, so a feature must survive JSON. Also, a bearing line drawn with `destination()` must give back its bearing:

@snippet docs/examples/fast-check/05-patterns.test.ts#round-trip

**Order-independence.** Feeds arrive out of order, so the result must not depend on the order:

@snippet test/adsb.test.ts#order-independence

@snippet test/ais.test.ts#order-independence

## Reading a failure

A failing property prints a report, followed by `Caused by:` and your own assertion error. This is the report for the wrong `deg % 360` property from §01. `fc.check` returns the same report as a value, so this test pins its first four lines:

@snippet docs/examples/fast-check/06-reading-a-failure.test.ts#report

| Line | What it tells you |
|---|---|
| `failed after 3 tests` | The third generated input failed. A failure after 1 test usually means the property itself is wrong. |
| `seed: 42` | Replays the whole run. `test.prop` also shows it in the test name. |
| `path: "2:1:0:…"` | The failing run (index 2), then each shrink step. Replays straight to the counterexample. |
| `Counterexample: [-1]` | The shrunk input, with one entry per arbitrary. Start debugging here. |
| `Shrunk 9 time(s)` | How far it got from the first failing input. Pass `verbose: true` to list them all. |

**Replay.** Run `FC_SEED=42 npm test -- -t "<name>"` to repeat the whole run. To jump straight to the counterexample, pass `{ seed, path }` as parameters, e.g. `test.prop([arb], { seed: 42, path: '2:1:0:0:0:0:0:0:0:0' })`. Remove them again once the bug is fixed:

@snippet docs/examples/fast-check/06-reading-a-failure.test.ts#replay

**Pin it.** A seed only replays the failure while the arbitraries stay the same. To keep a counterexample for good, add it to `examples`. Those inputs run first, on every run. Our HF regressions as `examples`:

@snippet docs/examples/fast-check/06-reading-a-failure.test.ts#examples

:::note
**`examples` or a separate `it`?** Use `examples` when the counterexample is just another input to the same property. Use a named `it` (what we did in §07) when the case deserves its own name and comment in the test report.
:::

## Case study: what fast-check found

These came up while the repo was being built. Each one is an input nobody would have written as an example. Each is now a regression test.

### 1. A path that ends at +180 after approaching from the west

**Counterexample:** an HF spot from `[-30, 10]` to `[180, 0]`. **Root cause:** −180 and +180 are the same meridian, and Turf's `greatCircle` returns the endpoint as given, at +180, after approaching it from the west. With few points that gives one LineString whose last step goes from about −170.7 to +180. With 64 points (our default) it adds a zero-length part on the far side of the map. Either way, MapLibre draws a line across the whole world:

@snippet docs/examples/fast-check/07-case-study.test.ts#bug-1

**Fix:** move every ±180 point to the side of its neighbour, before splitting:

@snippet src/geo/hf.ts#fn:alignAntimeridian

**Pinned:**

@snippet test/hf.test.ts#regression-endpoint

### 2. A MultiLineString part with a single point

**Counterexample:** a near-antipodal path whose Turf output, flattened, was `[[-174.3, 0], [-177.15, 0], [180, 0]]`. **Root cause:** Turf can return a part with one position, and a LineString needs at least two. That is invalid GeoJSON, and the validity property (`expectValidGeoJSON`) rejects it. Here is a short reproducer we found while writing this guide:

@snippet docs/examples/fast-check/07-case-study.test.ts#bug-2

**Fix and pin:** `splitAtAntimeridian` (below) splits exactly at ±180, interpolating the crossing latitude, and drops degenerate parts:

@snippet test/hf.test.ts#regression-single-point

### 3. Our own fix divided 0 by 0

**Counterexample:** an over-the-pole path with consecutive points on the antimeridian: `[[0, -89.03], [-180, -88.13], [-180, -85.29], [-180, -82.44]]`. **Root cause:** when one point is written as +180 and the next as −180, the code saw an antimeridian crossing of zero width, and the interpolation became 0 / 0. That gave `NaN`, and `NaN` serialises to `null` in JSON. **Fix:** the `bUnwrapped !== a[0]` guard below:

@snippet src/geo/hf.ts#fn:splitAtAntimeridian

@snippet test/hf.test.ts#regression-nan

### Known limits, documented instead of fixed

A great circle over a pole flips longitude by 180° at the pole. Web Mercator stops at about 85°, so the property limits itself to paths it can draw (the `fc.pre` in §05). The limit is pinned so we notice if Turf changes:

@snippet docs/examples/fast-check/07-case-study.test.ts#pole

Coverage circles near ±180 keep a continuous ring (longitudes like 180.3). MapLibre draws that without a seam. The Turf guide covers what this means for point-in-polygon checks.

## Pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Restating the implementation | The test passes and the bug ships, because the test has the same bug | Assert a property of the output, not the formula |
| Too much `filter` / `fc.pre` | Slow runs, or "too many pre-condition failures" | Build the constraint into the arbitrary |
| Comparing floats with `toBe` | Fails on rounding noise | `toBeCloseTo(x, digits)`, i.e. difference < 10<sup>−digits</sup>/2 |
| NaN, ±Infinity, −0 | Surprises in equality and in JSON | `noNaN`, finite `min`/`max`, normalise −0 |
| Slow properties | The suite takes minutes | Fewer runs per test, smaller `maxLength` |
| `return expect(…)` | "Property failed by returning false" although every assertion passed | Use a block body `{ … }`, so nothing is returned |

**Restating the implementation.** If the test computes the expected value the same way the code does, it can only find typos. Describe what is true about the result instead:

@snippet docs/examples/fast-check/08-pitfalls.test.ts#mirror

**filter vs `fc.pre` vs a constrained arbitrary.** All three give unique timestamps. The first two throw away the inputs that don't fit, and with a strict condition most of the runs are wasted. fast-check gives up with "too many pre-condition failures" when too many runs are skipped. The third wastes nothing:

@snippet docs/examples/fast-check/08-pitfalls.test.ts#pre-vs-constrained

**Comparing floats.** `toBeCloseTo(x, 5)` passes when the difference is below 0.000005. Pick the number of digits from the domain: 6 decimal places of a degree is about 10 cm.

@snippet docs/examples/fast-check/08-pitfalls.test.ts#floats

**NaN, Infinity and −0.** `fc.double()` without constraints generates all of them. Real feeds send them too, so include them on purpose (as `arbGarbageNumber` does) rather than by accident:

@snippet docs/examples/fast-check/08-pitfalls.test.ts#special-numbers

**Slow properties.** Each property runs 100 times, so a 20 ms property takes 2 s. Lower `numRuns` for that test (§02), limit `maxLength` on arrays, and set `interruptAfterTimeLimit` if a property has to stop after a fixed time. Run with `FC_RUNS=2000` when you want more coverage, not on every save.

:::warning
**Never return `expect(...)` from a property.** This caused false failures for us. An arrow function with an expression body returns the assertion object. fast-check treats any return value other than `true` or `undefined` as a failure, and reports "Property failed by returning false" even though the assertion passed. TypeScript doesn't catch it, because Vitest types its matchers as returning `void`.
:::

@snippet docs/examples/fast-check/08-pitfalls.test.ts#return-expect

## Advanced: model-based testing

Some code has state: a store that keeps the latest position per MMSI and drops contacts nobody has heard from in 10 minutes. Its bugs show up in *sequences* of operations, such as an expiry exactly 10 minutes after a report, or two reports with the same timestamp. **Model-based testing** generates such sequences. It runs each one on the real code and on a much simpler **model**, and checks after every step that the two agree.

The system under test (`docs/examples/fast-check/live-feed-store.ts`):

@snippet docs/examples/fast-check/live-feed-store.ts#store

The model is a `Map` from MMSI to time and position. Each **command** updates the model, runs the real operation and compares the two. `check` decides whether a command can run in the current state (all of ours always can):

@snippet docs/examples/fast-check/09-model-based.test.ts#model

@snippet docs/examples/fast-check/09-model-based.test.ts#commands

`fc.commands` generates the sequences and shrinks them by removing commands. Keep the pool of MMSIs and times small, so reports collide and overtake each other:

@snippet docs/examples/fast-check/09-model-based.test.ts#run

The off-by-one we would write by accident: a store that expires a contact when it is *exactly* 10 minutes old. fast-check finds it and shrinks the failure to two commands: a report at 19:17 and an expiry at 19:27.

@snippet docs/examples/fast-check/09-model-based.test.ts#catches

To replay a sequence, use the seed and path from the report, and pass the printed `replayPath` to `fc.commands(…, { replayPath })`. Use `fc.asyncModelRun` and `fc.AsyncCommand` when the real system is async.

## Exercises and bookmarks

1. **Bands.** Write properties for `bandForKHz`. Every frequency from 14,000 to 14,350 kHz is `'20m'`, and frequencies between the bands are `'unknown'`. Generate the gaps with `fc.oneof` over ranges, not with `filter`.
2. **Emergencies.** Property: `emergency` is true exactly when the squawk is 7500, 7600 or 7700. `arbReadsbAircraft` almost never generates those codes. Check that with `fc.sample`, then fix it with a weighted `oneof`.
3. **Tracks.** For `adsbTrackToFeature`: `startTime <= endTime`, and `pointCount` is never more than the number of valid samples.
4. **Geofences.** `featuresInZone` returns a subset of its input in the same order, and it is idempotent: applying it to its own output changes nothing.
5. **Break it on purpose.** In `live-feed-store.ts`, change `>=` to `>` in `ingest`. Run the model test, read the counterexample and explain it. Then undo the change.
6. **Time it.** Run `FC_RUNS=5000 npm test`, find the slowest property in the Vitest output, and make it faster without lowering its run count.

### Bookmarks

- fast-check documentation, start here: [fast-check.dev/docs/introduction](https://fast-check.dev/docs/introduction/)
- Every arbitrary, with its options: [fast-check.dev/docs/core-blocks/arbitraries](https://fast-check.dev/docs/core-blocks/arbitraries/)
- Runners and parameters (`numRuns`, `seed`, `path`, `examples`): [fast-check.dev/docs/core-blocks/runners](https://fast-check.dev/docs/core-blocks/runners/)
- Model-based testing: [fast-check.dev/docs/advanced/model-based-testing](https://fast-check.dev/docs/advanced/model-based-testing/)
- Migrating from 3.x to 4.x: [fast-check.dev/docs/migration-guide/from-3.x-to-4.x](https://fast-check.dev/docs/migration-guide/from-3.x-to-4.x/)
- @fast-check/vitest: [github.com/dubzzz/fast-check/tree/main/packages/vitest](https://github.com/dubzzz/fast-check/tree/main/packages/vitest)

### Sources

<div class="sources">

- API details checked against the installed packages: `node_modules/fast-check/lib/fast-check.d.ts` (4.10.2) and `node_modules/@fast-check/vitest/lib/vitest-fast-check.js` (0.5.0)
- fast-check 3 → 4 changes: the migration guide above, and the type definitions of fast-check 3.23.2 compared with 4.10.2
- AIS "not available" values: ITU-R M.1371 — [itu.int/rec/R-REC-M.1371](https://www.itu.int/rec/R-REC-M.1371)
- Vitest `toBeCloseTo` and other matchers — [vitest.dev/api/expect.html](https://vitest.dev/api/expect.html)
- The bugs in §07: this repo's README, section "Bugs fast-check found while building this", and `test/hf.test.ts`

</div>
