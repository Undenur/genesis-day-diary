/** Song of the Moment: выбранная композиция и все связанные с ней дни. */
import { Download, EighthNotes, ExternalLink } from 'lucide-react';
import { useParams } from 'react-router';
import { Page } from '../components/Layout';
import { Cover, MemoryRow } from '../components/MemoryCard';
import { EmptyState, PageHeader } from '../components/ui';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { songLibrary } from '../lib/queries';
import { plural } from '../lib/util';
import { useData } from '../store/data';

export default function SongScreen() {
  const { key } = useParams();
  const memories = useData((s) => s.memories);
  const entry = songLibrary(memories).find((s) => s.key === encodeURIComponent(decodeURIComponent(key ?? '')) || s.key === key);
  const fileOwner = entry?.memories.find((m) => m.song?.fileBlobId);
  const fileUrl = useBlobUrl(fileOwner?.song?.fileBlobId);

  if (!entry)
    return (
      <Page>
        <PageHeader title="Песня" />
        <EmptyState icon={EighthNotes} title="Песня не найдена" />
      </Page>
    );

  return (
    <Page>
      <PageHeader title="Song of the Moment" />
      <div className="flex items-center gap-4">
        <Cover m={entry.memories[0]} thumb={false} className="h-32 w-32 shrink-0 rounded-[20px]" />
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight">{entry.title}</h1>
          <p className="text-[15px] text-muted">{entry.artist || 'Исполнитель не указан'}</p>
          <p className="mt-1 text-[13px] text-muted">{[entry.year, entry.bpm ? `${entry.bpm} BPM` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {entry.url && (
          <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-line px-4 text-accent">
            <ExternalLink size={18} aria-hidden="true" /> Открыть оригинал
          </a>
        )}
        {fileUrl && (
          <>
            <audio controls src={fileUrl} className="h-11 w-full max-w-sm" aria-label={`Пользовательское аудио «${entry.title}»`} />
            <a href={fileUrl} download={fileOwner?.song?.fileName ?? 'track'} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-line px-4">
              <Download size={18} aria-hidden="true" /> Скачать аудио
            </a>
          </>
        )}
      </div>
      <h2 className="mb-3 mt-8 text-[17px] font-semibold">
        Звучала в {entry.memories.length} {plural(entry.memories.length, ['дне', 'днях', 'днях'])}
      </h2>
      <ul className="flex flex-col gap-2">
        {entry.memories.map((m) => (
          <li key={m.id}>
            <MemoryRow m={m} />
          </li>
        ))}
      </ul>
    </Page>
  );
}
