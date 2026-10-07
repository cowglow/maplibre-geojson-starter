/**
 * Golden tests: run the real sample messages in src/data/raw through the factories
 * and snapshot the GeoJSON. Any change in output shape shows up in code review.
 * After an intentional change: `npm run test:update`.
 */
import { describe, expect, it } from 'vitest';
import * as data from '../src/data/datasets';
import { expectValidGeoJSON } from './helpers';

describe.each([
  ['aircraft (readsb)', data.aircraft],
  ['track', data.track],
  ['vessels (AIS)', data.vessels],
  ['radio (station, coverage, DF)', data.radio],
  ['hf (spots)', data.hf],
])('%s', (_name, fcol) => {
  it('is valid GeoJSON', () => expectValidGeoJSON(fcol));
  it('matches the golden snapshot', () => expect(fcol).toMatchSnapshot());
});

it('drops records without positions from the samples', () => {
  expect(data.aircraft.features).toHaveLength(5); // 6 in the sample, 1 has no lat/lon
  expect(data.vessels.features).toHaveLength(3); // 4 MMSIs, 1 reports lat 91 / lon 181
});
