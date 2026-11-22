/** Карточка Countdown: крупное число — главный смысл; после наступления даты — «Событие состоялось». */
import { CalendarClock, CirclePlus, Play } from 'lucide-react';
import { Link } from 'react-router';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { useNow } from '../hooks/useReducedMotion';
import { remaining } from '../lib/queries';
import type { CountdownEvent } from '../lib/types';
import { formatDate, plural } from '../lib/util';

export function CountdownCard({ ev, large = true }: { ev: CountdownEvent; large?: boolean }) {
  const now = useNow(20000);
  const r = remaining(ev.datetime, now);
  const cover = useBlobUrl(ev.coverBlobId);
  const date = formatDate(ev.datetime.slice(0, 10));
  const time = ev.datetime.slice(11, 16);

  return (
    <article className={`relative overflow-hidden rounded-[20px] bg-card ${large ? 'min-h-[300px]' : 'min-h-[200px]'}`}>
      {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b111d] via-[#0b111d]/55 to-[#0b111d]/10" />
      <Link to={`/countdown/${ev.id}`} className="absolute inset-0" aria-label={`Событие «${ev.title}», открыть и изменить`} />
      <div className="pointer-events-none relative flex h-full min-h-[inherit] flex-col justify-end p-5">
        <p className="mb-auto inline-flex items-center gap-1.5 self-start rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur">
          <CalendarClock size={14} aria-hidden="true" /> Countdown
        </p>
        {!r.past ? (
          <div className="flex items-end gap-3 text-white">
            <span className="font-title text-[76px] leading-[0.85] tabular-nums" aria-hidden="true">
              {r.days}
            </span>
            <span className="pb-1.5 text-[15px] leading-tight">
              {plural(r.days, ['день', 'дня', 'дней'])}
              <br />
              <span className="tabular-nums text-white/80">
                {r.hours} ч {String(r.minutes).padStart(2, '0')} мин
              </span>
            </span>
            <span className="sr-only">
              До события {r.days} {plural(r.days, ['день', 'дня', 'дней'])} {r.hours} ч {r.minutes} мин
            </span>
          </div>
        ) : (
          <p className="text-[15px] font-semibold text-ok">✓ Событие состоялось</p>
        )}
        <h3 className="font-title mt-2 text-[24px] leading-tight text-white">{ev.title}</h3>
        <p className="text-[14px] text-white/80">
          {date} · {time}
        </p>
        {r.past && (
          <div className="pointer-events-auto mt-4">
            {ev.memoryId ? (
              <Link to={`/m/${ev.memoryId}`} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white/90 px-4 font-semibold text-night">
                <Play size={18} fill="currentColor" aria-hidden="true" /> Открыть воспоминание
              </Link>
            ) : (
              <Link to={`/create/relive?from=${ev.id}`} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-accent px-4 font-semibold text-night">
                <CirclePlus size={20} aria-hidden="true" /> Создать воспоминание
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
