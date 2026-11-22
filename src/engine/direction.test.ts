import { describe, expect, it } from 'vitest';
import type { PhotoFeatures } from '../lib/types';
import { countWords } from '../lib/util';
import { buildSongProfile } from './audioAnalysis';
import { generateRelive, type GeneratorInput } from './generator';
import { TARGET_NORMAL, contrastRatio, relLuminance, shadeFor } from './legibility';

const zone = (p90: number, detail: number) => ({ p90, mean: p90 * 0.7, detail });

function photo(over: Partial<PhotoFeatures> = {}): PhotoFeatures {
  return {
    width: 1080,
    height: 1440,
    palette: [
      { hex: '#C08A3E', weight: 0.34, h: 36, s: 0.52, l: 0.5 },
      { hex: '#3B2A22', weight: 0.3, h: 20, s: 0.27, l: 0.18 },
      { hex: '#8FA7C4', weight: 0.2, h: 213, s: 0.32, l: 0.66 },
    ],
    brightness: 0.45,
    saturation: 0.4,
    contrast: 0.45,
    warmth: 0.3,
    detailGrid: [0.2, 0.4, 0.9, 0.3, 0.6, 1, 0.2, 0.5, 0.8],
    activity: 0.4,
    regionBrightness: { left: 0.4, right: 0.6, bottom: 0.35, top: 0.6 },
    zones: { left: zone(0.2, 0.3), right: zone(0.5, 0.8) },
    light: { x: 0.83, y: 0.17, strength: 0.5 },
    openness: 0.2,
    ...over,
  };
}

const CALM = 'Весь вечер шёл дождь, мы сидели у окна в кофейне. Чай остывал неспешно, было тихо. Последним запомнился запах корицы на выходе.';
const base = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({
  text: CALM,
  date: '2025-11-22',
  authorTitle: '',
  season: 'autumn',
  weather: 'rain',
  placeName: '',
  photos: [photo(), photo({ zones: { left: zone(0.6, 0.7), right: zone(0.1, 0.2) } })],
  coverIndex: 0,
  song: buildSongProfile({ source: 'description', title: 'Капли', artist: '', genre: 'камерное фортепиано', mood: 'тихое', bpm: 62 }),
  songLabel: '',
  ...over,
});

const electro = buildSongProfile({
  source: 'file', title: 'Пульс', artist: '', genre: 'электроника', mood: 'драйв',
  audio: { durationSec: 24, rms: 0.08, energy: 0.8, peaksPerSec: 2.4, bpm: 136, bpmConfidence: 0.85, dynamicRangeDb: 22, beatOffsetSec: 0.11 },
});

describe('читаемость подписи', () => {
  it('на белом снегу подложка даёт не меньше 4,5:1', () => {
    const shadeLum = relLuminance('#0A0D14');
    const r = shadeFor(0.95, shadeLum, TARGET_NORMAL);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    expect(r.alpha).toBeGreaterThan(0.6);
  });
  it('тёмное окно не заливается лишней подложкой', () => {
    const r = shadeFor(0.03, relLuminance('#0A0D14'));
    expect(r.alpha).toBeLessThanOrEqual(0.2);
    expect(r.ratio).toBeGreaterThan(7);
  });
  it('контраст считается по WCAG', () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 0);
    expect(relLuminance('#FFFFFF')).toBeCloseTo(1, 3);
  });
  it('каждая сцена получает рассчитанную подложку ≥ 4,5:1 даже на светлом кадре', () => {
    const snow = photo({ brightness: 0.9, zones: { left: zone(0.92, 0.2), right: zone(0.97, 0.3) }, palette: [{ hex: '#F4F7FB', weight: 0.7, h: 210, s: 0.3, l: 0.96 }, { hex: '#8FA7C4', weight: 0.3, h: 213, s: 0.32, l: 0.66 }] });
    const g = generateRelive(base({ photos: [snow] }));
    for (const s of g.scenes) expect(s.contrast!).toBeGreaterThanOrEqual(4.5);
  });
  it('подпись не прыгает между сценами без заметной пользы', () => {
    const p = photo({ zones: { left: zone(0.2, 0.32), right: zone(0.2, 0.3) } });
    const g = generateRelive(base({ photos: [p, p, p] }));
    expect(new Set(g.scenes.map((s) => s.textSide)).size).toBe(1);
  });
});

