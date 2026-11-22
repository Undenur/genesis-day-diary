/** Сравнение двух версий RE:LIVE — что именно изменила новая песня, обложка или текст. */
import type { Generation } from './types';

const STYLE = { impressionism: 'импрессионизм', kandinsky: 'Кандинский', minimal: 'минимализм' } as const;
const EFFECT = {
  'amber-halo': 'янтарные ореолы',
  'silver-shimmer': 'серебристое мерцание',
  'light-particles': 'светлые частицы',
  'organic-forms': 'органические формы',
  'muted-reflections': 'отражения',
} as const;

export interface DiffRow {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

const LEAD = { light: 'свет', geometry: 'геометрия', air: 'воздух', texture: 'фактура' } as const;
const midShots = (g: Generation) => g.scenes.filter((x) => x.kind === 'middle').reduce((n, x) => n + x.shots.length, 0);

const s = (ms: number) => (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';

export function diffGenerations(a: Generation, b: Generation): DiffRow[] {
  const rows: [string, string, string][] = [
    ['Название', a.title, b.title],
    ['Темп', `${Math.round(60000 / a.beatMs)} BPM`, `${Math.round(60000 / b.beatMs)} BPM`],
    ['Пульс свечения', s(a.art.pulseMs), s(b.art.pulseMs)],
    ['Переход', s(a.art.transitionMs), s(b.art.transitionMs)],
    ['Длина истории', `${s(a.totalMs)} · ${a.scenes.length} сцены`, `${s(b.totalMs)} · ${b.scenes.length} сцены`],
    ['Такты сцен', a.scenes.map((x) => x.bars).join('·'), b.scenes.map((x) => x.bars).join('·')],
    ['Warmth', String(a.params.warmth), String(b.params.warmth)],
    ['Energy', String(a.params.energy), String(b.params.energy)],
    ['Density', String(a.params.density), String(b.params.density)],
    ['Nostalgia', String(a.params.nostalgia), String(b.params.nostalgia)],
    ['Intimacy', String(a.params.intimacy), String(b.params.intimacy)],
    ['Приём', STYLE[a.art.style], STYLE[b.art.style]],
    ['Ведущий слой', LEAD[a.art.lead ?? 'light'], LEAD[b.art.lead ?? 'light']],
    ['Пульс', a.art.pulseMode === 'attack' ? 'по атакам трека' : 'спокойное дыхание', b.art.pulseMode === 'attack' ? 'по атакам трека' : 'спокойное дыхание'],
    ['Кадров в середине', String(midShots(a)), String(midShots(b))],
    ['Эффекты', a.art.effects.map((e) => EFFECT[e]).join(', ') || '—', b.art.effects.map((e) => EFFECT[e]).join(', ') || '—'],
    ['Амплитуда свечения', `${Math.round(a.art.glowAmp * 100)}%`, `${Math.round(b.art.glowAmp * 100)}%`],
    ['Движение камеры', `${Math.round(a.art.motionAmp * 100)}%`, `${Math.round(b.art.motionAmp * 100)}%`],
    ['Зерно', `${Math.round(a.art.grain * 100)}%`, `${Math.round(b.art.grain * 100)}%`],
    ['Цвет свечения', a.art.glowColor, b.art.glowColor],
    ['Подпись', a.art.captionAlign === 'left' ? 'слева' : 'справа', b.art.captionAlign === 'left' ? 'слева' : 'справа'],
    ['Фразы', a.captions.join(' / ') || '—', b.captions.join(' / ') || '—'],
  ];
  return rows.map(([label, before, after]) => ({ label, before, after, changed: before !== after }));
}
