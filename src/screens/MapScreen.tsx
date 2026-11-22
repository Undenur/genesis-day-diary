/** Memory Map: маркер — сохранённое место; несколько дней в одной точке дают список. Без тайлов — список мест. */
import L from 'leaflet';
import { MapPin, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page } from '../components/Layout';
import { Cover, MemoryRow } from '../components/MemoryCard';
import { LeafletMap, pinIcon } from '../components/map/LeafletMap';
import { EmptyState, PageHeader, Sheet } from '../components/ui';
import { useOnline } from '../hooks/useReducedMotion';
import type { Memory } from '../lib/types';
import { formatDate, plural } from '../lib/util';
import { useData } from '../store/data';

interface Spot {
  key: string;
  name: string;
  lat?: number;
  lng?: number;
  memories: Memory[];
}

export default function MapScreen() {
  const memories = useData((s) => s.memories);
  const online = useOnline();
  const [params] = useSearchParams();
  const [tilesFailed, setTilesFailed] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const spots = useMemo(() => {
    const map = new Map<string, Spot>();
    for (const m of memories) {
      if (!m.place?.name && m.place?.lat == null) continue;
      const p = m.place!;
      const key = p.lat != null && p.lng != null ? `${p.lat.toFixed(3)},${p.lng.toFixed(3)}` : `name:${p.name.toLowerCase()}`;
      const s = map.get(key) ?? { key, name: p.name || 'Без названия', lat: p.lat, lng: p.lng, memories: [] };
      s.memories.push(m);
      map.set(key, s);
    }
    return [...map.values()];
  }, [memories]);

  const geo = spots.filter((s) => s.lat != null);
  const focus = memories.find((m) => m.id === params.get('focus'));
  const center: [number, number] = focus?.place?.lat != null ? [focus.place.lat, focus.place.lng!] : geo[0] ? [geo[0].lat!, geo[0].lng!] : [55.75, 37.62];
  const open = spots.find((s) => s.key === openKey);
  const showMap = online && !tilesFailed && geo.length > 0;

  return (
    <Page wide>
      <PageHeader title="Memory Map" />
      {!spots.length ? (
        <EmptyState icon={MapPin} title="На карте пока пусто" text="Укажите место на шаге «Контекст» при создании дня — по желанию." />
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
          {showMap ? (
            <LeafletMap
              label="Карта воспоминаний"
              center={center}
              zoom={focus ? 12 : geo.length > 1 ? 3 : 10}
              className="h-[58dvh] w-full overflow-hidden rounded-[20px] lg:h-[72dvh]"
              onTilesFailed={() => setTilesFailed(true)}
              onReady={(map) => {
                const markers = geo.map((s) =>
                  L.marker([s.lat!, s.lng!], { icon: pinIcon(s.memories.length), title: s.name, keyboard: true, alt: `${s.name}: ${s.memories.length}` })
                    .on('click', () => setOpenKey(s.key))
                    .addTo(map),
                );
                if (!focus && markers.length > 1) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
              }}
            />
          ) : (
            <p className="mb-3 flex items-center gap-2 rounded-2xl bg-warn/10 px-4 py-3 text-[14px] text-warn" role="status">
              <WifiOff size={18} aria-hidden="true" />
              {online ? 'Тайлы карты не загрузились — показываю список мест.' : 'Нет сети — показываю список сохранённых мест.'}
            </p>
          )}
          <section className="mt-4 lg:mt-0">
            <h2 className="mb-3 text-[17px] font-semibold">Места · {spots.length}</h2>
            <ul className="flex flex-col gap-2">
              {spots.map((s) => (
                <li key={s.key}>
                  <button type="button" onClick={() => setOpenKey(s.key)} className="flex w-full items-center gap-3 rounded-[18px] bg-card p-2.5 text-left hover:bg-raised">
                    <Cover m={s.memories[0]} className="h-14 w-14 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-semibold">
                        <MapPin size={16} className="shrink-0 text-accent" aria-hidden="true" /> {s.name}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {s.memories.length} {plural(s.memories.length, ['день', 'дня', 'дней'])} · {formatDate(s.memories[0].date)}
                        {s.lat == null ? ' · без точки' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpenKey(null)} title={open?.name ?? ''}>
        {open && (
          <>
            {open.memories.length === 1 && <Cover m={open.memories[0]} thumb={false} className="mb-3 aspect-[4/3] w-full rounded-[18px]" />}
            <p className="mb-3 text-[14px] text-muted">
              {open.memories.length} {plural(open.memories.length, ['день', 'дня', 'дней'])} в этом месте
            </p>
            <ul className="flex flex-col gap-2">
              {open.memories.map((m) => (
                <li key={m.id}>
                  <MemoryRow m={m} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </Page>
  );
}
