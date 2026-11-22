/** Центральные типы MOMENTA. Все представления (архив, хронология, музыка, карта, Countdown) ссылаются на Memory.id. */

export type Category = 'travel' | 'meeting' | 'holiday' | 'study' | 'personal';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Weather = '' | 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'wind' | 'storm';
export type Scale = 'major' | 'minor';

export interface Place {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

/** Ввод песни пользователем: файл, ссылка или описание. */
export interface SongInput {
  source: 'file' | 'link' | 'description';
  title: string;
  artist: string;
  genre: string;
  /** Характер звучания: «тихое», «энергичное», «мечтательное»… */
  mood: string;
  year?: number;
  bpm?: number;
  scale?: Scale;
  url?: string;
  fileBlobId?: string;
  fileName?: string;
  fileType?: string;
  /** Результат измерения файла (кешируется вместе с песней). */
  audio?: AudioFeatures;
}

/** Измерения аудиосигнала (Web Audio API). */
export interface AudioFeatures {
  durationSec: number;
  /** Средний RMS, 0..1 */
  rms: number;
  /** Нормализованная громкость/энергия 0..1 */
  energy: number;
  /** Пики энергии в секунду */
  peaksPerSec: number;
  bpm: number | null;
  bpmConfidence: number;
  /** Разница громких и тихих мест, дБ */
  dynamicRangeDb: number;
}

export type ValueSource = 'manual' | 'measured' | 'description' | 'default';

/** Профиль песни для Soundtrack Sync: что реально известно и откуда. */
export interface SongProfile {
  bpm: number;
  bpmSource: ValueSource;
  bpmConfidence: number;
  energy: number;
  energySource: ValueSource;
  /** Плотность атак 0..1 */
  attackDensity: number;
  scale: Scale;
  scaleSource: ValueSource;
  texture: SynthTexture;
  softness: number;
  year?: number;
  notes: string[];
}

export type SynthTexture = 'piano' | 'ambient' | 'electronic' | 'acoustic';

export interface PaletteColor {
  hex: string;
  weight: number;
  h: number;
  s: number;
  l: number;
}

/** Признаки фото, полученные через Canvas. */
export interface PhotoFeatures {
  width: number;
  height: number;
  palette: PaletteColor[];
  brightness: number;
  saturation: number;
  contrast: number;
  /** -1 холодный … +1 тёплый */
  warmth: number;
  /** 3×3 карта деталей (по строкам), 0..1 */
  detailGrid: number[];
  activity: number;
  /** Яркость левой/правой/нижней трети для затемнения под текстом */
  regionBrightness: { left: number; right: number; bottom: number; top: number };
}

export interface PhotoRef {
  id: string;
  blobId: string;
  thumbBlobId: string;
  name: string;
  alt: string;
  width: number;
  height: number;
  features: PhotoFeatures;
}

export interface VoiceNoteRef {
  blobId: string;
  durationSec: number;
  mime: string;
  createdAt: string;
}

/** Ввод мастера и редактора — общий для черновика и сохранённого дня. */
export interface MemoryInput {
  date: string;
  title: string;
  text: string;
  category: Category | '';
  season: Season;
  seasonManual: boolean;
  weather: Weather;
  place: Place | null;
  photos: PhotoRef[];
  coverId: string | null;
  song: SongInput | null;
  voice: VoiceNoteRef | null;
  countdownId?: string;
}

export type ParamKey = 'warmth' | 'energy' | 'density' | 'nostalgia' | 'intimacy';

export interface ParamPart {
  source: 'text' | 'photo' | 'music';
  weight: number;
  value: number;
  estimated: boolean;
  note: string;
}

export interface ParamDetail {
  value: number;
  parts: ParamPart[];
}

export type ArtStyle = 'impressionism' | 'kandinsky' | 'minimal';
export type ArtEffect = 'amber-halo' | 'silver-shimmer' | 'light-particles' | 'organic-forms' | 'muted-reflections';

export interface ArtDirection {
  style: ArtStyle;
  effects: ArtEffect[];
  palette: string[];
  glowColor: string;
  accent: string;
  grain: number;
  softness: number;
  glowAmp: number;
  motionAmp: number;
  particleCount: number;
  tiltDeg: number;
  titleGap: number;
  titleSize: number;
  transitionMs: number;
  pulseMs: number;
  captionAlign: 'left' | 'right';
  shadeStrength: number;
  photoFilter: string;
}

export interface Shot {
  photoIndex: number;
  startMs: number;
  endMs: number;
  fromScale: number;
  toScale: number;
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
}

export interface Scene {
  kind: 'opening' | 'middle' | 'finale';
  startMs: number;
  durationMs: number;
  bars: number;
  caption: string | null;
  shots: Shot[];
}

export interface Explanation {
  topic: 'title' | 'palette' | 'param' | 'style' | 'effect' | 'rhythm' | 'layout' | 'caption' | 'sound';
  source: 'text' | 'photo' | 'music' | 'author' | 'estimate';
  text: string;
}

export interface Generation {
  algorithmVersion: string;
  seed: number;
  inputHash: string;
  title: string;
  titleSource: 'author' | 'generator';
  suggestedTitle: string;
  params: Record<ParamKey, number>;
  paramDetails: Record<ParamKey, ParamDetail>;
  art: ArtDirection;
  scenes: Scene[];
  totalMs: number;
  beatMs: number;
  captions: string[];
  explanations: Explanation[];
  song: SongProfile | null;
  textSummary: TextSummary;
}

export interface TextSummary {
  places: string[];
  events: string[];
  people: string[];
  details: string[];
  timeOfDay: string | null;
  seasonWords: string[];
  calmWords: string[];
  movementWords: string[];
  negations: string[];
  dynamics: number;
  valence: number;
}

export interface Memory extends MemoryInput {
  id: string;
  schemaVersion: number;
  category: Category;
  generation: Generation;
  visibility: 'private';
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CountdownEvent {
  id: string;
  title: string;
  /** ISO локальное: 'YYYY-MM-DDTHH:mm' */
  datetime: string;
  coverBlobId: string | null;
  description: string;
  category: Category;
  memoryId: string | null;
  createdAt: string;
}

export interface ShareLogEntry {
  id: string;
  memoryId: string;
  at: string;
  items: string[];
  method: 'share' | 'download';
}
