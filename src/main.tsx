import './map/maplibre-setup'; // must run before any map is created (v6 worker URL)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css'; // forget this and controls/popups look broken
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
