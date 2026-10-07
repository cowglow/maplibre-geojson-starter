import { useState } from 'react';
import { DomainMap } from './examples/DomainMap';
import { SourcePatterns } from './examples/SourcePatterns';
import { StoreMap } from './examples/StoreMap';
import { RawMap } from './examples/RawMap';
import { MapView } from './examples/MapView';

const TABS = {
  domain: { label: 'ADS-B · AIS · Radio · HF', Component: DomainMap },
  patterns: { label: 'GeoJSON Source patterns', Component: SourcePatterns },
  store: { label: 'Store map (guide §5)', Component: StoreMap },
  raw: { label: 'Raw maplibre-gl (guide §6)', Component: RawMap },
  first: { label: 'First map (guide §4)', Component: MapView },
} as const;

type TabKey = keyof typeof TABS;

export function App() {
  const [tab, setTab] = useState<TabKey>('domain');
  const { Component } = TABS[tab];
  return (
    <div className="app">
      <nav className="tabs" aria-label="Examples">
        <h1>MapLibre + GeoJSON starter</h1>
        {(Object.keys(TABS) as TabKey[]).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {TABS[k].label}
          </button>
        ))}
        <a className="tabs-link" href={`${import.meta.env.BASE_URL}guides/`}>
          Guides &amp; tests
        </a>
      </nav>
      <main className="stage">
        <Component key={tab} />
      </main>
    </div>
  );
}
