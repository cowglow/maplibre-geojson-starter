/**
 * fast-check guide §03: the building blocks, in our domain's terms.
 */
import { expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';

// #region building-blocks
const arbMmsi = fc.integer({ min: 200_000_000, max: 799_999_999 });
const arbLat = fc.double({ min: -90, max: 90, noNaN: true }); // finite bounds: no ±Infinity
const arbHeadingNA = fc.constant(511); // AIS "heading not available"
const arbMode = fc.constantFrom('FT8', 'CW', 'SSB', 'WSPR');

// oneof: pick one arbitrary per value; weights set how often (here 9 : 1)
const arbHeading = fc.oneof(
  { weight: 9, arbitrary: fc.integer({ min: 0, max: 359 }) },
  { weight: 1, arbitrary: arbHeadingNA },
);

const arbPosition = fc.tuple(fc.double({ min: -180, max: 180, noNaN: true }), arbLat);
const arbSquawk = fc.option(fc.stringMatching(/^[0-7]{4}$/), { nil: undefined }); // or absent

// map: transform each value (and shrinking still works)
const arbIcao24 = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => n.toString(16).padStart(6, '0'));

// filter: reject values; fine when few are rejected
const arbMovingSog = fc.double({ min: 0, max: 102.2, noNaN: true }).filter((kn) => kn >= 0.5);

// record: only `hex` is always present, the other keys may be missing
const arbAircraft = fc.record(
  { hex: arbIcao24, lat: arbLat, squawk: arbSquawk },
  { requiredKeys: ['hex'] },
);

// array: between 0 and 30 positions
const arbTrack = fc.array(arbPosition, { maxLength: 30 });

// chain: the second arbitrary depends on a generated value.
// First a fleet of 1-5 MMSIs, then reports that only use those MMSIs (so they collide).
const arbFleetReports = fc
  .uniqueArray(arbMmsi, { minLength: 1, maxLength: 5 })
  .chain((fleet) =>
    fc.array(fc.record({ mmsi: fc.constantFrom(...fleet), heading: arbHeading })),
  );
// #endregion

test.prop([arbMmsi, arbLat, arbMode, arbHeading, arbPosition, arbIcao24, arbMovingSog])(
  'scalar building blocks generate what they promise',
  (mmsi, lat, mode, heading, [lng, lat2], icao24, sog) => {
    expect(String(mmsi)).toHaveLength(9);
    expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    expect(['FT8', 'CW', 'SSB', 'WSPR']).toContain(mode);
    expect(heading === 511 || (heading >= 0 && heading <= 359)).toBe(true);
    expect(Math.abs(lng!)).toBeLessThanOrEqual(180);
    expect(Math.abs(lat2!)).toBeLessThanOrEqual(90);
    expect(icao24).toMatch(/^[0-9a-f]{6}$/);
    expect(sog).toBeGreaterThanOrEqual(0.5);
  },
);

test.prop([arbAircraft, arbTrack, arbFleetReports])(
  'structural building blocks generate what they promise',
  (aircraft, track, reports) => {
    expect(aircraft.hex).toMatch(/^[0-9a-f]{6}$/);
    if (aircraft.squawk !== undefined) expect(aircraft.squawk).toMatch(/^[0-7]{4}$/);
    expect(track.length).toBeLessThanOrEqual(30);
    expect(new Set(reports.map((r) => r.mmsi)).size).toBeLessThanOrEqual(5);
  },
);
