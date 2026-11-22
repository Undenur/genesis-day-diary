/**
 * Плеер RE:LIVE: история 15–30 с, управление без жестов (кнопки и клавиатура),
 * Оригинал / Арт-версия без потери позиции, музыка и голос с раздельной громкостью.
 */
import {
  ChevronLeft, ChevronRight, Contrast, EighthNotes, ExternalLink, Images, Mic, Palette, Pause, Play, Speech, Square, Volume2, VolumeX, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlobUrl, useBlobUrls } from '../../hooks/useBlobUrl';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Generation, MemoryInput } from '../../lib/types';
import { stopAllAudio } from '../../services/audioOwner';
import { resolveMusic } from '../../services/musicSource';
import { speak, stopSpeaking } from '../../services/speech';
import { StoryAudio, type AudioStatus } from '../../services/storyAudio';
import { useSettings } from '../../store/settings';
import { IconButton, Sheet, toast } from '../ui';
import { ReliveStage } from './ReliveStage';
import { WhySheet } from './WhySheet';

interface Props {
  input: MemoryInput;
  generation: Generation;
  onClose: () => void;
  /** Кнопки под историей: «Сохранить», «Поделиться» и т. п. */
  actions?: ReactNode;
  /** Компактный режим для предпросмотра на широком экране */
  side?: ReactNode;
  /** Начать воспроизведение сразу (переход по кнопке «Смотреть») */
  autoplay?: boolean;
  /** Имя для плавного перехода из карточки (View Transitions) */
  transitionName?: string;
}

