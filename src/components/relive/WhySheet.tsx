/** «Почему такая атмосфера?» — объяснение решений генератора с фактическими измерениями этой записи. */
import { AudioLines, Camera, Gauge, Heart, Palette, PenLine, Quote, Sparkles } from 'lucide-react';
import { WEIGHTS } from '../../engine/generator';
import type { Explanation, Generation, ParamKey, Reason } from '../../lib/types';
import { colorName, hexToRgb, plural, rgbToHsl } from '../../lib/util';
import { Sheet } from '../ui';

export const PARAM_LABEL: Record<ParamKey, { name: string; hint: string }> = {
  warmth: { name: 'Warmth', hint: 'тёплые ↔ холодные тона' },
  energy: { name: 'Energy', hint: 'скорость движения' },
  density: { name: 'Density', hint: 'количество деталей' },
  nostalgia: { name: 'Nostalgia', hint: 'зерно и мягкость' },
  intimacy: { name: 'Intimacy', hint: 'близость кадра и подписи' },
};

const SRC_LABEL = { text: 'текст', photo: 'фото', music: 'музыка', mood: 'настроение' } as const;
const STYLE_LABEL = { impressionism: 'Импрессионизм: рассеянный свет', kandinsky: 'Кандинский: геометрия ритма', minimal: 'Минимализм с воздухом' } as const;

const SOURCE_ICON: Record<Explanation['source'], typeof Camera> = {
  text: PenLine,
  photo: Camera,
  music: AudioLines,
  author: PenLine,
  estimate: Gauge,
};

export function ParamBars({ g, compact }: { g: Generation; compact?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {(Object.keys(WEIGHTS) as ParamKey[]).map((k) => (
        <li key={k}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold">
              {PARAM_LABEL[k].name} <span className="font-normal text-muted">· {PARAM_LABEL[k].hint}</span>
            </span>
            <span className="tabular-nums text-[15px] font-semibold">{g.params[k]}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-night" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.params[k]} aria-label={PARAM_LABEL[k].name}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${g.params[k]}%` }} />
          </div>
          {!compact && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {g.paramDetails[k].parts
                .map((p) => `${Math.round(p.weight * 100)}% ${SRC_LABEL[p.source]} ${p.value.toLocaleString('ru-RU')}${p.estimated ? ' (оценка по описанию)' : ''} — ${p.note}`)
                .join('; ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const REASON_ICON: Record<Reason['kind'], typeof Camera> = { mood: Heart, phrase: Quote, color: Palette, tempo: AudioLines };

/** Для дней версии до 1.1 причины собираются из сохранённых объяснений — тех же, что были применены. */
function reasonsOf(g: Generation): Reason[] {
  if (g.reasons?.length) return g.reasons;
  const out: Reason[] = [];
  const cap = g.explanations.find((e) => e.topic === 'caption' && e.text.startsWith('Подписи'));
  if (cap) out.push({ kind: 'phrase', text: cap.text });
  const pal = g.explanations.find((e) => e.topic === 'palette');
  if (pal) out.push({ kind: 'color', text: pal.text, color: g.art.glowColor });
  const rhythm = g.explanations.find((e) => e.topic === 'rhythm');
  if (rhythm) out.push({ kind: 'tempo', text: rhythm.text });
  return out.slice(0, 3);
}

export function WhySheet({ open, onClose, g }: { open: boolean; onClose: () => void; g: Generation }) {
  const reasons = reasonsOf(g);
  const sourceColor = g.reasons?.find((r) => r.kind === 'color')?.color ?? g.art.glowColor;
  return (
    <Sheet open={open} onClose={onClose} title="Почему такая атмосфера?" wide>
      <div className="flex flex-col gap-5 pb-2">
        <section aria-label="Главные причины">
          <ul className="flex flex-col gap-3">
            {reasons.map((r, i) => {
              const Icon = REASON_ICON[r.kind];
              return (
                <li key={i} className="flex items-start gap-3 rounded-2xl bg-night p-3.5 text-[15px] leading-snug">
                  {r.color ? (
                    <span className="mt-0.5 h-7 w-7 shrink-0 rounded-lg ring-1 ring-white/20" style={{ background: r.color }} aria-hidden="true" />
                  ) : (
                    <Icon size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  )}
                  <span>{r.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <details className="group rounded-2xl border border-line px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-semibold">
            Подробный расчёт
            <span className="text-[13px] font-normal text-muted group-open:hidden">показать</span>
          </summary>
          <div className="mt-3 flex flex-col gap-6">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles size={18} className="text-accent" aria-hidden="true" /> {STYLE_LABEL[g.art.style]}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {g.explanations.map((e, i) => {
              const Icon = SOURCE_ICON[e.source];
              return (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
                  <Icon size={18} className="mt-0.5 text-muted" aria-label={e.source === 'photo' ? 'по фото' : e.source === 'music' ? 'по музыке' : e.source === 'estimate' ? 'расчёт' : 'по тексту'} />
                  <span>{e.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Gauge size={18} className="text-accent" aria-hidden="true" /> Emotion DNA
          </h3>
          <ParamBars g={g} />
        </section>
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Palette size={18} className="text-accent" aria-hidden="true" /> Палитра обложки
          </h3>
          <ul className="flex flex-wrap gap-3">
            {g.art.palette.map((hex) => {
              const [h, s, l] = rgbToHsl(...hexToRgb(hex));
              return (
                <li key={hex} className="flex items-center gap-2 rounded-xl bg-night px-2.5 py-2 text-[13px]">
                  <span className="h-6 w-6 rounded-md ring-1 ring-white/15" style={{ background: hex }} aria-hidden="true" />
                  <span>
                    {colorName(h, s, l)} <span className="text-muted">{hex}</span>
                    {hex === sourceColor && <span className="ml-1 text-accent">· свечение</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="text-[12px] text-muted">
          Алгоритм {g.algorithmVersion} · seed {g.seed} · {g.scenes.length} {plural(g.scenes.length, ['сцена', 'сцены', 'сцен'])} · {(g.totalMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с. Тот же ввод всегда даёт тот же результат.
        </p>
          </div>
        </details>
      </div>
    </Sheet>
  );
}
