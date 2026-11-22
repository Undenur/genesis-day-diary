/**
 * Вертикальная сцена RE:LIVE: кадры с движением камеры по плану генератора,
 * художественный слой на Canvas, подписи с локальным градиентом и полоски прогресса.
 * Покадровое обновление идёт через ссылки на DOM (без перерисовки React на каждом кадре).
 */
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Generation, PhotoFeatures } from '../../lib/types';
import { formatDate, rgba, typo } from '../../lib/util';
import { drawEffects, prepareEffects } from './effects';

export interface StagePhoto {
  url: string | undefined;
  alt: string;
  features: PhotoFeatures;
}

interface Props {
  generation: Generation;
  photos: StagePhoto[];
  title: string;
  date: string;
  placeName?: string;
  artistic: boolean;
  clock: React.MutableRefObject<number>;
  levelFn: () => number;
  still: boolean;
  ended: boolean;
  onReplay: () => void;
  onScene: (i: number) => void;
  top?: ReactNode;
  className?: string;
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

export function ReliveStage({ generation: g, photos, title, date, placeName, artistic, clock, levelFn, still, ended, onReplay, onScene, top, className = '' }: Props) {
  const shots = useMemo(() => g.scenes.flatMap((s, si) => s.shots.map((sh) => ({ ...sh, scene: si }))), [g]);
  const coverIdx = useMemo(() => g.scenes[0]?.shots[0]?.photoIndex ?? 0, [g]);
  const fx = useMemo(() => prepareEffects(g, photos[coverIdx]?.features.detailGrid ?? new Array(9).fill(0.5)), [g, photos, coverIdx]);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);
  const sceneRef = useRef(0);
  const artisticRef = useRef(artistic);
  artisticRef.current = artistic;
  const stillRef = useRef(still);
  stillRef.current = still;

