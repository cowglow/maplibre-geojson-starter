/**
 * Reusable fast-check arbitraries for this project's domain data.
 * The `#region` markers let docs/src/fast-check.md quote these blocks verbatim.
 */
import { fc } from '@fast-check/vitest';
import type { Position } from 'geojson';
import type { AisPositionReport } from '../src/geo/ais';
import type { ReadsbAircraft, TrackSample } from '../src/geo/adsb';
import type { HfSpot } from '../src/geo/hf';

// #region positions
export const arbLng = fc.double({ min: -180, max: 180, noNaN: true });
export const arbLat = fc.double({ min: -90, max: 90, noNaN: true });
export const arbPosition: fc.Arbitrary<Position> = fc.tuple(arbLng, arbLat);

/** Away from the poles and the antimeridian, where simple geometry models behave. */
export const arbSafePosition: fc.Arbitrary<Position> = fc.tuple(
  fc.double({ min: -170, max: 170, noNaN: true }),
  fc.double({ min: -80, max: 80, noNaN: true }),
);

/** Values a broken decoder might emit. */
export const arbGarbageNumber = fc.constantFrom(
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e9, -1e9,
);
// #endregion

// #region time
const arbIsoTime = fc
  .date({
    min: new Date('2020-01-01T00:00:00Z'),
    max: new Date('2030-01-01T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString());
// #endregion

// #region ais
/** AIS report with sentinels mixed in (~10%) and occasional decoder garbage. */
export const arbAisReport: fc.Arbitrary<AisPositionReport> = fc.record({
  mmsi: fc.integer({ min: 200_000_000, max: 799_999_999 }),
  lat: fc.oneof(
    { weight: 18, arbitrary: arbLat },
    { weight: 2, arbitrary: fc.constant(91) }, // "not available"
    { weight: 1, arbitrary: arbGarbageNumber },
  ),
  lon: fc.oneof(
    { weight: 18, arbitrary: arbLng },
    { weight: 2, arbitrary: fc.constant(181) }, // "not available"
    { weight: 1, arbitrary: arbGarbageNumber },
  ),
  sog: fc.oneof(
    { weight: 9, arbitrary: fc.double({ min: 0, max: 102.2, noNaN: true }) },
    { weight: 1, arbitrary: fc.constant(102.3) },
  ),
  cog: fc.oneof(
    { weight: 9, arbitrary: fc.double({ min: 0, max: 359.9, noNaN: true }) },
    { weight: 1, arbitrary: fc.constant(360) },
  ),
  heading: fc.oneof(
    { weight: 9, arbitrary: fc.integer({ min: 0, max: 359 }) },
    { weight: 1, arbitrary: fc.constant(511) },
  ),
  navStatus: fc.integer({ min: 0, max: 15 }),
  name: fc.string({ maxLength: 20 }),
  timestamp: arbIsoTime,
});
// #endregion

// #region hex
/** ICAO24 as lowercase hex, optionally "~"-prefixed (non-ICAO / TIS-B). */
export const arbHex: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 0xffffff }), fc.boolean())
  .map(([n, tilde]) => (tilde ? '~' : '') + n.toString(16).padStart(6, '0'));
// #endregion

// #region readsb
export const arbReadsbAircraft: fc.Arbitrary<ReadsbAircraft> = fc.record(
  {
    hex: arbHex,
    flight: fc.string({ maxLength: 8 }),
    alt_baro: fc.oneof(fc.integer({ min: -1000, max: 50000 }), fc.constant('ground' as const)),
    alt_geom: fc.integer({ min: -1000, max: 51000 }),
    gs: fc.double({ min: 0, max: 700, noNaN: true }),
    track: fc.double({ min: 0, max: 359.99, noNaN: true }),
    baro_rate: fc.integer({ min: -6000, max: 6000 }),
    squawk: fc.integer({ min: 0, max: 0o7777 }).map((n) => n.toString(8).padStart(4, '0')),
    category: fc.constantFrom('A1', 'A3', 'A5', 'A7', 'B2'),
    lat: arbLat,
    lon: arbLng,
    seen: fc.double({ min: 0, max: 300, noNaN: true }),
  },
  // lat/lon may be missing (Mode S only); everything else optional too
  { requiredKeys: ['hex'] },
);
// #endregion

// #region tracks
export const arbTrackSamples: fc.Arbitrary<TrackSample[]> = fc.array(
  fc.record({ lon: arbLng, lat: arbLat, t: arbIsoTime }),
  { minLength: 0, maxLength: 60 },
);
// #endregion

// #region hf
export const arbHfSpot: fc.Arbitrary<HfSpot> = fc.record({
  tx: arbPosition,
  rx: arbPosition,
  txCall: fc.constantFrom('DL1ABC', 'JA1AAA', 'VK2DEF'),
  rxCall: fc.constantFrom('W2XYZ', 'K6BBB', 'ZS1CCC'),
  frequencyKHz: fc.double({ min: 1800, max: 29700, noNaN: true }),
  mode: fc.constantFrom('FT8', 'CW', 'SSB', 'WSPR'),
  snrDb: fc.integer({ min: -30, max: 30 }),
  timestamp: arbIsoTime,
});
// #endregion
