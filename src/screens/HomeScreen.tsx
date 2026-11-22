/**
 * Главная. Первые 15 секунд: личный день — снимок, дата, название и фраза автора — и одно нажатие до истории.
 * Ниже — «Записать сегодняшний день», компактный Countdown, недавние записи и сезонная подборка.
 * Место под обложку зарезервировано заранее, чтобы готовые демо не сдвигали кнопки под пальцем.
 */
import { CalendarClock, CalendarPlus, ChevronRight, History, PenLine, Play, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Page } from '../components/Layout';
import { Wordmark } from '../components/Logo';
import { Cover, MemoryRow, SoundToggle, markCoverForTransition } from '../components/MemoryCard';
import { SeasonIcon } from '../components/SeasonIcon';
import { Button, SectionTitle } from '../components/ui';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { useNow } from '../hooks/useReducedMotion';
import { homeEvent, onThisDay, remaining, yearsAgo } from '../lib/queries';
import type { CountdownEvent, Memory } from '../lib/types';
import { SEASON_LABEL, formatDate, plural, rgba, seasonFromDate, todayISO, typo } from '../lib/util';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';

function greeting(h: number) {
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function HomeScreen() {
  const nav = useNavigate();
  const { memories, countdowns, status } = useData();
  const { name, avatar, hidePrivateOnHome } = useSettings();
  const now = useNow(60000);
  const today = todayISO(new Date(now));
  const otd = onThisDay(memories, today)[0];
  const hero = otd ?? memories[0];
  const ev = homeEvent(countdowns, now);
  const season = seasonFromDate(today);
  const recent = memories.filter((m) => m.id !== hero?.id).slice(0, 3);
  const preparing = !hero && (status === 'idle' || status === 'loading' || status === 'seeding');

  const createBtn = (
    <Button variant="primary" size="lg" icon={PenLine} block onClick={() => nav('/create/relive')}>
      Записать сегодняшний день
    </Button>
  );

  return (
    <Page wide>
      <header className="flex items-center justify-between gap-3 pb-1 pt-[max(14px,var(--safe-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="lg:hidden">
            <Wordmark />
          </span>
          <p className="hidden truncate text-[22px] font-semibold lg:block">
            {greeting(new Date(now).getHours())}, {name}
          </p>
        </div>
        <Link to="/profile" aria-label="Профиль и настройки" className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-raised text-[16px] font-semibold">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </Link>
      </header>
      <p className="mt-1 text-[15px] text-muted lg:hidden">
        {greeting(new Date(now).getHours())}, {name}
      </p>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] lg:items-start lg:gap-8">
        <section aria-label="День для возвращения">
          {hero ? (
            <StoryHero m={hero} label={otd ? `В этот день · ${yearsAgo(otd.date, today)} ${plural(yearsAgo(otd.date, today), ['год', 'года', 'лет'])} назад` : 'Последняя запись'} hidden={hidePrivateOnHome} />
          ) : preparing ? (
            <div className="relative aspect-[4/5] w-full animate-pulse overflow-hidden rounded-[24px] bg-card lg:aspect-[4/3.6]" role="status">
              <p className="absolute inset-x-0 bottom-0 p-6 text-[15px] text-muted">Готовлю первые воспоминания…</p>
            </div>
          ) : (
            <div className="flex aspect-[4/5] w-full flex-col justify-end gap-4 rounded-[24px] border border-dashed border-line p-6 lg:aspect-[4/3.6]">
              <Sparkles size={32} className="text-accent" aria-hidden="true" />
              <h1 className="font-title text-[30px] leading-tight">Первый день, к которому захочется вернуться</h1>
              <p className="text-[15px] text-muted">Пара фраз и один снимок — MOMENTA соберёт из них историю на 15–30 секунд.</p>
              {createBtn}
            </div>
          )}
          {hero && <div className="mt-4 lg:hidden">{createBtn}</div>}
        </section>

        <aside className="mt-6 flex flex-col gap-6 lg:mt-0" aria-label="Недавнее и события">
          {hero && <div className="hidden lg:block">{createBtn}</div>}

          <section aria-labelledby="ev-title">
            <SectionTitle>
              <span id="ev-title" className="flex items-center gap-2">
                <CalendarClock size={20} className="text-accent" aria-hidden="true" /> Countdown
              </span>
            </SectionTitle>
            {ev ? (
              <CountdownRow ev={ev} now={now} />
            ) : (
              <Link to="/countdown/new" className="flex min-h-16 items-center gap-3 rounded-[18px] border border-dashed border-line px-4 py-3 text-[15px] hover:bg-card">
                <CalendarPlus size={22} className="text-accent" aria-hidden="true" />
                <span className="flex-1">Добавить будущее событие</span>
                <ChevronRight size={18} className="text-muted" aria-hidden="true" />
              </Link>
            )}
          </section>

          {otd && hero?.id !== otd.id && (
            <section>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <History size={20} className="text-accent" aria-hidden="true" /> В этот день
                </span>
              </SectionTitle>
              <MemoryRow m={otd} hidePrivate={hidePrivateOnHome} />
            </section>
          )}

          <section>
            <SectionTitle
              action={
                <Link to="/memories" className="flex min-h-11 items-center gap-1 text-[14px] text-accent">
                  Все дни <ChevronRight size={16} aria-hidden="true" />
                </Link>
              }
            >
              Недавние
            </SectionTitle>
            {recent.length ? (
              <ul className="flex flex-col gap-2.5">
                {recent.map((m) => (
                  <li key={m.id}>
                    <MemoryRow m={m} hidePrivate={hidePrivateOnHome} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">{hero ? 'Следующие дни появятся здесь.' : 'Сохранённые дни появятся здесь.'}</p>
            )}
          </section>

          <Link to={`/seasons?s=${season}`} className="flex min-h-16 items-center gap-3 rounded-[18px] bg-card px-4 hover:bg-raised">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-raised text-accent">
              <SeasonIcon season={season} size={22} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">Сезонная подборка: {SEASON_LABEL[season].toLowerCase()}</span>
              <span className="block text-[13px] text-muted">Все времена года из вашего архива</span>
            </span>
            <ChevronRight size={20} className="text-muted" aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </Page>
  );
}

/** Крупная история: фото, дата, название, одна фраза автора и действие «Смотреть». */
function StoryHero({ m, label, hidden }: { m: Memory; label: string; hidden: boolean }) {
  const g = m.generation;
  const opening = g.scenes[0];
  const phrase = g.captions[0] ?? g.scenes[g.scenes.length - 1]?.caption ?? null;
  const shadeColor = opening?.shadeColor ?? '#080A10';
  const shade = Math.max(0.55, opening?.shade ?? 0.6);
  const seconds = Math.round(g.totalMs / 1000);
  const glow = rgba(g.art.glowColor, 0.45 * (g.art.glowRoom ?? 1));

  return (
    <article className="relative" data-vt-scope>
      <Link
        to={`/m/${m.id}`}
        state={{ autoplay: true }}
        viewTransition
        onClick={markCoverForTransition}
        aria-label={hidden ? `Смотреть личную запись от ${formatDate(m.date)}, ${seconds} секунд` : `Смотреть «${m.title}», ${formatDate(m.date)}, ${seconds} секунд`}
        className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[24px] bg-card transition-transform duration-150 active:scale-[0.985] lg:aspect-[4/3.6]"
        style={{ boxShadow: `0 30px 90px -40px ${glow}` }}
      >
        <Cover m={m} thumb={false} eager className={`absolute inset-0 h-full w-full ${hidden ? 'scale-110 blur-xl' : ''}`} />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, ${rgba(shadeColor, shade)} 0%, ${rgba(shadeColor, shade)} 38%, ${rgba(shadeColor, shade * 0.4)} 60%, transparent 82%)` }}
        />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-6">
          <p className="self-start rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">{label}</p>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white">{formatDate(m.date)}</p>
          <h1 className="font-title text-[clamp(28px,8vw,44px)] leading-[1.05] text-white [overflow-wrap:break-word] hyphens-auto">{hidden ? 'Личная запись' : typo(m.title)}</h1>
          {phrase && !hidden && <p className="line-clamp-2 font-serif text-[17px] italic leading-snug text-white">«{typo(phrase)}»</p>}
          <span className="mt-2 inline-flex min-h-12 items-center gap-2 self-start rounded-full bg-white px-5 text-[15px] font-semibold text-night shadow-lg transition-transform group-hover:scale-[1.02]">
            <Play size={18} fill="currentColor" aria-hidden="true" /> Смотреть · {seconds} с
          </span>
        </div>
      </Link>
      <SoundToggle m={m} className="absolute right-3 top-3 z-10" />
    </article>
  );
}

/** Компактный Countdown: крупное число, название и действие в контексте события. */
function CountdownRow({ ev, now }: { ev: CountdownEvent; now: number }) {
  const r = remaining(ev.datetime, now);
  const cover = useBlobUrl(ev.coverBlobId);
  return (
    <article className="flex items-center gap-3 rounded-[18px] bg-card p-2.5 pr-3">
      <Link to={`/countdown/${ev.id}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Событие «${ev.title}»`}>
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-raised">
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-center text-white">
            {r.past ? (
              <span className="text-[20px]" aria-hidden="true">✓</span>
            ) : (
              <span className="font-title text-[26px] leading-none tabular-nums">{r.days}</span>
            )}
          </span>
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 block font-semibold leading-snug [overflow-wrap:break-word]">{ev.title}</span>
          <span className="block text-[13px] text-muted">
            {r.past ? 'Событие состоялось' : `через ${r.days} ${plural(r.days, ['день', 'дня', 'дней'])} · ${formatDate(ev.datetime.slice(0, 10), false)}`}
          </span>
        </span>
      </Link>
      {r.past && !ev.memoryId && (
        <Link to={`/create/relive?from=${ev.id}`} className="shrink-0 rounded-full bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-night">
          Сохранить день
        </Link>
      )}
      {r.past && ev.memoryId && (
        <Link to={`/m/${ev.memoryId}`} className="shrink-0 rounded-full bg-raised px-3.5 py-2.5 text-[13px] font-semibold">
          Открыть
        </Link>
      )}
    </article>
  );
}