  // Размер холста под контейнер
  useEffect(() => {
    const c = canvasRef.current;
    const box = boxRef.current;
    if (!c || !box) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(box.clientWidth * dpr);
      c.height = Math.round(box.clientHeight * dpr);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    const tr = g.art.transitionMs;
    const loop = () => {
      const t = clock.current;
      const isStill = stillRef.current;
      // Текущая сцена
      let si = 0;
      for (let i = 0; i < g.scenes.length; i++) if (t >= g.scenes[i].startMs) si = i;
      if (si !== sceneRef.current) {
        sceneRef.current = si;
        setScene(si);
        onScene(si);
      }
      // Полоски прогресса
      g.scenes.forEach((s, i) => {
        const el = barRefs.current[i];
        if (!el) return;
        const f = i < si ? 1 : i > si ? 0 : Math.min(1, (t - s.startMs) / s.durationMs);
        el.style.transform = `scaleX(${f})`;
      });
      // Пульс доли × уровень музыки
      const beatPhase = (t % g.art.pulseMs) / g.art.pulseMs;
      const sharp = 3 + (g.params.energy / 100) * 6;
      const level = levelFn();
      const pulse = Math.exp(-beatPhase * sharp) * (level > 0 ? 0.45 + 0.55 * Math.min(1, level * 1.4) : 0.35);
      // Кадры
      shots.forEach((sh, i) => {
        const el = imgRefs.current[i];
        if (!el) return;
        let op: number;
        if (isStill) {
          op = sh.scene === si && sh === shots.find((x) => x.scene === si) ? 1 : 0;
        } else {
          const fadeIn = i === 0 ? 1 : ease((t - (sh.startMs - tr / 2)) / tr);
          const visible = t <= sh.endMs + tr / 2 || i === shots.length - 1;
          op = visible ? fadeIn : 0;
        }
        el.style.opacity = String(op);
        el.style.visibility = op > 0.001 ? 'visible' : 'hidden';
        if (op <= 0.001) return;
        let s = 1;
        let x = 0;
        let y = 0;
        if (!isStill) {
          const p = ease((t - sh.startMs) / (sh.endMs - sh.startMs + tr / 2));
          const amp = g.art.motionAmp;
          s = sh.fromScale + (sh.toScale - sh.fromScale) * p * (0.6 + 0.4 * amp);
          x = sh.fromX + (sh.toX - sh.fromX) * p;
          y = sh.fromY + (sh.toY - sh.fromY) * p;
          if (artisticRef.current) s *= 1 + pulse * 0.01 * g.art.glowAmp;
          s = Math.max(s, 1 + (Math.max(Math.abs(x), Math.abs(y)) * 2) / 100);
        }
        el.style.transform = `translate3d(${x}%, ${y}%, 0) scale(${s})`;
      });
      // Художественный слой
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) {
          if (artisticRef.current) drawEffects(ctx, c.width, c.height, g.art, fx, t, pulse, isStill);
          else ctx.clearRect(0, 0, c.width, c.height);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [g, shots, fx, clock, levelFn, onScene]);

  const sc = g.scenes[scene];
  const align = g.art.captionAlign;
  const pal = g.art.palette;
  const darkest = [...pal].sort((a, b) => parseInt(a.slice(1), 16) - parseInt(b.slice(1), 16))[0] ?? '#0B1020';
  const shadeColor = artistic ? darkest : '#080A10';
  const S = g.art.shadeStrength;
  const shade = `linear-gradient(to top, ${rgba(shadeColor, S)} 0%, ${rgba(shadeColor, S * 0.55)} 30%, transparent 62%), linear-gradient(to ${align === 'left' ? 'right' : 'left'}, ${rgba(shadeColor, S * 0.45)} 0%, transparent 58%)`;
  const glow = artistic
    ? `0 0 90px -16px ${rgba(g.art.glowColor, 0.6)}, 0 40px 120px -40px ${rgba(g.art.accent, 0.5)}`
    : `0 0 70px -24px ${rgba(pal[0] ?? '#91A9D1', 0.4)}`;
  const textAlign = align === 'left' ? 'text-left items-start' : 'text-right items-end';
  const currentPhoto = photos[sc?.shots[0]?.photoIndex ?? 0];

  return (
    <div ref={boxRef} className={`relative overflow-hidden rounded-[22px] bg-black ${className}`} style={{ boxShadow: glow, transition: 'box-shadow 400ms' }}>
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
          className="absolute inset-0 h-full w-full select-none object-cover will-change-transform"
          style={{ zIndex: i + 1, opacity: i === 0 ? 1 : 0, filter: artistic ? g.art.photoFilter : 'none', transition: 'filter 350ms' }}
        />
      ))}
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 50 }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex: 51, background: shade }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" style={{ zIndex: 51 }} />

      {/* Полоски прогресса и верхние элементы управления */}
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

      {/* Подписи: позиция по свободной стороне кадра, интервал и масштаб — из Emotion DNA */}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col px-6 pb-7 ${textAlign}`} style={{ zIndex: 55 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={scene}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: Math.min(0.9, g.art.transitionMs / 1600) }}
            className={`flex max-w-[86%] flex-col ${textAlign}`}
            style={{ textShadow: '0 1px 14px rgba(0,0,0,.55)' }}
          >
            {sc?.kind === 'opening' && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/85">
                  {formatDate(date)}
                  {placeName ? ` · ${placeName}` : ''}
                </p>
                <div style={{ height: g.art.titleGap * 0.5 }} />
                <h2 className="font-title leading-[1.08] text-white" style={{ fontSize: `clamp(24px, ${g.art.titleSize / 4.2}vw, ${g.art.titleSize}px)` }}>
                  {typo(title)}
                </h2>
                {artistic && (
                  <span
                    aria-hidden="true"
                    className="mt-3 block h-[2px] w-16 rounded-full"
                    style={{ background: g.art.glowColor, transform: `rotate(${g.art.tiltDeg}deg)`, transformOrigin: align === 'left' ? 'left' : 'right' }}
                  />
                )}
              </>
            )}
            {sc?.kind === 'middle' && sc.caption && (
              <p className="font-serif text-[clamp(19px,5.2vw,25px)] italic leading-snug text-white">«{typo(sc.caption)}»</p>
            )}
            {sc?.kind === 'finale' && (
              <>
                {sc.caption && <p className="font-serif text-[clamp(18px,5vw,23px)] italic leading-snug text-white">«{typo(sc.caption)}»</p>}
                <div style={{ height: g.art.titleGap }} />
                <p className="text-[13px] font-medium text-white/80">
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
        Сцена {scene + 1} из {g.scenes.length}. {currentPhoto?.alt}. {sc?.kind === 'opening' ? title : sc?.caption ?? ''}
      </p>
    </div>
  );
}
