/**
 * Читаемость подписей по WCAG 2.x: относительная яркость, контраст и минимальная подложка.
 * Белый текст лежит на снимке, поверх — градиент цвета shadeColor с непрозрачностью alpha.
 * В зоне текста градиент держит полную alpha, поэтому фон текста ≈ (1−alpha)·Lфото + alpha·Lподложки.
 * Lфото берём по светлым участкам зоны (90-й перцентиль), а не по среднему — проверяем худший случай.
 */
import type { PhotoFeatures, TextZone } from '../lib/types';
import { clamp, hexToRgb } from '../lib/util';

export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Относительная яркость цвета #RRGGBB (0..1). */
export function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(l1: number, l2: number) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Минимальный обычный текст — 4,5:1, крупный (название) — 3:1. */
export const TARGET_NORMAL = 4.5;
export const TARGET_LARGE = 3;

/**
 * Минимальная непрозрачность подложки, при которой белый текст достигает target.
 * Тёмному кадру подложка почти не нужна — его тени остаются тенями.
 */
export function shadeFor(zoneLum: number, shadeLum: number, target = TARGET_NORMAL, min = 0.16, max = 0.92) {
  const maxBg = 1.05 / target - 0.05;
  let alpha = zoneLum <= maxBg ? min : (zoneLum - maxBg) / Math.max(1e-6, zoneLum - shadeLum);
  alpha = clamp(alpha, min, max);
  const bg = (1 - alpha) * zoneLum + alpha * shadeLum;
  return { alpha: Math.round(alpha * 100) / 100, ratio: Math.round(contrastRatio(1, bg) * 100) / 100 };
}

/** Зона подписи; для снимков, проанализированных до версии 1.1, — оценка по старым признакам. */
export function zoneOf(f: PhotoFeatures, side: 'left' | 'right'): TextZone {
  if (f.zones) return f.zones[side];
  const gamma = Math.max(side === 'left' ? f.regionBrightness.left : f.regionBrightness.right, f.regionBrightness.bottom);
  const brightPart = clamp(gamma + f.contrast * 0.35);
  const g = f.detailGrid;
  const detail = side === 'left' ? (g[3] + g[6]) / 2 : (g[5] + g[8]) / 2;
  return { p90: toLinear(brightPart), mean: toLinear(gamma), detail };
}

/** Насколько зона мешает чтению: детали и светлые пятна под буквами. */
export function zoneCost(z: TextZone) {
  return z.detail * 0.6 + Math.sqrt(z.p90) * 0.4;
}
