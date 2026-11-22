/** Shared Moments: локальный Share Again доступен сразу; общие альбомы — облачное расширение (P2). */
import { Cloud, CloudOff, History, Share, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '../components/Layout';
import { Cover } from '../components/MemoryCard';
import { Button, PageHeader, SectionTitle } from '../components/ui';
import { cloudStatus } from '../services/cloud';
import { shareLog } from '../services/share';
import { formatDate } from '../lib/util';
import { useData } from '../store/data';

export default function SharedScreen() {
  const memories = useData((s) => s.memories);
  const log = shareLog();
  const cloud = cloudStatus();

  return (
    <Page wide>
      <PageHeader title="Shared Moments" />
      <section>
        <SectionTitle>Поделиться снова</SectionTitle>
        <ul className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {memories.map((m) => (
            <li key={m.id} className="w-36 shrink-0">
              <Link to={`/share/${m.id}`} className="block">
                <Cover m={m} className="aspect-[4/5] w-full rounded-[18px]" />
                <p className="font-title mt-2 line-clamp-2 text-[14px] leading-tight">{m.title}</p>
                <p className="text-[12px] text-muted">{formatDate(m.date)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-[20px] bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-accent">
            <Users size={22} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 className="text-[17px] font-semibold">Общие альбомы</h2>
            <p className="mt-1 text-[14px] text-muted">
              Владелец создаёт альбом и приглашает участников; участники с разрешением добавляют фото, видео, описание, песню и голос. Владелец отзывает приглашение или исключает участника.
            </p>
            <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] ${cloud.configured ? 'bg-ok/15 text-ok' : 'bg-raised text-ink'}`}>
              {cloud.configured ? <Cloud size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
              {cloud.message}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" disabled title="Нужен подключённый облачный сервис">
                Создать альбом
              </Button>
              <Button variant="outline" disabled title="Нужен подключённый облачный сервис">
                Пригласить участника
              </Button>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">
              Облачные действия включатся при работающем сервисе и после проверки доступа под двумя независимыми аккаунтами. Схема данных и правила доступа — в supabase/migrations.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <History size={20} className="text-accent" aria-hidden="true" /> История отправок
          </span>
        </SectionTitle>
        {log.length ? (
          <ul className="flex flex-col gap-2">
            {log.slice(0, 10).map((e) => {
              const m = memories.find((x) => x.id === e.memoryId);
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-3 text-[14px]">
                  <Share size={18} className="text-muted" aria-hidden="true" />
                  <span className="flex-1">
                    <span className="block font-semibold">{m?.title ?? 'Удалённый день'}</span>
                    <span className="block text-[12.5px] text-muted">
                      {new Date(e.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · {e.method === 'share' ? 'системное меню' : 'PNG'} · {e.items.length} элемента
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Вы ещё ничем не делились.</p>
        )}
      </section>
    </Page>
  );
}
