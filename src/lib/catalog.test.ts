/**
 * Каталог настроений и выбор источника музыки.
 * Декодирование здесь — автоматическая проверка файлов (mpg123), а не прослушивание человеком.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSignal } from '../engine/audioAnalysis';
import { catalogSong, effectiveMood, resolveMusic } from '../services/musicSource';
import { MOODS, TRACKS, inferMood, trackForMood, trackOf } from './catalog';
import type { AudioFeatures, SongInput } from './types';

const root = join(__dirname, '..', '..');
const song = (over: Partial<SongInput>): SongInput => ({ source: 'catalog', title: '', artist: '', genre: '', mood: '', ...over });

describe('каталог настроений', () => {
  it('шесть настроений — шесть разных треков со стабильными id', () => {
    expect(MOODS.map((m) => m.emoji)).toEqual(['🌿', '☀️', '🫶', '🌧', '🎉', '🌌']);
    expect(MOODS.map((m) => m.label)).toEqual(['Спокойствие', 'Радость', 'Нежность', 'Ностальгия', 'Драйв', 'Мечтательность']);
    expect(new Set(MOODS.map((m) => m.trackId)).size).toBe(6);
    expect(TRACKS.map((t) => t.id)).toEqual([
      'km-meditation-impromptu-02',
      'km-carefree',
      'km-gymnopedie-1',
      'km-bittersweet',
      'km-raving-energy-faster',
      'km-floating-cities',
    ]);
    for (const m of MOODS) expect(trackForMood(m.id).mood).toBe(m.id);
  });

  it('у каждого трека — автор, лицензия, страница источника и запись в CREDITS', () => {
    const credits = readFileSync(join(root, 'docs', 'CREDITS.md'), 'utf8');
    for (const t of TRACKS) {
      expect(t.artist).toBe('Kevin MacLeod');
      expect(t.license).toBe('CC BY 4.0');
      expect(t.sourcePage).toMatch(/^https:\/\/incompetech\.com\/.+isrc=/);
      expect(t.url).toBe(`/audio/${t.id}.mp3`);
      expect(credits).toContain(`${t.id}.mp3`);
      expect(credits).toContain(t.isrc);
    }
  });

  it('настроение по словам старого описания или текста', () => {
    expect(inferMood('энергичный драйв, электроника')).toBe('drive');
    expect(inferMood('Весь вечер шёл дождь')).toBe('nostalgia');
    expect(inferMood('камерное фортепиано, тихое')).toBe('tender');
    expect(inferMood('Просто день')).toBe('calm');
  });
});

describe('файлы каталога (автоматическое декодирование)', () => {
  const measured = new Map<string, AudioFeatures & { peak: number; sampleRate: number }>();

  beforeAll(async () => {
    for (const t of TRACKS) {
      const dec = new MPEGDecoder();
      await dec.ready;
      const r = dec.decode(new Uint8Array(readFileSync(join(root, 'public', 'audio', `${t.id}.mp3`))));
      dec.free();
      const n = r.samplesDecoded;
      const mono = new Float32Array(n);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const v = (r.channelData[0][i] + (r.channelData[1] ?? r.channelData[0])[i]) / 2;
        mono[i] = v;
        peak = Math.max(peak, Math.abs(r.channelData[0][i]), Math.abs((r.channelData[1] ?? r.channelData[0])[i]));
      }
      measured.set(t.id, { ...analyzeSignal(mono, r.sampleRate), peak, sampleRate: r.sampleRate });
    }
  }, 60000);

  it('все шесть декодируются: ~36 с, без перегрузки, со звуком', () => {
    for (const t of TRACKS) {
      const m = measured.get(t.id)!;
      expect(m.sampleRate).toBeGreaterThanOrEqual(44100);
      expect(Math.abs(m.durationSec - t.durationSec)).toBeLessThan(0.5);
      expect(m.peak).toBeLessThan(0.9); // ≈ −1 dBFS: пики под потолком
      expect(m.rms).toBeGreaterThan(0.03); // не тишина
    }
  });

  it('«Драйв» энергичнее и плотнее «Спокойствия»: монтажу есть что измерять', () => {
    const calm = measured.get('km-meditation-impromptu-02')!;
    const drive = measured.get('km-raving-energy-faster')!;
    expect(drive.peaksPerSec).toBeGreaterThan(calm.peaksPerSec);
    expect(drive.energy).toBeGreaterThan(calm.energy);
  });
});

describe('единый выбор источника', () => {
  it('настроение без своей музыки → композиция этого настроения', () => {
    const r = resolveMusic(catalogSong(trackForMood('joy')), 'joy');
    expect(r).toMatchObject({ kind: 'catalog', url: '/audio/km-carefree.mp3', note: null });
  });

  it('без выбора настроения композиция подбирается по тексту — с честной пометкой', () => {
    const r = resolveMusic(null, null, 'Концерт, бас бил прямо в грудь, танцевали до утра');
    expect(r.kind).toBe('catalog');
    expect(r.track.id).toBe('km-raving-energy-faster');
    expect(r.note).toContain('по тексту');
  });

  it('свой файл главнее: смена настроения меняет подачу, но не трек', () => {
    const file = song({ source: 'file', title: 'Наша песня', fileBlobId: 'audio-1', fileName: 'our.mp3' });
    for (const mood of ['tender', 'drive'] as const) {
      const r = resolveMusic(file, mood);
      expect(r.kind).toBe('file');
      expect(r.blobId).toBe('audio-1');
      expect(r.mood).toBe(mood);
    }
  });

  it('прямая ссылка играет сама, а запасной — трек настроения', () => {
    const r = resolveMusic(song({ source: 'link', url: 'https://example.com/day.mp3' }), 'dream');
    expect(r).toMatchObject({ kind: 'link', url: 'https://example.com/day.mp3' });
    expect(r.track.id).toBe('km-floating-cities');
  });

  it('страница Spotify/YouTube: «Открыть оригинал» + понятно, какой локальный трек звучит', () => {
    const r = resolveMusic(song({ source: 'link', url: 'https://open.spotify.com/track/abc' }), 'nostalgia');
    expect(r.kind).toBe('catalog');
    expect(r.serviceUrl).toBe('https://open.spotify.com/track/abc');
    expect(r.note).toContain('Bittersweet');
    expect(r.note).toContain('Ностальгия');
  });

  it('старая запись «по описанию» открывается: звучит композиция с явной пометкой, ввод не меняется', () => {
    const old = song({ source: 'description', title: 'Капли на стекле', genre: 'камерное фортепиано', mood: 'тихое, нежное', bpm: 62 });
    const frozen = JSON.stringify(old);
    const r = resolveMusic(old, null);
    expect(r.kind).toBe('catalog');
    expect(r.track.id).toBe('km-gymnopedie-1');
    expect(r.note).toContain('синтез');
    expect(JSON.stringify(old)).toBe(frozen);
    expect(effectiveMood(old, null)).toBe('tender');
  });

  it('запись каталога хранит стабильный trackId и открывается по нему', () => {
    const s = catalogSong(trackForMood('dream'));
    expect(s.trackId).toBe('km-floating-cities');
    expect(trackOf(s.trackId)!.title).toBe('Floating Cities');
    expect(resolveMusic(s, null).track.id).toBe('km-floating-cities');
  });
});
