/** Seasonal Memories: зима, весна, лето, осень. Начальный сезон — по текущему месяцу. Выбор кадра → Share Again. */
import { Pencil, Share } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Page } from '../components/Layout';
import { MemoryTile } from '../components/MemoryCard';
import { SEASON_ICON, SeasonIcon } from '../components/SeasonIcon';
import { EmptyState, PageHeader } from '../components/ui';
import { bySeason } from '../lib/queries';
import type { Season } from '../lib/types';
import { SEASON_LABEL, seasonFromDate, todayISO } from '../lib/util';
import { useData } from '../store/data';
import { Link } from 'react-router';

export default function SeasonsScreen() {
  const [params, setParams] = useSearchParams();
  const memories = useData((s) => s.memories);
  const current = seasonFromDate(todayISO());
  const s = (params.get('s') as Season) || current;
  const list = bySeason(memories, s);

  return (
    <Page wide>
      <PageHeader title="Seasonal Memories" />
      <div role="tablist" aria-label="Сезон" className="grid grid-cols-4 gap-2">
        {(['winter', 'spring', 'summer', 'autumn'] as Season[]).map((x) => (
          <button
            key={x}
            role="tab"
            type="button"
            aria-selected={x === s}
            onClick={() => setParams({ s: x }, { replace: true })}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[13px] ${x === s ? 'bg-raised font-semibold text-ink ring-2 ring-accent' : 'bg-card text-muted'}`}
          >
            <SeasonIcon season={x} size={22} className={x === s ? 'text-accent' : ''} />
            {SEASON_LABEL[x]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Сейчас {SEASON_LABEL[current].toLowerCase()}. Сезон дня считается по дате; исправить его можно в «Изменить» → «Контекст».
      </p>
      {list.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((m) => (
            <li key={m.id} className="flex flex-col gap-2">
              <MemoryTile m={m} />
              <div className="flex gap-2">
                <Link to={`/share/${m.id}`} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-[14px] font-semibold text-night">
                  <Share size={16} aria-hidden="true" /> Share Again
                </Link>
                <Link to={`/m/${m.id}/edit`} aria-label={`Исправить сезон «${m.title}»`} className="grid h-11 w-11 place-items-center rounded-xl border border-line">
                  <Pencil size={16} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState icon={SEASON_ICON[s]} title={`${SEASON_LABEL[s]}: пока пусто`} text="Дни этого сезона появятся здесь." />
        </div>
      )}
    </Page>
  );
}
