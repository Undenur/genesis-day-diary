/** Главная: знак, приветствие, «Создать воспоминание», ближайшее событие, «В этот день», последние три дня, сезонная подборка. */
import { CalendarPlus, ChevronRight, History, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { CountdownCard } from '../components/CountdownCard';
import { Page } from '../components/Layout';
import { Wordmark } from '../components/Logo';
import { Cover, MemoryRow } from '../components/MemoryCard';
import { SeasonIcon } from '../components/SeasonIcon';
import { Button, EmptyState, SectionTitle } from '../components/ui';
import { useNow } from '../hooks/useReducedMotion';
import { homeEvent, onThisDay, yearsAgo } from '../lib/queries';
import { SEASON_LABEL, formatDate, plural, seasonFromDate, todayISO } from '../lib/util';
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
  const { memories, countdowns } = useData();
  const { name, avatar, hidePrivateOnHome } = useSettings();
  const now = useNow(60000);
  const ev = homeEvent(countdowns, now);
  const today = todayISO(new Date(now));
  const otd = onThisDay(memories, today)[0];
  const season = seasonFromDate(today);

  return (
    <Page>
      <header className="flex items-center justify-between pb-2 pt-[max(16px,var(--safe-top))]">
        <Wordmark />
        <Link to="/profile" aria-label="Профиль и настройки" className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-raised text-[16px] font-semibold">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </Link>
      </header>

      <section className="mt-4">
        <h1 className="text-[26px] font-semibold leading-tight">
          {greeting(new Date(now).getHours())}, {name}
        </h1>
        <p className="mt-1 text-[15px] text-muted">Что из сегодняшнего дня стоит сохранить?</p>
        <Button variant="primary" size="lg" icon={Sparkles} block className="mt-4" onClick={() => nav('/create/relive')}>
          Создать воспоминание
        </Button>
      </section>

      <section className="mt-6">
        {ev ? (
          <CountdownCard ev={ev} />
        ) : (
          <EmptyState
            icon={CalendarPlus}
            title="Нет ближайших событий"
            text="Добавьте поездку, концерт или встречу — MOMENTA посчитает дни, а потом поможет сохранить их."
            action={
              <Button variant="outline" icon={CalendarPlus} onClick={() => nav('/countdown/new')}>
                Добавить событие
              </Button>
            }
          />
        )}
      </section>

      <section className="mt-6" aria-labelledby="otd">
        <SectionTitle>
          <span id="otd" className="flex items-center gap-2">
            <History size={20} className="text-accent" aria-hidden="true" /> В этот день
          </span>
        </SectionTitle>
        {otd ? (
          <Link to={`/m/${otd.id}`} className="flex items-center gap-4 rounded-[20px] bg-card p-3 hover:bg-raised">
            <Cover m={otd} className={`h-24 w-20 shrink-0 rounded-2xl ${hidePrivateOnHome ? 'blur-md' : ''}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-accent">
                {yearsAgo(otd.date, today)} {plural(yearsAgo(otd.date, today), ['год', 'года', 'лет'])} назад · {formatDate(otd.date)}
              </p>
              <p className="font-title mt-1 text-[19px] leading-tight">{hidePrivateOnHome ? 'Личная запись' : otd.title}</p>
              <p className="mt-1 text-[14px] text-muted">Открыть RE:LIVE этого дня</p>
            </div>
            <ChevronRight size={20} className="text-muted" aria-hidden="true" />
          </Link>
        ) : (
          <p className="rounded-[20px] border border-dashed border-line px-4 py-4 text-[14px] text-muted">
            {formatDate(today, false)} в прошлые годы пока нет записей. Сегодняшний день может стать первым.
          </p>
        )}
      </section>

      <section className="mt-6">
        <SectionTitle
          action={
            <Link to="/memories" className="flex min-h-11 items-center gap-1 text-[14px] text-accent">
              Все дни <ChevronRight size={16} aria-hidden="true" />
            </Link>
          }
        >
          Недавние
        </SectionTitle>
        {memories.length ? (
          <ul className="flex flex-col gap-2.5">
            {memories.slice(0, 3).map((m) => (
              <li key={m.id}>
                <MemoryRow m={m} hidePrivate={hidePrivateOnHome} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Сохранённые дни появятся здесь.</p>
        )}
      </section>

      <Link to={`/seasons?s=${season}`} className="mt-6 flex min-h-16 items-center gap-3 rounded-[20px] bg-card px-4 hover:bg-raised">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-raised text-accent">
          <SeasonIcon season={season} size={22} />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">Сезонная подборка: {SEASON_LABEL[season].toLowerCase()}</span>
          <span className="block text-[13px] text-muted">Все времена года из вашего архива</span>
        </span>
        <ChevronRight size={20} className="text-muted" aria-hidden="true" />
      </Link>
    </Page>
  );
}
