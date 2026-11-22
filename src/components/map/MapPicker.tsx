import L from 'leaflet';
import { useRef, useState } from 'react';
import { LeafletMap, pinIcon } from './LeafletMap';

export default function MapPicker({ value, onPick }: { value: [number, number] | null; onPick: (lat: number, lng: number) => void }) {
  const marker = useRef<L.Marker | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <p className="mb-2 text-[14px] text-muted">Нажмите на карту, чтобы поставить точку.</p>
      {failed && <p className="mb-2 text-[13px] text-warn">Тайлы карты не загрузились — проверьте сеть. Точку можно поставить и на пустой карте.</p>}
      <LeafletMap
        label="Карта для выбора места"
        center={value ?? [55.75, 37.62]}
        zoom={value ? 13 : 4}
        className="h-[52dvh] w-full overflow-hidden rounded-2xl"
        onTilesFailed={() => setFailed(true)}
        onReady={(map) => {
          if (value) marker.current = L.marker(value, { icon: pinIcon(1, true) }).addTo(map);
          map.on('click', (e: L.LeafletMouseEvent) => {
            const lat = Math.round(e.latlng.lat * 1e5) / 1e5;
            const lng = Math.round(e.latlng.lng * 1e5) / 1e5;
            if (marker.current) marker.current.setLatLng([lat, lng]);
            else marker.current = L.marker([lat, lng], { icon: pinIcon(1, true) }).addTo(map);
            onPick(lat, lng);
          });
        }}
      />
    </div>
  );
}
