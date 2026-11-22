/**
 * Вертикальная сцена RE:LIVE: кадры с движением камеры по плану генератора,
 * художественный слой на Canvas, подписи с рассчитанной подложкой и полоски прогресса.
 *
 * Отрисовка:
 * — пока история играет (running), идёт цикл requestAnimationFrame;
 * — на паузе, в Reduced Motion и после финала цикл остановлен; сцена перерисовывается один раз
 *   при перемотке (version), смене размера, «Оригинал / Арт» и загрузке снимка.
 * Покадровое обновление идёт через ссылки на DOM (без перерисовки React на каждом кадре).
 */
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { shadeColorOf } from '../../engine/generator';
import type { Generation, PhotoFeatures } from '../../lib/types';
import { formatDate, rgba, typo } from '../../lib/util';
import { drawEffects, prepareEffects } from './effects';

export interface StagePhoto {
  url: string | undefined;
  alt: string;
  features: PhotoFeatures;
}

/** Позиция реально звучащего источника (с) и его уровень 0..1; null — звук не идёт. */
export type BeatProbe = () => { sec: number | null; level: number };

interface Props {
  generation: Generation;
  photos: StagePhoto[];
  title: string;
  date: string;
  placeName?: string;
  artistic: boolean;
  clock: React.MutableRefObject<number>;
  beat: BeatProbe;
  /** Идёт ли воспроизведение с движением (не пауза, не Reduced Motion) */
  running: boolean;
  /** Меняется при перемотке/смене сцены вручную — сигнал однократно перерисовать */
  version: number;
  still: boolean;
  ended: boolean;
  onReplay: () => void;
  onScene: (i: number) => void;
  top?: ReactNode;
  className?: string;
  /** Имя для плавного перехода из карточки архива (View Transitions) */
  transitionName?: string;
  /** Счётчик отрисовок для проверки производительности */
  onDraw?: () => void;
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

export function ReliveStage(props: Props) {
  const { generation: g, photos, title, date, placeName, artistic, clock, beat, running, version, still, ended, onReplay, onScene, top, className = '', transitionName, onDraw } = props;
  const shots = useMemo(() => g.scenes.flatMap((s, si) => s.shots.map((sh) => ({ ...sh, scene: si }))), [g]);
  const coverIdx = g.scenes[0]?.shots[0]?.photoIndex ?? 0;
  const fx = useMemo(() => prepareEffects(g, photos[coverIdx]?.features.detailGrid ?? new Array(9).fill(0.5)), [g, photos, coverIdx]);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);
  const sceneRef = useRef(-1);
  const live = useRef({ artistic, still, beat, onScene, onDraw });
  live.current = { artistic, still, beat, onScene, onDraw };

  /** Один кадр сцены для времени clock.current. */
  const draw = useCallback(() => {
    const t = clock.current;
    const { artistic: art, still: isStill, beat: probe } = live.current;
    live.current.onDraw?.();
    let si = 0;
    for (let i = 0; i < g.scenes.length; i++) if (t >= g.scenes[i].startMs) si = i;
    if (si !== sceneRef.current) {
      sceneRef.current = si;
      setScene(si);
      live.current.onScene(si);
    }
    g.scenes.forEach((s, i) => {
      const el = barRefs.current[i];
      if (el) el.style.transform = `scaleX(${i < si ? 1 : i > si ? 0 : Math.min(1, (t - s.startMs) / s.durationMs)})`;
    });

    // Пульс: по атакам реально звучащего источника или спокойное дыхание (раз в такт).
    let pulse = 0;
    if (!isStill) {
      const { sec, level } = probe();
      if (g.art.pulseMode === 'attack' && sec !== null) {
        const ms = sec * 1000 - (g.art.beatOffsetMs ?? 0);
        const phase = (((ms % g.art.pulseMs) + g.art.pulseMs) % g.art.pulseMs) / g.art.pulseMs;
        pulse = Math.exp(-phase * (4 + (g.params.energy / 100) * 6)) * (0.4 + 0.6 * Math.min(1, level * 1.4));
      } else {
        const bar = g.art.pulseMs * 4;
        pulse = 0.18 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / bar)) * (level > 0.04 ? 1 : 0.6);
      }
    }

