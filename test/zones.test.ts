import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { point } from '../src/geo/factories';
import { featuresInZone } from '../src/geo/zones';
import zoneJson from '../src/data/anchorage-zone.geo.json';

const zone = zoneJson as unknown as Feature<Polygon>;

describe('featuresInZone (polygon with a hole)', () => {
  const inside = point(4.0, 51.97, { name: 'inside' });
  const inHole = point(4.025, 51.98, { name: 'in the hole' });
  const outside = point(4.2, 51.97, { name: 'outside' });

  it('includes points inside the zone and excludes points in the hole or outside', () => {
    expect(featuresInZone([inside, inHole, outside], zone).map((f) => f.properties.name)).toEqual(['inside']);
  });
});
