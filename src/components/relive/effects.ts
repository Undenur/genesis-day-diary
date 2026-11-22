/**
 * Художественный слой RE:LIVE на Canvas. Всё детерминировано seed’ом дня:
 * при одинаковом вводе — одинаковые формы, частицы и их движение.
 */
import type { ArtDirection, Generation } from '../../lib/types';
import { hexToRgb, liftColor, rgba, rng } from '../../lib/util';

interface Particle {
  x: number;
  y: number;
  r: number;
  s: number;
  ph: number;
  c: string;
}

export interface EffectState {
  particles: Particle[];
  shapes: { kind: 'circle' | 'ring' | 'line' | 'tri'; x: number; y: number; r: number; c: string; ph: number }[];
  blobs: { x: number; y: number; r: number; c: string; ph: number }[];
  streaks: { x: number; w: number; ph: number }[];
  grain: HTMLCanvasElement;
}

export function prepareEffects(g: Generation, detailGrid: number[]): EffectState {
  const r = rng(g.seed);
  const art = g.art;
  const pal = art.palette.length ? art.palette : ['#91A9D1'];
  const lightPal = [...pal].sort((a, b) => lum(b) - lum(a));
  const particles: Particle[] = Array.from({ length: art.particleCount }, () => ({
    x: r(),
    y: r(),
    r: 0.6 + r() * 2.4,
    s: 0.2 + r() * 0.8,
    ph: r() * Math.PI * 2,
    c: lightPal[Math.floor(r() * Math.min(2, lightPal.length))],
  }));
  // Геометрия Кандинского встаёт на самые детальные (контрастные) ячейки кадра.
  const cells = detailGrid.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const nShapes = 4 + Math.round((g.params.density / 100) * 6);
  const shapes = Array.from({ length: nShapes }, (_, k) => {
    const cell = cells[k % 4].i;
    const kinds = ['circle', 'ring', 'line', 'tri'] as const;
    return {
      kind: kinds[Math.floor(r() * 4)],
      x: ((cell % 3) + 0.2 + r() * 0.6) / 3,
      y: (Math.floor(cell / 3) + 0.2 + r() * 0.6) / 3,
      r: 0.04 + r() * 0.12,
      c: luminous(pal[Math.floor(r() * pal.length)]),
      ph: r() * Math.PI * 2,
    };
  });
  const blobs = Array.from({ length: 4 }, () => ({ x: r(), y: 0.3 + r() * 0.7, r: 0.25 + r() * 0.25, c: pal[Math.floor(r() * pal.length)], ph: r() * 6 }));
  const streaks = Array.from({ length: 16 }, () => ({ x: r(), w: 2 + r() * 10, ph: r() * 6 }));
  return { particles, shapes, blobs, streaks, grain: makeGrain(r) };
}

/** Тот же оттенок кадра, но светлее и насыщеннее — чтобы геометрия читалась поверх тёмной сцены. */
const luminous = (hex: string) => liftColor(hex, 0.64, 0.55);

