import { describe, expect, it } from 'vitest';
import type { PhotoFeatures } from '../lib/types';
import { countWords } from '../lib/util';
import { analyzeSignal, buildSongProfile } from './audioAnalysis';
import { generateRelive, type GeneratorInput } from './generator';
import { analyzePixels } from './photoAnalysis';
import { analyzeText } from './textAnalysis';
import { suggestTitle } from './title';

function photo(over: Partial<PhotoFeatures> = {}): PhotoFeatures {
  return {
    width: 1200,
    height: 1600,
    palette: [
      { hex: '#C08A3E', weight: 0.34, h: 36, s: 0.52, l: 0.5 },
      { hex: '#3B2A22', weight: 0.3, h: 20, s: 0.27, l: 0.18 },
      { hex: '#8FA7C4', weight: 0.2, h: 213, s: 0.32, l: 0.66 },
      { hex: '#E9DCC2', weight: 0.16, h: 40, s: 0.5, l: 0.84 },
    ],
    brightness: 0.48,
    saturation: 0.4,
    contrast: 0.45,
    warmth: 0.42,
    detailGrid: [0.2, 0.4, 0.9, 0.3, 0.6, 1, 0.2, 0.5, 0.8],
    activity: 0.4,
    regionBrightness: { left: 0.4, right: 0.6, bottom: 0.35, top: 0.6 },
    ...over,
  };
}

const RAIN_TEXT =
  'Весь вечер шёл дождь, а мы сидели у окна в кофейне. Лампа над столом грела ладони, чай остывал неспешно. Было совсем не грустно — тихо и тепло. Последним запомнился запах корицы на выходе.';

const base = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({
  text: RAIN_TEXT,
  date: '2025-11-22',
  authorTitle: '',
  season: 'autumn',
  weather: '',
  placeName: '',
  photos: [photo(), photo({ warmth: -0.1, activity: 0.3, detailGrid: [1, 0.5, 0.2, 0.9, 0.4, 0.1, 0.7, 0.3, 0.1] })],
  coverIndex: 0,
  song: buildSongProfile({ source: 'description', title: 'Капли', artist: 'Демо', genre: 'камерное фортепиано', mood: 'тихое', bpm: 62 }),
  songLabel: 'Капли',
  ...over,
});

