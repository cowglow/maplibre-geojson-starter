/**
 * Example system under test for the model-based testing section (fast-check guide §09):
 * a live AIS feed store that keeps the latest position per MMSI and expires stale contacts.
 */
import type { FeatureCollection, Point } from 'geojson';
import {
  aisToFeature,
  type AisPositionReport,
  type VesselFeature,
  type VesselProps,
} from '../../../src/geo/ais';

// #region store
export class LiveFeedStore {
  protected readonly latest = new Map<number, VesselFeature>();

  constructor(private readonly maxAgeMs: number) {}

  /** Keeps the report if it has a position and is not older than what we have. */
  ingest(report: AisPositionReport): void {
    const f = aisToFeature(report);
    if (!f) return;
    const prev = this.latest.get(f.properties.mmsi);
    if (!prev || f.properties.timestamp >= prev.properties.timestamp) {
      this.latest.set(f.properties.mmsi, f);
    }
  }

  /** Drops contacts whose last report is older than maxAgeMs at `nowMs`. */
  expire(nowMs: number): void {
    for (const [mmsi, f] of this.latest) {
      if (nowMs - Date.parse(f.properties.timestamp) > this.maxAgeMs) this.latest.delete(mmsi);
    }
  }

  get(mmsi: number): VesselFeature | undefined {
    return this.latest.get(mmsi);
  }

  get size(): number {
    return this.latest.size;
  }

  toCollection(): FeatureCollection<Point, VesselProps> {
    return { type: 'FeatureCollection', features: [...this.latest.values()] };
  }
}
// #endregion