function lum(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function makeGrain(r: () => number) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Рисует кадр эффектов. t — время истории (мс), pulse — 0..1 пульс доли,
 * still — Reduced Motion: статичное оформление без движения.
 */
export function drawEffects(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtDirection, st: EffectState, t: number, pulse: number, still: boolean) {
  ctx.clearRect(0, 0, w, h);
  const time = still ? 0 : t / 1000;
  const p = still ? 0 : pulse;
  const amp = art.glowAmp;

  // Свечение из цвета кадра
  ctx.globalCompositeOperation = 'screen';
  const gx = art.captionAlign === 'left' ? w * 0.78 : w * 0.22;
  const glow = ctx.createRadialGradient(gx, h * 0.22, 0, gx, h * 0.22, Math.max(w, h) * 0.75);
  glow.addColorStop(0, rgba(art.glowColor, 0.16 + 0.22 * amp * p));
  glow.addColorStop(1, rgba(art.glowColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  if (art.style === 'impressionism') {
    ctx.globalCompositeOperation = 'soft-light';
    st.blobs.forEach((b, i) => {
      const x = (b.x + Math.sin(time * 0.07 + b.ph) * 0.05) * w;
      const y = (b.y * 0.6 + Math.cos(time * 0.05 + b.ph) * 0.04) * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * w * 1.2);
      g.addColorStop(0, rgba(i % 2 ? '#FFF4DD' : b.c, 0.38));
      g.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = 'screen';
    for (const d of st.particles) {
      const x = (d.x + Math.sin(time * 0.1 * d.s + d.ph) * 0.01) * w;
      const y = d.y * h;
      ctx.fillStyle = rgba(d.c, 0.05 + 0.05 * Math.sin(time * d.s + d.ph) ** 2);
      ctx.beginPath();
      ctx.arc(x, y, d.r * 5 + 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (art.style === 'kandinsky') {
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 2;
    for (const s of st.shapes) {
      const k = 1 + p * 0.25 * amp;
      const x = s.x * w;
      const y = s.y * h;
      const r = s.r * w * k;
      const a = 0.22 + 0.4 * p * amp;
      ctx.strokeStyle = rgba(s.c, Math.min(0.85, a + 0.2));
      ctx.fillStyle = rgba(s.c, a * 0.55);
      ctx.beginPath();
      if (s.kind === 'circle') {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'ring') {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.kind === 'line') {
        const ang = ((art.tiltDeg * 2 + s.ph * 10) * Math.PI) / 180;
        ctx.moveTo(x - Math.cos(ang) * r * 3, y - Math.sin(ang) * r * 3);
        ctx.lineTo(x + Math.cos(ang) * r * 3, y + Math.sin(ang) * r * 3);
        ctx.stroke();
      } else {
        const ang = s.ph + time * 0.1;
        for (let i = 0; i < 3; i++) {
          const aa = ang + (i * Math.PI * 2) / 3;
          if (i === 0) ctx.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
          else ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else {
    // Минимализм: тонкая рамка и воздух
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 1;
    const inset = Math.round(w * 0.045);
    ctx.strokeRect(inset + 0.5, inset + 0.5, w - inset * 2 - 1, h - inset * 2 - 1);
  }

  for (const e of art.effects) {
    if (e === 'amber-halo') {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 2; i++) {
        const x = (i ? 0.25 : 0.72) * w + Math.sin(time * 0.2 + i) * w * 0.02;
        const y = (i ? 0.7 : 0.25) * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, w * (0.35 + 0.05 * p));
        g.addColorStop(0, `rgba(255,178,92,${0.2 + 0.15 * p * amp})`);
        g.addColorStop(0.5, 'rgba(255,150,70,0.06)');
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    } else if (e === 'silver-shimmer') {
      ctx.globalCompositeOperation = 'screen';
      for (const d of st.particles) {
        const tw = still ? 0.6 : Math.max(0, Math.sin(time * 2.2 * d.s + d.ph));
        const x = d.x * w;
        const y = d.y * h;
        ctx.fillStyle = `rgba(235,242,255,${0.65 * tw})`;
        ctx.beginPath();
        ctx.arc(x, y, d.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        if (tw > 0.8) {
          ctx.strokeStyle = `rgba(235,242,255,${0.4 * tw})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - 5, y);
          ctx.lineTo(x + 5, y);
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x, y + 5);
          ctx.stroke();
        }
      }
    } else if (e === 'light-particles') {
      ctx.globalCompositeOperation = 'screen';
      for (const d of st.particles.slice(0, Math.ceil(st.particles.length * 0.6))) {
        const y = ((d.y - time * 0.012 * d.s) % 1 + 1) % 1;
        ctx.fillStyle = `rgba(255,250,235,${0.35 + 0.25 * d.s})`;
        ctx.beginPath();
        ctx.arc((d.x + Math.sin(time * 0.3 + d.ph) * 0.01) * w, y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e === 'organic-forms') {
      // Мягкие органические пятна: радиальная заливка без жёсткого края.
      ctx.globalCompositeOperation = 'soft-light';
      for (const b of st.blobs) {
        const cx = b.x * w;
        const cy = b.y * h;
        const rad = b.r * w * 0.7;
        const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        fill.addColorStop(0, rgba(b.c, 0.22));
        fill.addColorStop(0.7, rgba(b.c, 0.1));
        fill.addColorStop(1, rgba(b.c, 0));
        ctx.fillStyle = fill;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = rad * (0.82 + 0.18 * Math.sin(a * 3 + time * 0.25 + b.ph));
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.quadraticCurveTo(cx + Math.cos(a - 0.4) * rr * 1.1, cy + Math.sin(a - 0.4) * rr * 1.1, x, y);
        }
        ctx.fill();
      }
    } else if (e === 'muted-reflections') {
      ctx.globalCompositeOperation = 'screen';
      const top = h * 0.66;
      for (const s of st.streaks) {
        const x = s.x * w;
        const g = ctx.createLinearGradient(0, top, 0, h);
        g.addColorStop(0, 'rgba(200,220,240,0)');
        g.addColorStop(1, `rgba(200,220,240,${0.07 + 0.05 * Math.sin(time + s.ph)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, top, s.w, h - top);
      }
      ctx.strokeStyle = 'rgba(210,228,245,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of st.particles) {
        const y = ((d.y + time * 0.35 * d.s) % 1) * h;
        const x = d.x * w;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 16 * d.s + 6);
      }
      ctx.stroke();
    }
  }

  // Зерно и мягкость (Nostalgia)
  if (art.grain > 0.05) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(0.32, art.grain * 0.3);
    const pat = ctx.createPattern(st.grain, 'repeat');
    if (pat) {
      const ox = still ? 0 : Math.floor((t / 60) % 160);
      ctx.save();
      ctx.translate(-ox, -((ox * 7) % 160));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w + 160, h + 160);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${0.25 + art.softness * 0.3})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
