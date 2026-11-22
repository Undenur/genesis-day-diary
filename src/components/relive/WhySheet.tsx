/** «Почему такая атмосфера?» — объяснение решений генератора с фактическими измерениями этой записи. */
import { AudioLines, Camera, Gauge, Palette, PenLine, Sparkles } from 'lucide-react';
import { WEIGHTS } from '../../engine/generator';
import type { Explanation, Generation, ParamKey } from '../../lib/types';
import { colorName, hexToRgb, rgbToHsl } from '../../lib/util';
import { Sheet } from '../ui';

export const PARAM_LABEL: Record<ParamKey, { name: string; hint: string }> = {
  warmth: { name: 'Warmth', hint: 'тёплые ↔ холодные тона' },
  energy: { name: 'Energy', hint: 'скорость движения' },
  density: { name: 'Density', hint: 'количество деталей' },
  nostalgia: { name: 'Nostalgia', hint: 'зерно и мягкость' },
  intimacy: { name: 'Intimacy', hint: 'близость кадра и подписи' },
};

const SRC_LABEL = { text: 'текст', photo: 'фото', music: 'музыка' } as const;
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

export function WhySheet({ open, onClose, g }: { open: boolean; onClose: () => void; g: Generation }) {
  return (
    <Sheet open={open} onClose={onClose} title="Почему такая атмосфера?" wide>
      <div className="flex flex-col gap-6 pb-2">
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
                    {hex === g.art.glowColor && <span className="ml-1 text-accent">· свечение</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="text-[12px] text-muted">
          Алгоритм {g.algorithmVersion} · seed {g.seed} · {g.scenes.length} сцены · {(g.totalMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с. Тот же ввод всегда даёт тот же результат.
        </p>
      </div>
    </Sheet>
  );
}
