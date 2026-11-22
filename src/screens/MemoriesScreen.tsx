/** «Дни»: Архив, Хронология и Музыка. Вкладка, фильтры и прокрутка сохраняются при возврате из дня. */
import { ArrowDownUp, ChevronRight, EighthNotes, GitCommitVertical, ListFilter, Play, Search, SearchX, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Page } from '../components/Layout';
import { Cover, MemoryTile, SoundToggle } from '../components/MemoryCard';
import { Button, Chip, EmptyState, Segmented, inputCls } from '../components/ui';
import { searchMemories, songLibrary } from '../lib/queries';
import type { Category, Memory } from '../lib/types';
import { CATEGORY_LABEL, MONTHS_NOM, formatDate, parseISODate, plural } from '../lib/util';
import { useData } from '../store/data';
import { useUi, type MemoriesTab } from '../store/ui';

export function MemoriesScreen() {
  const { memoriesTab, setTab, scroll, saveScroll } = useUi();

  // Восстановление прокрутки для каждой вкладки
  useLayoutEffect(() => {
    window.scrollTo(0, scroll[memoriesTab] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoriesTab]);
  useEffect(() => {
    const onScroll = () => saveScroll(memoriesTab, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [memoriesTab, saveScroll]);

  return (
    <Page wide>
      <div className="sticky top-0 z-20 -mx-5 bg-night/95 px-5 pb-3 pt-[max(16px,var(--safe-top))] backdrop-blur-md">
        <h1 className="mb-3 text-[26px] font-semibold">Дни</h1>
        <Segmented<MemoriesTab>
          label="Представление"
          value={memoriesTab}
          onChange={setTab}
          options={[
            { value: 'archive', label: 'Архив', icon: Search },
            { value: 'timeline', label: 'Хронология', icon: GitCommitVertical },
            { value: 'music', label: 'Музыка', icon: EighthNotes },
          ]}
        />
      </div>
      <div className="mt-3">
        {memoriesTab === 'archive' && <Archive />}
        {memoriesTab === 'timeline' && <Timeline />}
        {memoriesTab === 'music' && <Music />}
      </div>
    </Page>
  );
}

function Archive() {
  const memories = useData((s) => s.memories);
  const { archive: f, setArchive } = useUi();
  const years = useMemo(() => [...new Set(memories.map((m) => m.date.slice(0, 4)))].sort().reverse(), [memories]);
  const list = useMemo(() => searchMemories(memories, f), [memories, f]);
  const selected = list.find((m) => m.id === f.selectedId) ?? list[0];
  const filtered = f.q || f.year || f.month;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
      <div>
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Поиск по названию, тексту, месту, песне, месяцу или сезону"
            placeholder="Фраза, место, песня, «зима», «июль»…"
            className={`${inputCls} pl-12 pr-12`}
            value={f.q}
            onChange={(e) => setArchive({ q: e.target.value })}
          />
          {f.q && (
            <button type="button" aria-label="Очистить поиск" className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted" onClick={() => setArchive({ q: '' })}>
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <ListFilter size={20} className="shrink-0 text-muted" aria-hidden="true" />
          <select aria-label="Год" className="min-h-10 rounded-full border border-line bg-card px-3 text-[14px]" value={f.year} onChange={(e) => setArchive({ year: e.target.value })}>
            <option value="">Все годы</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select aria-label="Месяц" className="min-h-10 rounded-full border border-line bg-card px-3 text-[14px]" value={f.month} onChange={(e) => setArchive({ month: e.target.value })}>
            <option value="">Все месяцы</option>
            {MONTHS_NOM.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
          <Chip icon={ArrowDownUp} onClick={() => setArchive({ sort: f.sort === 'new' ? 'old' : 'new' })}>
            {f.sort === 'new' ? 'Сначала новые' : 'Сначала старые'}
          </Chip>
        </div>
        <p className="mt-2 text-[13px] text-muted" aria-live="polite">
          {list.length} {plural(list.length, ['день', 'дня', 'дней'])}
        </p>

        {list.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((m) => (
              <li key={m.id}>
                <span className="lg:hidden">
                  <MemoryTile m={m} />
                </span>
                <span className="hidden lg:block">
                  <MemoryTile m={m} selected={selected?.id === m.id} onSelect={() => setArchive({ selectedId: m.id })} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={SearchX}
              title={filtered ? 'Ничего не нашлось' : 'Архив пока пуст'}
              text={filtered ? 'Попробуйте другую фразу, месяц или сезон.' : 'Создайте первый день — он появится здесь.'}
              action={filtered ? <Button variant="outline" onClick={() => setArchive({ q: '', year: '', month: '' })}>Сбросить фильтры</Button> : undefined}
            />
          </div>
        )}
      </div>
      {/* Предпросмотр на широком экране */}
      <aside className="hidden lg:block">{selected && <PreviewPanel m={selected} />}</aside>
    </div>
  );
}

function PreviewPanel({ m }: { m: Memory }) {
  return (
    <div className="sticky top-36 rounded-[22px] bg-card p-4">
      <Cover m={m} thumb={false} className="aspect-[4/5] w-full rounded-[18px]" />
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{formatDate(m.date)}</p>
      <h2 className="font-title mt-1 text-[22px] leading-tight">{m.title}</h2>
      <p className="mt-2 line-clamp-4 font-serif text-[15px] leading-relaxed text-muted">{m.text}</p>
      <div className="mt-4 flex gap-2">
        <Link to={`/m/${m.id}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-night">
          <Play size={18} fill="currentColor" aria-hidden="true" /> Открыть RE:LIVE
        </Link>
        <SoundToggle m={m} tone="card" />
      </div>
    </div>
  );
}

function Timeline() {
  const memories = useData((s) => s.memories);
  const { timelineCat, setTimelineCat } = useUi();
  const list = memories.filter((m) => timelineCat === 'all' || m.category === timelineCat).sort((a, b) => b.date.localeCompare(a.date));
  const groups: { year: string; months: { month: number; items: Memory[] }[] }[] = [];
  for (const m of list) {
    const y = m.date.slice(0, 4);
    const mo = parseISODate(m.date).getMonth();
    let g = groups.find((x) => x.year === y);
    if (!g) groups.push((g = { year: y, months: [] }));
    let mg = g.months.find((x) => x.month === mo);
    if (!mg) g.months.push((mg = { month: mo, items: [] }));
    mg.items.push(m);
  }
  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar" role="group" aria-label="Фильтр по категории">
        <Chip active={timelineCat === 'all'} onClick={() => setTimelineCat('all')}>
          Все
        </Chip>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
          <Chip key={c} active={timelineCat === c} onClick={() => setTimelineCat(c)}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </div>
      {!list.length && <div className="mt-4"><EmptyState icon={GitCommitVertical} title="В этой категории пока нет дней" action={<Button variant="outline" onClick={() => setTimelineCat('all')}>Показать все</Button>} /></div>}
      <ol className="relative mt-4 border-l-2 border-line pl-6">
        {groups.map((g) => (
          <li key={g.year} className="mb-6">
            <h2 className="font-title -ml-[35px] mb-3 flex items-center gap-3 text-[24px]">
              <span className="h-4 w-4 rounded-full border-2 border-accent bg-night" aria-hidden="true" />
              {g.year}
            </h2>
            <ol>
              {g.months.map((mg) => (
                <li key={mg.month} className="mb-4">
                  <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{MONTHS_NOM[mg.month]}</h3>
                  <ol className="flex flex-col gap-2">
                    {mg.items.map((m) => (
                      <li key={m.id} className="relative">
                        <span className="absolute -left-[31px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-accent" aria-hidden="true" />
                        <Link to={`/m/${m.id}`} className="flex items-center gap-3 rounded-[16px] bg-card p-2 pr-3 hover:bg-raised">
                          <Cover m={m} className="h-14 w-14 shrink-0 rounded-xl" />
                          <span className="min-w-0 flex-1">
                            <span className="font-title block truncate text-[16px]">{m.title}</span>
                            <span className="block text-[13px] text-muted">
                              {formatDate(m.date, false)} · {CATEGORY_LABEL[m.category]}
                            </span>
                          </span>
                          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Music() {
  const memories = useData((s) => s.memories);
  const { music, setMusic } = useUi();
  const lib = useMemo(() => songLibrary(memories), [memories]);
  const years = [...new Set(lib.map((s) => s.year).filter(Boolean))].sort().reverse() as number[];
  const q = music.q.toLowerCase();
  const list = lib.filter((s) => (!music.year || String(s.year) === music.year) && (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)));
  return (
    <div className="max-w-2xl">
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
        <EighthNotes size={20} className="text-accent" aria-hidden="true" /> My Soundtrack
      </h2>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" aria-label="Поиск песни" placeholder="Название или исполнитель" className={`${inputCls} pl-11`} value={music.q} onChange={(e) => setMusic({ q: e.target.value })} />
        </div>
        <select aria-label="Год песни" className="rounded-2xl border border-line bg-card px-3 text-[14px]" value={music.year} onChange={(e) => setMusic({ year: e.target.value })}>
          <option value="">Все годы</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {list.length ? (
        <ul className="mt-4 flex flex-col gap-2">
          {list.map((s) => (
            <li key={s.key}>
              <Link to={`/song/${s.key}`} className="flex items-center gap-3 rounded-[18px] bg-card p-2.5 pr-3 hover:bg-raised">
                <Cover m={s.memories[0]} className="h-16 w-16 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{s.title}</span>
                  <span className="block truncate text-[13px] text-muted">{s.artist || 'Исполнитель не указан'}</span>
                  <span className="block text-[12px] text-muted">
                    {[s.year, s.bpm ? `${s.bpm} BPM` : null, `${s.memories.length} ${plural(s.memories.length, ['день', 'дня', 'дней'])}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <SoundToggle m={s.memories[0]} tone="card" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState icon={EighthNotes} title={lib.length ? 'Песня не найдена' : 'Песен пока нет'} action={lib.length ? <Button variant="outline" onClick={() => setMusic({ q: '', year: '' })}>Сбросить фильтры</Button> : undefined} />
        </div>
      )}
    </div>
  );
}
