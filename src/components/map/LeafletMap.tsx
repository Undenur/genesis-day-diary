/** Обёртка Leaflet + OpenStreetMap с атрибуцией. Сообщает, если сетевые тайлы недоступны. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

interface Props {
  center: [number, number];
  zoom: number;
  onReady: (map: L.Map) => void | (() => void);
  onTilesFailed?: () => void;
  className?: string;
  label: string;
}

export function LeafletMap({ center, zoom, onReady, onTilesFailed, className = '', label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView(center, zoom);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    let errors = 0;
    let loaded = 0;
    // Сеть может «зависнуть» без ошибок — через 10 с без единого тайла показываем список мест.
    const timer = setTimeout(() => loaded === 0 && onTilesFailed?.(), 10000);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">участники OpenStreetMap</a>',
    })
      .on('tileerror', () => {
        errors++;
        if (errors >= 4 && loaded === 0) onTilesFailed?.();
      })
      .on('tileload', () => loaded++)
      .addTo(map);
    const cleanup = onReady(map);
    return () => {
      clearTimeout(timer);
      if (typeof cleanup === 'function') cleanup();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // isolate: внутренние z-index Leaflet не перекрывают диалоги приложения.
  return <div ref={ref} className={`isolate ${className}`} role="application" aria-label={label} />;
}

export function pinIcon(count = 1, active = false) {
  return L.divIcon({
    className: '',
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    html: `<div style="display:grid;place-items:center;width:40px;height:40px;border-radius:20px 20px 20px 4px;transform:rotate(-45deg);background:${active ? '#EDF2FA' : '#91A9D1'};border:2px solid #101827;box-shadow:0 4px 14px rgba(0,0,0,.45)"><span style="transform:rotate(45deg);font:600 14px Inter,system-ui;color:#101827">${count}</span></div>`,
  });
}