export function Player({ input, generation: g, onClose, actions, side, autoplay, transitionName }: Props) {
  const reduced = useReducedMotion();
  const { musicVolume, voiceVolume, set: setSettings } = useSettings();
  const photoIds = useMemo(() => input.photos.map((p) => p.blobId), [input.photos]);
  const urls = useBlobUrls(photoIds);
  const fileUrl = useBlobUrl(input.song?.source === 'file' ? input.song.fileBlobId : null);
  const voiceUrl = useBlobUrl(input.voice?.blobId);
  const photos = useMemo(() => input.photos.map((p) => ({ url: urls[p.blobId], alt: p.alt, features: p.features })), [input.photos, urls]);

  const clock = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [scene, setScene] = useState(0);
  const [artistic, setArtistic] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [why, setWhy] = useState(false);
  const [sound, setSound] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [version, setVersion] = useState(0);
  const audioRef = useRef<StoryAudio | null>(null);
  const autoStarted = useRef(false);

  // Открытие истории останавливает предпрослушивание (даже если его файл ещё грузится).
  useEffect(() => {
    stopAllAudio();
  }, []);

  // Аудио пересоздаётся при смене файлов; закрывается при выходе.
  // Тот же выбор источника, что в редакторе и на карточке архива (просмотр не меняет запись).
  const music = useMemo(() => resolveMusic(input.song, input.mood, input.text), [input.song, input.mood, input.text]);
  const fileReady = music.kind !== 'file' || fileUrl;
  const voiceReady = !input.voice || voiceUrl;
  useEffect(() => {
    if (!fileReady || !voiceReady) return;
    const a = new StoryAudio({
      music,
      fileUrl,
      voiceUrl,
      getPositionMs: () => clock.current,
      onPreempt: () => setPlaying(false),
    });
    a.setVolumes(musicVolume, voiceVolume);
    a.onVoiceEnd = () => setVoicePlaying(false);
    a.onStatus = (s) => audioRef.current === a && setStatus(s);
    audioRef.current = a;
    setStatus(a.status);
    a.prepare().then((s) => audioRef.current === a && setStatus({ ...s }));
    return () => {
      a.destroy();
      if (audioRef.current === a) audioRef.current = null;
      stopSpeaking();
      setSpeaking(false);
      setVoicePlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, voiceUrl, fileReady, voiceReady, music]);

  useEffect(() => {
    audioRef.current?.setVolumes(musicVolume, voiceVolume);
  }, [musicVolume, voiceVolume]);
  useEffect(() => {
    audioRef.current?.setMusicOn(musicOn);
  }, [musicOn]);

  // Часы истории
  // В Reduced Motion часы стоят: сцены листаются вручную, звук играет.
  useEffect(() => {
    if (!playing || reduced) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      clock.current += dt;
      if (clock.current >= g.totalMs) {
        clock.current = g.totalMs - 1;
        setPlaying(false);
        setEnded(true);
        setVersion((v) => v + 1);
        audioRef.current?.pause();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, g.totalMs]);

  const stopSpeech = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    audioRef.current?.duck('speech', false);
  }, []);

  const play = useCallback(async () => {
    if (ended) {
      clock.current = 0;
      setEnded(false);
      setVersion((v) => v + 1);
    }
    setPlaying(true);
    const a = audioRef.current;
    try {
      await a?.play(clock.current);
      if (a && audioRef.current === a) setStatus({ ...a.status });
    } catch {
      toast('Звук не запустился. Проверьте громкость устройства.', 'warn');
    }
  }, [ended]);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
    stopSpeech();
  }, [stopSpeech]);

  // Автозапуск после входа по кнопке «Смотреть» — когда звук готов.
  useEffect(() => {
    if (autoplay && status && !autoStarted.current) {
      autoStarted.current = true;
      play();
    }
  }, [autoplay, status, play]);

  const goScene = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(g.scenes.length - 1, i));
      // Ставим часы после окончания перехода: на паузе кадр сцены виден целиком, без застывшей смеси.
      const s = g.scenes[idx];
      const tr = s.shots[0]?.cutMs ?? g.art.transitionMs;
      clock.current = idx === 0 ? 1 : Math.min(s.startMs + tr / 2 + 1, s.startMs + s.durationMs - 1);
      setEnded(false);
      setVersion((v) => v + 1);
      audioRef.current?.seek(clock.current);
    },
    [g.scenes],
  );

  const prev = useCallback(() => {
    const s = g.scenes[scene];
    if (clock.current - s.startMs > 1200 + g.art.transitionMs / 2 && !reduced) goScene(scene);
    else goScene(scene - 1);
  }, [g.scenes, scene, goScene, reduced]);
  const next = useCallback(() => {
    if (scene >= g.scenes.length - 1) {
      clock.current = g.totalMs - 1;
      setEnded(true);
      setVersion((v) => v + 1);
      pause();
    } else goScene(scene + 1);
  }, [scene, g.scenes.length, g.totalMs, goScene, pause]);

  const close = useCallback(() => {
    audioRef.current?.pause();
    stopSpeech();
    onClose();
  }, [onClose, stopSpeech]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,[role=dialog]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        playing ? pause() : play();
      } else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, play, pause, next, prev, close]);

  // Приостановка при уходе вкладки в фон
  useEffect(() => {
    const onVis = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pause]);

  const toggleVoice = async () => {
    if (!audioRef.current) return;
    if (voicePlaying) {
      audioRef.current.stopVoice();
      setVoicePlaying(false);
    } else {
      setVoicePlaying(true);
      try {
        await audioRef.current.playVoice();
      } catch {
        setVoicePlaying(false);
        toast('Голосовую заметку не удалось воспроизвести', 'error');
      }
    }
  };

  const toggleSpeak = async () => {
    if (speaking) {
      stopSpeech();
      return;
    }
    const a = audioRef.current;
    try {
      setSpeaking(true);
      await speak(
        input.text,
        g,
        () => {
          setSpeaking(false);
          a?.duck('speech', false);
        },
        () => a?.duck('speech', true),
      );
    } catch (e) {
      setSpeaking(false);
      a?.duck('speech', false);
      toast((e as Error).message, 'warn');
    }
  };

  const beat = useCallback(() => audioRef.current?.probe() ?? { sec: null, level: 0 }, []);
  const onScene = useCallback((i: number) => setScene(i), []);

  return (
    <div className="flex min-h-dvh flex-col bg-night lg:flex-row lg:items-start lg:justify-center lg:gap-10 lg:px-8 lg:py-8">
      <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col lg:mx-0 lg:w-[420px] lg:flex-none">
        <ReliveStage
          generation={g}
          photos={photos}
          title={g.title}
          date={input.date}
          placeName={input.place?.name}
          artistic={artistic}
          clock={clock}
          beat={beat}
          running={playing && !reduced}
          version={version}
          transitionName={transitionName}
          still={reduced}
          ended={ended}
          onReplay={play}
          onScene={onScene}
          className={`${actions ? 'h-[calc(100dvh-212px-var(--safe-bottom))]' : 'h-[calc(100dvh-152px-var(--safe-bottom))]'} min-h-[400px] w-full rounded-none sm:rounded-[22px] lg:aspect-[9/16] lg:mx-auto lg:h-[calc(100dvh-250px)] lg:max-h-[760px] lg:w-auto`}
          top={
            <>
              <IconButton icon={X} label="Закрыть" tone="glass" onClick={close} />
              <span className="flex-1" />
              <span className="sr-only">{status?.label}</span>
              <IconButton icon={Palette} label="Почему такая атмосфера?" tone="glass" onClick={() => setWhy(true)} />
              <IconButton icon={Images} label={`Все снимки (${input.photos.length})`} tone="glass" onClick={() => setGallery(true)} />
            </>
          }
        />

        {/* Нижняя панель управления — доступна одной рукой */}
        <div className="safe-bottom bg-night px-3 pt-2">
          <div className="flex items-center gap-1.5 overflow-x-auto px-1 pb-1 text-[12px] text-muted no-scrollbar">
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${status?.note ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok'}`}>
              <EighthNotes size={14} aria-hidden="true" />
              {status?.label ?? 'Готовлю звук…'}
            </span>
            {reduced && <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-ink">Reduced Motion · ручной просмотр</span>}
          </div>
          <div className="flex items-center justify-between gap-1">
            <IconButton icon={Contrast} label={artistic ? 'Показать оригинал' : 'Показать арт-версию'} active={!artistic} onClick={() => setArtistic((v) => !v)} aria-pressed={!artistic} />
            <IconButton icon={ChevronLeft} label="Предыдущая сцена" onClick={prev} />
            <button
              type="button"
              onClick={playing ? pause : play}
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              className="grid h-14 w-14 place-items-center rounded-full bg-accent text-night shadow-lg transition-transform active:scale-95"
            >
              {playing ? <Pause size={26} fill="currentColor" aria-hidden="true" /> : <Play size={26} fill="currentColor" className="translate-x-[1px]" aria-hidden="true" />}
            </button>
            <IconButton icon={ChevronRight} label="Следующая сцена" onClick={next} />
            {input.voice && <IconButton icon={voicePlaying ? Square : Mic} label={voicePlaying ? 'Остановить голос' : 'Голос автора'} active={voicePlaying} onClick={toggleVoice} />}
            <IconButton icon={musicOn ? Volume2 : VolumeX} label="Звук и голос" onClick={() => setSound(true)} active={!musicOn} />
          </div>
          <p className="mt-0.5 text-center text-[12px] font-medium text-muted" aria-live="polite">
            {artistic ? 'Арт-версия' : 'Оригинал'} · сцена {scene + 1} из {g.scenes.length}
          </p>
          {actions && <div className="mt-2 flex gap-2 px-1 [&>button]:min-w-0 [&>button]:text-[14px]">{actions}</div>}
        </div>
      </div>
      {side && <aside className="hidden w-[380px] lg:block">{side}</aside>}

      <WhySheet open={why} onClose={() => setWhy(false)} g={g} />

      <Sheet open={sound} onClose={() => setSound(false)} title="Звук">
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-night p-4 text-[14px]">
            <p className="font-semibold">{status?.mode === 'catalog' ? 'Сейчас: композиция подборки' : status?.mode === 'link' ? 'Сейчас: трек по ссылке' : 'Сейчас: ваш трек'}</p>
            <p className="mt-1 text-muted">{status?.label}</p>
            {status?.note && <p className="mt-2 text-warn">{status.note}</p>}
            {status?.serviceUrl && (
              <a href={status.serviceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-accent">
                <ExternalLink size={18} aria-hidden="true" /> Открыть оригинал
              </a>
            )}
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-[15px]">
            <span className="flex items-center gap-2">
              <EighthNotes size={20} aria-hidden="true" /> Музыка
            </span>
            <input type="checkbox" className="h-5 w-5 accent-[#91A9D1]" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />
          </label>
          <label className="flex flex-col gap-2 text-[14px] text-muted">
            Громкость музыки · {Math.round(musicVolume * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => setSettings({ musicVolume: Number(e.target.value) })} />
          </label>
          {input.voice && (
            <label className="flex flex-col gap-2 text-[14px] text-muted">
              Громкость голоса · {Math.round(voiceVolume * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={voiceVolume} onChange={(e) => setSettings({ voiceVolume: Number(e.target.value) })} />
            </label>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!input.voice}
              onClick={toggleVoice}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-raised px-4 text-[15px] disabled:opacity-45"
            >
              {voicePlaying ? <Square size={18} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
              {input.voice ? (voicePlaying ? 'Остановить голос' : `Голос автора · ${Math.round(input.voice.durationSec)} с`) : 'Голосовой заметки нет'}
            </button>
            <button type="button" onClick={toggleSpeak} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line px-4 text-[15px]">
              {speaking ? <Square size={18} aria-hidden="true" /> : <Speech size={20} aria-hidden="true" />}
              {speaking ? 'Остановить чтение' : 'Прочитать запись'}
            </button>
          </div>
          <p className="text-[12.5px] text-muted">Голос автора — оригинальная запись. «Прочитать запись» использует системный синтез речи. Пока звучит речь, музыка плавно приглушается до 25% и возвращается после.</p>
        </div>
      </Sheet>

      <Sheet open={gallery} onClose={() => setGallery(false)} title={`Оригиналы · ${input.photos.length}`} wide>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {input.photos.map((p, i) => (
            <li key={p.id}>
              <a href={urls[p.blobId]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-night">
                <img src={urls[p.blobId]} alt={p.alt} className="aspect-[3/4] w-full object-cover" />
              </a>
              <p className="mt-1 text-[12px] text-muted">
                {i + 1}. {p.alt}
                {p.id === input.coverId ? ' · обложка' : ''}
              </p>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