    const tr = g.art.transitionMs;
    const firstOfScene = shots.find((x) => x.scene === si);
    shots.forEach((sh, i) => {
      const el = imgRefs.current[i];
      if (!el) return;
      const shotTr = sh.cutMs ?? tr;
      let op: number;
      if (isStill) op = sh === firstOfScene ? 1 : 0;
      else {
        const fadeIn = i === 0 ? 1 : ease((t - (sh.startMs - shotTr / 2)) / shotTr);
        const nextTr = shots[i + 1]?.cutMs ?? tr;
        op = t <= sh.endMs + nextTr / 2 || i === shots.length - 1 ? fadeIn : 0;
      }
      el.style.opacity = String(op);
      el.style.visibility = op > 0.001 ? 'visible' : 'hidden';
      if (op <= 0.001) return;
      let s = 1;
      let x = 0;
      let y = 0;
      if (!isStill) {
        const p = ease((t - sh.startMs) / (sh.endMs - sh.startMs + shotTr / 2));
        s = sh.fromScale + (sh.toScale - sh.fromScale) * p * (0.6 + 0.4 * g.art.motionAmp);
        x = sh.fromX + (sh.toX - sh.fromX) * p;
        y = sh.fromY + (sh.toY - sh.fromY) * p;
        if (art && g.art.pulseMode === 'attack') s *= 1 + pulse * 0.008 * g.art.glowAmp;
        s = Math.max(s, 1 + (Math.max(Math.abs(x), Math.abs(y)) * 2) / 100);
      }
      el.style.transform = `translate3d(${x}%, ${y}%, 0) scale(${s})`;
    });

    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      if (art) drawEffects(ctx, c.width, c.height, g.art, fx, t, pulse, isStill);
      else ctx.clearRect(0, 0, c.width, c.height);
    }
  }, [g, shots, fx, clock]);

  // Размер холста под контейнер (+ однократная перерисовка)
  useEffect(() => {
    const c = canvasRef.current;
    const box = boxRef.current;
    if (!c || !box) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(box.clientWidth * dpr);
      c.height = Math.round(box.clientHeight * dpr);
      draw();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [draw]);

  // Цикл только во время воспроизведения; иначе — один кадр на изменение.
  useEffect(() => {
    if (!running) {
      draw();
      return;
    }
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, draw, version, artistic, still]);

  const sc = g.scenes[scene];
  const side = sc?.textSide ?? g.art.captionAlign;
  const S = sc?.shade ?? g.art.shadeStrength;
  const photoForScene = photos[sc?.shots[0]?.photoIndex ?? 0];
  const shadeColor = sc?.shadeColor ?? (photoForScene ? shadeColorOf(photoForScene.features) : '#080A10');
  // Полная непрозрачность держится по всей зоне текста (нижние 42%), затем плавно уходит.
  const shade = `linear-gradient(to top, ${rgba(shadeColor, S)} 0%, ${rgba(shadeColor, S)} 42%, ${rgba(shadeColor, S * 0.45)} 58%, transparent 78%), linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${rgba(shadeColor, Math.min(0.35, S * 0.4))} 0%, transparent 62%)`;
  const glow = artistic ? `0 0 80px -18px ${rgba(g.art.glowColor, 0.5 * (g.art.glowRoom ?? 1))}` : `0 0 60px -24px ${rgba(g.art.palette[0] ?? '#91A9D1', 0.35)}`;
  const textAlign = side === 'left' ? 'text-left items-start' : 'text-right items-end';

  return (
    <div ref={boxRef} className={`relative overflow-hidden rounded-[22px] bg-black ${className}`} style={{ boxShadow: glow }}>
      {shots.map((sh, i) => (
        <img
          key={i}
          ref={(el) => {
            imgRefs.current[i] = el;
          }}
          src={photos[sh.photoIndex]?.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          onLoad={() => !running && draw()}
          className="absolute inset-0 h-full w-full select-none object-cover will-change-transform"
          style={{
            zIndex: i + 1,
            opacity: i === 0 ? 1 : 0,
            filter: artistic ? g.art.photoFilter : 'none',
            viewTransitionName: i === 0 ? transitionName : undefined,
          }}
        />
      ))}
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 50 }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex: 51, background: shade }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" style={{ zIndex: 51 }} />

      <div className="absolute inset-x-0 top-0 px-3 pt-[max(10px,var(--safe-top))]" style={{ zIndex: 60 }}>
        <div className="flex gap-1.5" aria-hidden="true">
          {g.scenes.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                className="block h-full origin-left rounded-full bg-white"
                style={{ transform: 'scaleX(0)' }}
              />
            </span>
          ))}
        </div>
        {top && <div className="mt-2 flex items-center gap-1">{top}</div>}
      </div>

      {/* Подписи: сторона и подложка рассчитаны для кадра каждой сцены */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col px-6 pb-7 ${textAlign}`} style={{ zIndex: 55 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={scene}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: Math.min(0.8, g.art.transitionMs / 1800) }}
            className={`flex max-w-[86%] flex-col ${textAlign}`}
            style={{ textShadow: '0 1px 10px rgba(0,0,0,.45)' }}
          >
            {sc?.kind === 'opening' && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white">
                  {formatDate(date)}
                  {placeName ? ` · ${placeName}` : ''}
                </p>
                <div style={{ height: g.art.titleGap * 0.5 }} />
                <h2 className="font-title leading-[1.08] text-white [overflow-wrap:break-word] hyphens-auto" style={{ fontSize: `clamp(24px, ${g.art.titleSize / 4.2}vw, ${g.art.titleSize}px)` }}>
                  {typo(title)}
                </h2>
                {artistic && (
                  <span
                    aria-hidden="true"
                    className="mt-3 block h-[2px] w-16 rounded-full"
                    style={{ background: g.art.glowColor, transform: `rotate(${g.art.tiltDeg}deg)`, transformOrigin: side === 'left' ? 'left' : 'right' }}
                  />
                )}
              </>
            )}
            {sc?.kind === 'middle' && sc.caption && <p className="font-serif text-[clamp(19px,5.2vw,25px)] italic leading-snug text-white">«{typo(sc.caption)}»</p>}
            {sc?.kind === 'finale' && (
              <>
                {sc.caption && <p className="font-serif text-[clamp(18px,5vw,23px)] italic leading-snug text-white">«{typo(sc.caption)}»</p>}
                <div style={{ height: g.art.titleGap }} />
                <p className="text-[13px] font-medium text-white">
                  {title} · {formatDate(date)}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/35" style={{ zIndex: 70 }}>
          <button type="button" onClick={onReplay} className="flex min-h-12 items-center gap-2 rounded-full bg-white/90 px-5 font-semibold text-night">
            <RotateCcw size={20} aria-hidden="true" /> Повторить показ
          </button>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        Сцена {scene + 1} из {g.scenes.length}. {photoForScene?.alt}. {sc?.kind === 'opening' ? title : sc?.caption ?? ''}
      </p>
    </div>
  );
}
