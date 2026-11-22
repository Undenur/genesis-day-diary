/** «Обзор»: быстрые входы в карту, сезоны, Shared Moments и музыку. Обложки — из реальных дней архива. */
import { CalendarClock, EighthNotes, History, MapPin, Share, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '../components/Layout';
import { Cover } from '../components/MemoryCard';
import { SeasonIcon } from '../components/SeasonIcon';
import { SectionTitle } from '../components/ui';
import { bySeason, onThisDay, songLibrary } from '../lib/queries';
import type { Memory, Season } from '../lib/types';
import { SEASON_LABEL, plural } from '../lib/util';
import { useData } from '../store/data';
import { useUi } from '../store/ui';

function Tile({ to, icon: Icon, title, sub, m, onClick }: { to: string; icon: LucideIcon; title: string; sub: string; m?: Memory; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="group relative block min-h-[170px] overflow-hidden rounded-[20px] bg-card">
      {m && <Cover m={m} className="absolute inset-0 h-full w-full opacity-80 transition-opacity group-hover:opacity-100" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b111d] via-[#0b111d]/50 to-transparent" />
      <div className="relative flex h-full min-h-[inherit] flex-col justify-between p-4">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-night/70 text-accent backdrop-blur">
          <Icon size={22} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-[17px] font-semibold text-white">{title}</span>
          <span className="block text-[13px] text-white/75">{sub}</span>
        </span>
      </div>
    </Link>
  );
}

export function ExploreScreen() {
  const memories = useData((s) => s.memories);
  const countdowns = useData((s) => s.countdowns);
  const setTab = useUi((s) => s.setTab);
  const places = memories.filter((m) => m.place?.name);
  const songs = songLibrary(memories);
  const otd = onThisDay(memories);

  return (
    <Page wide>
      <h1 className="pb-2 pt-[max(20px,var(--safe-top))] text-[26px] font-semibold">Обзор</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2">
          <Tile to="/map" icon={MapPin} title="Memory Map" sub={`${places.length} ${plural(places.length, ['место', 'места', 'мест'])} на карте`} m={places.find((m) => m.place?.lat != null) ?? places[0]} />
        </div>
        <Tile to="/shared" icon={Share} title="Shared Moments" sub="Поделиться снова и общие альбомы" m={memories[1] ?? memories[0]} />
        <Tile to="/memories" onClick={() => setTab('music')} icon={EighthNotes} title="My Soundtrack" sub={`${songs.length} ${plural(songs.length, ['песня', 'песни', 'песен'])}`} m={songs[0]?.memories[0]} />
        <Tile to={otd[0] ? `/m/${otd[0].id}` : '/'} icon={History} title="В этот день" sub={otd.length ? `${otd.length} из прошлых лет` : 'Совпадений пока нет'} m={otd[0]} />
        <Tile to="/create" icon={CalendarClock} title="Countdown" sub={`${countdowns.length} ${plural(countdowns.length, ['событие', 'события', 'событий'])}`} />
      </div>

      <section className="mt-8">
        <SectionTitle>Seasonal Memories</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['winter', 'spring', 'summer', 'autumn'] as Season[]).map((s) => {
            const list = bySeason(memories, s);
            return (
              <Link key={s} to={`/seasons?s=${s}`} className="relative block min-h-[130px] overflow-hidden rounded-[20px] bg-card">
                {list[0] && <Cover m={list[0]} className="absolute inset-0 h-full w-full opacity-70" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b111d] to-transparent" />
                <div className="relative flex min-h-[130px] flex-col justify-between p-3.5">
                  <SeasonIcon season={s} size={24} className="text-white" />
                  <span>
                    <span className="block text-[16px] font-semibold text-white">{SEASON_LABEL[s]}</span>
                    <span className="block text-[12px] text-white/75">
                      {list.length} {plural(list.length, ['день', 'дня', 'дней'])}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