describe('слова и названия', () => {
  it('дефисное слово — одно слово', () => {
    expect(countWords('Северо-западный ветер и чай')).toBe(4);
    expect(countWords('Ночь — громче наших слов')).toBe(4);
  });

  it('пример из ТЗ: осенний парк и какао', () => {
    const t = 'Гуляли по парку, жёлтые листья, пили какао.';
    expect(suggestTitle(t, analyzeText(t), 'autumn').title).toBe('Осенний парк и какао');
  });

  it('пример из ТЗ: ночь в офисе перед сдачей', () => {
    const t = 'Заканчивали проект ночью в офисе.';
    expect(suggestTitle(t, analyzeText(t), 'autumn').title).toBe('Ночь в офисе перед сдачей');
  });

  it('незнакомый сюжет даёт 3–7 слов', () => {
    for (const t of ['Да.', 'Мы просто смотрели, как ползёт по стеклу улитка, и молчали очень долго и очень хорошо', 'Ура']) {
      const n = countWords(suggestTitle(t, analyzeText(t), 'summer').title);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('текст', () => {
  it('учитывает отрицание «совсем не грустно»', () => {
    const a = analyzeText('Было совсем не грустно.');
    expect(a.negativeWords).toHaveLength(0);
    expect(a.negations[0]).toBe('совсем не грустно');
    expect(a.valence).toBeGreaterThan(0);
  });
});

describe('фото', () => {
  it('находит детали справа и тёплую палитру', () => {
    const w = 30;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const stripe = x > 20 && (x + y) % 2 === 0;
        data[i] = stripe ? 250 : 200;
        data[i + 1] = stripe ? 200 : 140;
        data[i + 2] = stripe ? 120 : 60;
        data[i + 3] = 255;
      }
    }
    const f = analyzePixels(data, w, h);
    expect(f.warmth).toBeGreaterThan(0.3);
    expect(f.detailGrid[2]).toBeGreaterThan(f.detailGrid[0]);
    expect(f.palette.length).toBeGreaterThan(0);
  });
});

describe('аудио', () => {
  for (const bpm of [62, 76, 136]) {
    it(`измеряет темп щелчкового трека ${bpm} BPM`, () => {
      const sr = 22050;
      const sig = new Float32Array(sr * 20);
      const step = (60 / bpm) * sr;
      for (let b = 0; b * step < sig.length; b++) {
        const s = Math.floor(b * step);
        for (let i = 0; i < 2000 && s + i < sig.length; i++) sig[s + i] += Math.sin(i * 0.15) * Math.exp(-i / 300) * 0.8;
      }
      const f = analyzeSignal(sig, sr);
      expect(f.bpm).not.toBeNull();
      expect(Math.abs((f.bpm as number) - bpm)).toBeLessThanOrEqual(2);
    });
  }
});

describe('генератор', () => {
  it('детерминирован', () => {
    const a = generateRelive(base());
    const b = generateRelive(base());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('держит 3–5 сцен и 15–30 секунд', () => {
    for (const bpm of [62, 76, 136]) {
      for (const n of [1, 2, 5]) {
        const g = generateRelive(base({ photos: Array.from({ length: n }, () => photo()), song: buildSongProfile({ source: 'description', title: 't', artist: '', genre: '', mood: '', bpm }) }));
        expect(g.scenes.length).toBeGreaterThanOrEqual(3);
        expect(g.scenes.length).toBeLessThanOrEqual(5);
        expect(g.totalMs).toBeGreaterThanOrEqual(15000);
        expect(g.totalMs).toBeLessThanOrEqual(30000);
      }
    }
  });

  it('замена трека 62 → 136 BPM меняет ритм и Energy, но не палитру и подпись', () => {
    const slow = generateRelive(base());
    const fast = generateRelive(
      base({ song: buildSongProfile({ source: 'description', title: 'Пульс', artist: 'Демо', genre: 'электроника', mood: 'энергичный драйв', bpm: 136 }) }),
    );
    expect(fast.params.energy).toBeGreaterThan(slow.params.energy);
    expect(fast.art.transitionMs).toBeLessThan(slow.art.transitionMs);
    expect(fast.art.pulseMs).toBeLessThan(slow.art.pulseMs);
    expect(fast.art.glowColor).toBe(slow.art.glowColor);
    expect(fast.art.captionAlign).toBe(slow.art.captionAlign);
    expect(fast.title).toBe(slow.title);
    // eslint-disable-next-line no-console
    console.log('62 BPM', slow.params, slow.art.style, slow.art.transitionMs, slow.totalMs, slow.title);
    // eslint-disable-next-line no-console
    console.log('136 BPM', fast.params, fast.art.style, fast.art.transitionMs, fast.totalMs);
  });

  it('смена обложки меняет палитру и сторону подписи', () => {
    const a = generateRelive(base());
    const b = generateRelive(base({ coverIndex: 1, photos: [photo(), photo({ palette: [{ hex: '#3E6FB0', weight: 0.5, h: 214, s: 0.48, l: 0.47 }, { hex: '#DDE6F0', weight: 0.5, h: 212, s: 0.38, l: 0.9 }], warmth: -0.5, detailGrid: [1, 0.5, 0.2, 0.9, 0.4, 0.1, 0.7, 0.3, 0.1] })] }));
    expect(b.art.glowColor).not.toBe(a.art.glowColor);
    expect(b.art.captionAlign).not.toBe(a.art.captionAlign);
  });

  it('без песни перераспределяет вес', () => {
    const g = generateRelive(base({ song: null }));
    const parts = g.paramDetails.energy.parts;
    expect(parts.some((p) => p.source === 'music')).toBe(false);
    expect(parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 1);
  });
});
