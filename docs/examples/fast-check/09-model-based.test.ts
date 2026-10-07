/**
 * fast-check guide §09: model-based testing with fc.commands.
 * fast-check generates sequences of operations, runs them against the real store and a much
 * simpler model, and checks after every step that the two agree.
 */
import { expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { AisPositionReport } from '../../../src/geo/ais';
import { round6 } from '../../../src/geo/factories';
import { arbAisReport } from '../../../test/arbitraries';
import { expectValidGeoJSON } from '../../../test/helpers';
import { LiveFeedStore } from './live-feed-store';

const MAX_AGE_MS = 10 * 60_000;
const T0 = Date.UTC(2026, 9, 6, 19, 0, 0);

// #region model
/** The model: just "MMSI -> time and position of the newest kept report". */
type Contact = { t: number; lng: number; lat: number };
type Model = { contacts: Map<number, Contact> };
type Real = LiveFeedStore;

const hasPosition = (r: AisPositionReport) =>
  r.lat !== 91 && r.lon !== 181 && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180;

/** After every command the store must hold exactly the model's contacts. */
function expectSameState(m: Model, r: Real) {
  expect(r.size).toBe(m.contacts.size);
  for (const [mmsi, c] of m.contacts) {
    const f = r.get(mmsi)!;
    expect(Date.parse(f.properties.timestamp)).toBe(c.t);
    expect(f.geometry.coordinates).toEqual([round6(c.lng), round6(c.lat)]);
  }
}
// #endregion

// #region commands
class IngestCommand implements fc.Command<Model, Real> {
  constructor(readonly report: AisPositionReport) {}
  check = () => true; // always allowed
  run(m: Model, r: Real) {
    const { mmsi, lon, lat, timestamp } = this.report;
    const t = Date.parse(timestamp);
    const prev = m.contacts.get(mmsi);
    if (hasPosition(this.report) && (prev === undefined || t >= prev.t)) {
      m.contacts.set(mmsi, { t, lng: lon, lat }); // a newer or equally new report wins
    }
    r.ingest(this.report);
    expectSameState(m, r);
  }
  toString = () => `ingest(${this.report.mmsi} @ ${this.report.timestamp})`;
}

class ExpireCommand implements fc.Command<Model, Real> {
  constructor(readonly nowMs: number) {}
  check = () => true;
  run(m: Model, r: Real) {
    for (const [mmsi, c] of m.contacts) {
      if (this.nowMs - c.t > MAX_AGE_MS) m.contacts.delete(mmsi);
    }
    r.expire(this.nowMs);
    expectSameState(m, r);
    expectValidGeoJSON(r.toCollection());
  }
  toString = () => `expire(T0 + ${(this.nowMs - T0) / 60_000} min)`;
}
// #endregion

// #region run
// Few MMSIs and a short time window, so reports for the same vessel collide and overtake.
const arbMinutes = fc.integer({ min: 0, max: 60 });
const arbReport = fc
  .tuple(arbAisReport, fc.constantFrom(211_000_001, 211_000_002, 211_000_003), arbMinutes)
  .map(([r, mmsi, min]): AisPositionReport => ({
    ...r,
    mmsi,
    timestamp: new Date(T0 + min * 60_000).toISOString(),
  }));

const arbCommands = fc.commands(
  [
    arbReport.map((r) => new IngestCommand(r)),
    arbMinutes.map((min) => new ExpireCommand(T0 + min * 60_000)),
  ],
  { maxCommands: 50 },
);

const setup = (real: LiveFeedStore) => () => ({ model: { contacts: new Map() }, real });

test.prop([arbCommands])('LiveFeedStore behaves like the model', (cmds) => {
  fc.modelRun(setup(new LiveFeedStore(MAX_AGE_MS)), cmds);
});
// #endregion

// #region catches
/** A store with an off-by-one: it expires contacts that are exactly MAX_AGE_MS old. */
class OffByOneStore extends LiveFeedStore {
  override expire(nowMs: number): void {
    for (const [mmsi, f] of this.latest) {
      if (nowMs - Date.parse(f.properties.timestamp) >= MAX_AGE_MS) this.latest.delete(mmsi);
    }
  }
}

it('finds the off-by-one and shrinks it to two commands', () => {
  const details = fc.check(
    fc.property(arbCommands, (cmds) => {
      fc.modelRun(setup(new OffByOneStore(MAX_AGE_MS)), cmds);
    }),
    { seed: 9 },
  );
  // A report at 19:17 and an expiry exactly 10 minutes later: the boundary case.
  expect(String(details.counterexample![0])).toBe(
    'ingest(211000001 @ 2026-10-06T19:17:00.000Z),expire(T0 + 27 min) /*replayPath="DCW:F"*/',
  );
});
// #endregion
