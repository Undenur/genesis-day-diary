/** Сохранённый день: RE:LIVE + дата, исходный текст, оригиналы, песня, голос, правка, обмен и удаление. */
import { CalendarClock, Download, ExternalLink, Info, Lock, MapPin, Pencil, Share, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Player } from '../components/relive/Player';
import { SeasonIcon } from '../components/SeasonIcon';
import { Button, ConfirmDialog, EmptyState, Sheet, Spinner, toast } from '../components/ui';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { CATEGORY_LABEL, SEASON_LABEL, WEATHER_LABEL, formatDate } from '../lib/util';
import { useData } from '../store/data';

export default function MemoryScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { memories, status, removeMemory, countdowns } = useData();
  const m = memories.find((x) => x.id === id);
  const [info, setInfo] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const songUrl = useBlobUrl(m?.song?.fileBlobId);

  if (!m) {
    if (status !== 'ready' && status !== 'error') return <div className="grid min-h-dvh place-items-center"><Spinner label="Открываю день…" /></div>;
    return (
      <div className="mx-auto max-w-md px-5 pt-16">
        <EmptyState icon={Info} title="День не найден" text="Возможно, он был удалён." action={<Button onClick={() => nav('/memories')}>К архиву</Button>} />
      </div>
    );
  }

  const fromEvent = countdowns.find((c) => c.memoryId === m.id);
  // После сохранения «назад» вёл бы в пустой мастер — возвращаемся в архив.
  const fromSave = (location.state as { fromSave?: boolean } | null)?.fromSave;
  const close = () => (window.history.state?.idx > 0 && !fromSave ? nav(-1) : nav('/memories', { replace: !!fromSave }));

  return (
    <>
      <Player
        input={m}
        generation={m.generation}
        onClose={close}
        actions={
          <>
            <Button variant="outline" icon={Info} onClick={() => setInfo(true)} className="flex-1 px-2">
              Подробнее
            </Button>
            <Button variant="secondary" icon={Pencil} onClick={() => nav(`/m/${m.id}/edit`)} className="flex-1 px-2">
              Изменить
            </Button>
            <Button variant="primary" icon={Share} onClick={() => nav(`/share/${m.id}`)} className="flex-1 px-2">
              Поделиться
            </Button>
          </>
        }
        side={<Details m={m} songUrl={songUrl} fromEventTitle={fromEvent?.title} />}
      />
      <Sheet open={info} onClose={() => setInfo(false)} title="О дне" wide>
        <Details m={m} songUrl={songUrl} fromEventTitle={fromEvent?.title} />
        <Button variant="danger" icon={Trash} block className="mt-6" onClick={() => setConfirmDel(true)}>
          Удалить день
        </Button>
      </Sheet>
      <ConfirmDialog
        open={confirmDel}
        title="Удалить день?"
        text={`«${m.title}» будет удалён вместе с фото, песней и голосом. Это нельзя отменить.`}
        confirmLabel="Удалить навсегда"
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          setConfirmDel(false);
          setInfo(false);
          await removeMemory(m.id);
          toast('День удалён', 'ok');
          nav('/memories', { replace: true });
        }}
      />
    </>
  );
}

function Details({ m, songUrl, fromEventTitle }: { m: ReturnType<typeof useData.getState>['memories'][number]; songUrl: string | null; fromEventTitle?: string }) {
  return (
    <div className="flex flex-col gap-5 rounded-[20px] lg:bg-card lg:p-5">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{formatDate(m.date)}</p>
        <h2 className="font-title mt-1 text-[24px] leading-tight">{m.title}</h2>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
          <Lock size={14} aria-hidden="true" /> Личная запись · видна только вам на этом устройстве
        </p>
      </div>
      <ul className="flex flex-wrap gap-2 text-[13px]">
        <li className="rounded-full bg-raised px-3 py-1.5">{CATEGORY_LABEL[m.category]}</li>
        <li className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
          <SeasonIcon season={m.season} size={14} /> {SEASON_LABEL[m.season]}
        </li>
        {m.weather && <li className="rounded-full bg-raised px-3 py-1.5">{WEATHER_LABEL[m.weather]}</li>}
        {m.place?.name && (
          <li>
            <Link to={m.place.lat != null ? `/map?focus=${m.id}` : '/map'} className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
              <MapPin size={14} aria-hidden="true" /> {m.place.name}
            </Link>
          </li>
        )}
        {fromEventTitle && (
          <li className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
            <CalendarClock size={14} aria-hidden="true" /> из события «{fromEventTitle}»
          </li>
        )}
      </ul>
      <section>
        <h3 className="mb-2 text-[14px] font-semibold text-muted">Исходный текст</h3>
        <p className="whitespace-pre-line font-serif text-[16px] leading-relaxed">{m.text}</p>
      </section>
      {m.song && (
        <section className="rounded-2xl bg-night p-4 text-[14px]">
          <h3 className="mb-1 text-[14px] font-semibold text-muted">Песня</h3>
          <p className="font-semibold">{m.song.title || 'Без названия'}</p>
          <p className="text-muted">
            {[m.song.artist, m.song.genre, m.song.year, m.generation.song ? `${m.generation.song.bpm} BPM` : null].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {m.song.url && (
              <a href={m.song.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-accent">
                <ExternalLink size={16} aria-hidden="true" /> Открыть оригинал
              </a>
            )}
            {songUrl && (
              <a href={songUrl} download={m.song.fileName ?? 'track'} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
                <Download size={16} aria-hidden="true" /> Скачать аудио
              </a>
            )}
          </div>
        </section>
      )}
      {m.demo && <p className="text-[12px] text-muted">Демо-день: иллюстрации и трек созданы MOMENTA.</p>}
    </div>
  );
}