describe('режиссура', () => {
  it('у кадра один ведущий приём, остальные ≤ 0,4', () => {
    const g = generateRelive(base());
    const it = g.art.intensity!;
    const vals = [it.light, it.geometry, it.air];
    expect(vals.filter((v) => v === 1).length + (g.art.lead === 'texture' ? 1 : 0)).toBeGreaterThanOrEqual(1);
    for (const v of vals) expect(v === 1 || v <= 0.4).toBe(true);
  });
  it('соседние значения Emotion DNA меняют силу слоёв постепенно', () => {
    const songs = [0.4, 0.43, 0.46].map((energy) => ({ ...electro, energy, attackDensity: 0.3, texture: 'acoustic' as const }));
    const gs = songs.map((song) => generateRelive(base({ song, weather: '' })));
    for (let i = 1; i < gs.length; i++) {
      const a = gs[i - 1].art.intensity!;
      const b = gs[i].art.intensity!;
      if (gs[i].art.lead !== gs[i - 1].art.lead) continue;
      expect(Math.abs(a.geometry - b.geometry)).toBeLessThan(0.2);
      expect(Math.abs(a.light - b.light)).toBeLessThan(0.2);
    }
  });
  it('финал оставляет время прочесть фразу', () => {
    const g = generateRelive(base());
    const fin = g.scenes[g.scenes.length - 1];
    expect(fin.durationMs).toBeGreaterThanOrEqual(1800 + countWords(fin.caption ?? '') * 330 - 1);
    expect(g.totalMs).toBeLessThanOrEqual(30000);
  });
  it('спокойный текст + энергичная музыка: монтаж плотнее, композиция та же', () => {
    const slow = generateRelive(base());
    const fast = generateRelive(base({ song: electro }));
    const mid = (g: typeof slow) => g.scenes.filter((s) => s.kind === 'middle').flatMap((s) => s.shots);
    expect(mid(fast).length).toBeGreaterThan(mid(slow).length);
    expect(mid(fast).some((s) => s.cutMs)).toBe(true);
    expect(fast.art.titleSize - slow.art.titleSize).toBeLessThanOrEqual(3);
    expect(fast.art.pulseMode).toBe('attack');
    expect(fast.art.beatOffsetMs).toBe(110);
    expect(slow.art.pulseMode).toBe('breath');
  });
  it('открытое пространство даёт неторопливую панораму в открытии', () => {
    const g = generateRelive(base({ photos: [photo({ openness: 0.7 })] }));
    expect(g.scenes[0].shots[0].camera).toBe('pan');
  });
  it('тёмный кадр получает меньше свечения, чем светлый', () => {
    const dark = generateRelive(base({ photos: [photo({ brightness: 0.12 })] }));
    const bright = generateRelive(base({ photos: [photo({ brightness: 0.8 })] }));
    expect(dark.art.glowRoom!).toBeLessThan(bright.art.glowRoom!);
    expect(dark.art.vignette!).toBeGreaterThan(bright.art.vignette!);
  });
});

describe('причины атмосферы', () => {
  it('до трёх причин: фраза, цвет, темп — с источником темпа', () => {
    const g = generateRelive(base());
    expect(g.reasons!.length).toBeLessThanOrEqual(3);
    expect(g.reasons!.map((r) => r.kind)).toEqual(['phrase', 'color', 'tempo']);
    expect(g.reasons![0].text).toMatch(/неспешно/);
    expect(g.reasons![2].text).toMatch(/указаны вручную/);
    const measured = generateRelive(base({ song: electro }));
    expect(measured.reasons!.find((r) => r.kind === 'tempo')!.text).toMatch(/измерены по файлу/);
    const desc = generateRelive(base({ song: buildSongProfile({ source: 'description', title: 'x', artist: '', genre: 'поп', mood: 'радостное' }) }));
    expect(desc.reasons!.find((r) => r.kind === 'tempo')!.text).toMatch(/оценка по описанию.*предположение/);
    const none = generateRelive(base({ song: null }));
    expect(none.reasons!.find((r) => r.kind === 'tempo')!.text).toMatch(/динамики текста/);
  });
  it('причина про переход совпадает с применённым переходом', () => {
    const g = generateRelive(base());
    const s = (g.art.transitionMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    expect(g.reasons![0].text).toContain(s);
  });
});

describe('настроение автора и звучащий трек — разные источники', () => {
  const mid = (g: ReturnType<typeof generateRelive>) => g.scenes.filter((s) => s.kind === 'middle').flatMap((s) => s.shots);

  it('«Нежность» + быстрый трек: камерная подача и быстрый монтаж сосуществуют', () => {
    const tender = generateRelive(base({ mood: 'tender', song: electro, songLabel: '«Пульс»' }));
    const drive = generateRelive(base({ mood: 'drive', song: electro, songLabel: '«Пульс»' }));
    const slow = generateRelive(base({ mood: 'tender' }));
    expect(tender.reasons![0].kind).toBe('mood');
    expect(tender.reasons![0].text).toContain('Нежность');
    expect(tender.explanations.some((e) => e.text.includes('сосуществуют'))).toBe(true);
    // Камерность — от настроения: Intimacy выше, чем у «Драйва» с тем же треком.
    expect(tender.params.intimacy).toBeGreaterThan(drive.params.intimacy);
    // Темп монтажа — от трека: настроение его не замедляет.
    expect(tender.params.energy).toBe(drive.params.energy);
    expect(mid(tender).length).toBeGreaterThan(mid(slow).length);
    expect(tender.art.pulseMode).toBe('attack');
  });

  it('цвет всегда из снимка: смена настроения и трека не трогает палитру', () => {
    const a = generateRelive(base({ mood: 'calm' }));
    const b = generateRelive(base({ mood: 'drive', song: electro }));
    expect(b.art.palette).toEqual(a.art.palette);
    expect(b.art.glowColor).toBe(a.art.glowColor);
    // А ритм сцен меняется вместе с треком.
    expect(b.beatMs).not.toBe(a.beatMs);
    expect(b.scenes.map((s) => s.durationMs)).not.toEqual(a.scenes.map((s) => s.durationMs));
  });

  it('без выбора настроения причины прежние, вес настроения не учитывается', () => {
    const g = generateRelive(base());
    expect(g.reasons!.some((r) => r.kind === 'mood')).toBe(false);
    expect(g.paramDetails.intimacy.parts.some((p) => p.source === 'mood')).toBe(false);
    expect(g.mood ?? null).toBeNull();
  });
});
