/** Контекст по желанию: погода, категория, сезон, место. Координаты — только по кнопке «Текущее место» или вручную на карте. */
import { CloudFog, CloudRain, CloudSun, LocateFixed, MapPin, Snowflake, Sun, Wind, X, Zap } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { Category, MemoryInput, Season, Weather } from '../../lib/types';
import { CATEGORY_LABEL, SEASON_LABEL, seasonFromDate, uuid } from '../../lib/util';
import { useOnline } from '../../hooks/useReducedMotion';
import { Button, Chip, Field, Sheet, Spinner, inputCls } from '../ui';
import { SeasonIcon } from '../SeasonIcon';

const MapPicker = lazy(() => import('../map/MapPicker'));

const WEATHER: { v: Weather; label: string; icon: typeof Sun }[] = [
  { v: 'sun', label: 'Солнечно', icon: Sun },
  { v: 'cloud', label: 'Облачно', icon: CloudSun },
  { v: 'rain', label: 'Дождь', icon: CloudRain },
  { v: 'snow', label: 'Снег', icon: Snowflake },
  { v: 'fog', label: 'Туман', icon: CloudFog },
  { v: 'wind', label: 'Ветер', icon: Wind },
  { v: 'storm', label: 'Гроза', icon: Zap },
];

interface Props {
  input: MemoryInput;
  onChange: (patch: Partial<MemoryInput>) => void;
}

export function ContextField({ input, onChange }: Props) {
  const [geo, setGeo] = useState<'idle' | 'asking' | 'denied' | 'error'>('idle');
  const [picker, setPicker] = useState(false);
  const online = useOnline();
  const place = input.place;
  const auto = seasonFromDate(input.date);

  const setPlace = (patch: Partial<NonNullable<MemoryInput['place']>>) => onChange({ place: { id: place?.id ?? uuid(), name: place?.name ?? '', ...place, ...patch } });

  const locate = () => {
    if (!navigator.geolocation) {
      setGeo('error');
      return;
    }
    setGeo('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlace({ lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5 });
        setGeo('idle');
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="Погода">
        <div className="flex flex-wrap gap-2">
          {WEATHER.map((w) => (
            <Chip key={w.v} icon={w.icon} active={input.weather === w.v} onClick={() => onChange({ weather: input.weather === w.v ? '' : w.v })}>
              {w.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Категория" hint="Если не выбрать — определю по тексту">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <Chip key={c} active={input.category === c} onClick={() => onChange({ category: input.category === c ? '' : c })}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Сезон" hint={input.seasonManual ? 'Выбран вручную' : `Определён по дате: ${SEASON_LABEL[auto].toLowerCase()}`}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SEASON_LABEL) as Season[]).map((s) => (
            <Chip key={s} active={input.season === s} onClick={() => onChange({ season: s, seasonManual: s !== auto })}>
              <SeasonIcon season={s} size={16} /> {SEASON_LABEL[s]}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Место" htmlFor="place-name" hint="Добровольно. Название видно в истории, координаты — только на вашей карте.">
        <input id="place-name" className={inputCls} placeholder="Например, кофейня у вокзала" value={place?.name ?? ''} onChange={(e) => (e.target.value || place?.lat ? setPlace({ name: e.target.value }) : onChange({ place: null }))} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" icon={LocateFixed} onClick={locate} disabled={geo === 'asking'}>
          {geo === 'asking' ? 'Определяю…' : 'Текущее место'}
        </Button>
        <Button size="sm" variant="outline" icon={MapPin} onClick={() => setPicker(true)} disabled={!online}>
          Указать на карте
        </Button>
        {place?.lat != null && (
          <Button size="sm" variant="ghost" icon={X} onClick={() => setPlace({ lat: undefined, lng: undefined })}>
            Убрать точку
          </Button>
        )}
      </div>
      {place?.lat != null && (
        <p className="text-[13px] text-ok">
          ✓ Точка: {place.lat.toFixed(4)}, {place.lng?.toFixed(4)}
        </p>
      )}
      {!online && <p className="text-[13px] text-muted">Без сети карта недоступна — можно указать только название места.</p>}
      {geo === 'denied' && <p role="alert" className="text-[13px] text-warn">Доступ к геолокации запрещён. Укажите место вручную или пропустите — день сохранится.</p>}
      {geo === 'error' && <p role="alert" className="text-[13px] text-warn">Не удалось определить место. Попробуйте карту или пропустите шаг.</p>}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Точка на карте" wide>
        <Suspense fallback={<Spinner label="Загружаю карту…" />}>
          <MapPicker
            value={place?.lat != null && place.lng != null ? [place.lat, place.lng] : null}
            onPick={(lat, lng) => setPlace({ lat, lng })}
          />
        </Suspense>
        <Button variant="primary" block className="mt-3" onClick={() => setPicker(false)}>
          Готово
        </Button>
      </Sheet>
    </div>
  );
}
