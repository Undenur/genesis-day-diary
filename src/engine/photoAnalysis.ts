/**
 * Признаки снимка по пикселям (Canvas getImageData): палитра 5 цветов (k-средних),
 * яркость, насыщенность, контраст, тепло, карта деталей 3×3 и свободная сторона для подписи.
 * Функция чистая — её можно тестировать без браузера.
 */
import type { PaletteColor, PhotoFeatures } from '../lib/types';
import { clamp, rgbToHsl, toHex } from '../lib/util';

export function analyzePixels(data: Uint8ClampedArray, w: number, h: number, origW = w, origH = h): PhotoFeatures {
  const n = w * h;
  const lum = new Float32Array(n);
  let sumL = 0;
  let sumS = 0;
  let warmNum = 0;
  let warmDen = 0;
  const samples: number[][] = [];

  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum[i] = l;
    sumL += l;
    const [, s] = rgbToHsl(r, g, b);
    sumS += s;
    const wgt = s * (1 - Math.abs(l - 0.5));
    warmNum += ((r - b) / 255) * wgt;
    warmDen += wgt;
    if (i % 2 === 0) samples.push([r, g, b]);
  }

  const brightness = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (lum[i] - brightness) ** 2;
  const contrast = clamp(Math.sqrt(varL / n) * 3.2);
  const saturation = sumS / n;
  const warmth = clamp(warmDen > 0 ? (warmNum / warmDen) * 1.6 : 0, -1, 1);

  // Карта деталей: средняя величина градиента в каждой из 9 ячеек.
  const grid = new Array(9).fill(0);
  const counts = new Array(9).fill(0);
  let edgeSum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeSum += mag;
      const cell = Math.min(2, Math.floor((y / h) * 3)) * 3 + Math.min(2, Math.floor((x / w) * 3));
      grid[cell] += mag;
      counts[cell]++;
    }
  }
  const cellMeans = grid.map((v, i) => (counts[i] ? v / counts[i] : 0));
  const maxCell = Math.max(...cellMeans, 1e-6);
  const detailGrid = cellMeans.map((v) => Math.round((v / maxCell) * 100) / 100);
  const activity = clamp((edgeSum / Math.max(1, (w - 2) * (h - 2))) * 9);

  const regionBrightness = {
    left: regionMean(lum, w, h, 0, 0, 1 / 3, 1),
    right: regionMean(lum, w, h, 2 / 3, 0, 1, 1),
    bottom: regionMean(lum, w, h, 0, 2 / 3, 1, 1),
    top: regionMean(lum, w, h, 0, 0, 1, 1 / 3),
  };

  return {
    width: origW,
    height: origH,
    palette: kMeansPalette(samples, 5),
    brightness: round2(brightness),
    saturation: round2(saturation),
    contrast: round2(contrast),
    warmth: round2(warmth),
    detailGrid,
    activity: round2(activity),
    regionBrightness: {
      left: round2(regionBrightness.left),
      right: round2(regionBrightness.right),
      bottom: round2(regionBrightness.bottom),
      top: round2(regionBrightness.top),
    },
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function regionMean(lum: Float32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  let s = 0;
  let c = 0;
  for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) {
      s += lum[y * w + x];
      c++;
    }
  }
  return c ? s / c : 0;
}

/** Детерминированный k-means: начальные центры — квантили по яркости. */
function kMeansPalette(samples: number[][], k: number): PaletteColor[] {
  if (!samples.length) return [];
  const sorted = [...samples].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]]);
  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    }
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < samples.length; i++) counts[assign[i]]++;
  const colors: PaletteColor[] = centers.map((c, i) => {
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    return { hex: toHex(c[0], c[1], c[2]), weight: round2(counts[i] / samples.length), h: Math.round(h), s: round2(s), l: round2(l) };
  });
  // Сливаем почти одинаковые цвета.
  const merged: PaletteColor[] = [];
  for (const c of colors.sort((a, b) => b.weight - a.weight)) {
    const twin = merged.find((m) => Math.abs(m.l - c.l) < 0.06 && Math.abs(m.s - c.s) < 0.08 && hueDist(m.h, c.h) < 14);
    if (twin) twin.weight = round2(twin.weight + c.weight);
    else if (c.weight > 0.01) merged.push(c);
  }
  return merged.slice(0, 5);
}

export function hueDist(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Сторона кадра, где меньше деталей — туда ставим подпись. */
export function freeSide(f: PhotoFeatures): { side: 'left' | 'right'; left: number; right: number } {
  const g = f.detailGrid;
  const left = (g[0] + g[3] + g[6]) / 3;
  const right = (g[2] + g[5] + g[8]) / 3;
  return { side: left <= right ? 'left' : 'right', left: round2(left), right: round2(right) };
}
