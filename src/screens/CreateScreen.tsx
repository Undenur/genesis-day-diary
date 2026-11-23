/** «Создать»: два явных действия и список событий Countdown. */
import { CalendarClock, ChevronRight, Layers } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '../components/Layout';
import { SectionTitle } from '../components/ui';
import { remaining } from '../lib/queries';
import { formatDate, plural } from '../lib/util';
import { useData } from '../store/data';
import { draftHasContent, useDraft } from '../store/draft';
import { useEffect } from 'react';

export function CreateScreen() {
  const countdowns = useData((s) => s.countdowns);
  const { load, input, loaded } = useDraft();
  useEffect(() => {
    load();
  }, [load]);
  const sorted = [...countdowns].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const hasDraft = loaded && draftHasContent(input);

  return (
    <Page>
      <h1 className="pb-2 pt-[max(20px,var(--safe-top))] text-[26px] font-semibold">Создать</h1>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Link to="/create/relive" className="group relative overflow-hidden rounded-[20px] bg-accent p-5 text-night">
          <Layers size={34} aria-hidden="true" />
          <p className="mt-6 text-[20px] font-semibold">Воспоминание RE:LIVE</p>
          <p className="mt-1 text-[14px] text-night/80">Текст, фото и настроение → история на 15–30 секунд</p>
          {hasDraft && <p className="mt-3 inline-block rounded-full bg-night/15 px-3 py-1 text-[13px] font-semibold">Есть черновик — продолжить</p>}
        </Link>
        <Link to="/countdown/new" className="rounded-[20px] bg-card p-5 hover:bg-raised">
          <CalendarClock size={34} className="text-accent" aria-hidden="true" />
          <p className="mt-6 text-[20px] font-semibold">Будущее событие</p>
          <p className="mt-1 text-[14px] text-muted">Countdown до поездки, концерта или встречи</p>
        </Link>
      </div>

      <section className="mt-8">
        <SectionTitle>События</SectionTitle>
        {sorted.length ? (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => {
              const r = remaining(c.datetime);
              return (
                <li key={c.id}>
                  <Link to={`/countdown/${c.id}`} className="flex min-h-16 items-center gap-3 rounded-[18px] bg-card px-4 py-3 hover:bg-raised">
                    <span className={`w-16 shrink-0 text-center ${r.past ? 'text-ok' : ''}`}>
                      <span className="font-title block text-[26px] leading-none tabular-nums">{r.past ? '✓' : r.days}</span>
                      <span className="text-[11px] text-muted">{r.past ? 'прошло' : plural(r.days, ['день', 'дня', 'дней'])}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.title}</span>
                      <span className="block text-[13px] text-muted">
                        {formatDate(c.datetime.slice(0, 10))} · {c.datetime.slice(11, 16)}
                        {c.memoryId ? ' · есть воспоминание' : ''}
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Пока нет событий.</p>
        )}
      </section>
    </Page>
  );
}
