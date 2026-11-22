/** Профиль: имя, аватар, движение и звук, видимость личных записей, где хранятся данные, облако. */
import { Cloud, CloudOff, HardDrive, Lock, RotateCcw, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Page } from '../components/Layout';
import { Button, ConfirmDialog, Field, SectionTitle, Segmented, inputCls, toast } from '../components/ui';
import { ALGORITHM_VERSION } from '../engine/generator';
import { plural } from '../lib/util';
import { cloudStatus } from '../services/cloud';
import { setMeta, wipeAll } from '../services/db';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';

export function ProfileScreen() {
  const s = useSettings();
  const { memories, countdowns } = useData();
  const [usage, setUsage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cloud = cloudStatus();

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, [memories.length]);

  const setAvatar = async (f: File) => {
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) return toast('Не удалось открыть снимок', 'error');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const k = Math.max(128 / bmp.width, 128 / bmp.height);
    c.getContext('2d')!.drawImage(bmp, (128 - bmp.width * k) / 2, (128 - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    s.set({ avatar: c.toDataURL('image/jpeg', 0.8) });
  };

  const mb = (b: number) => (b / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';

  return (
    <Page>
      <h1 className="pb-2 pt-[max(20px,var(--safe-top))] text-[26px] font-semibold">Профиль</h1>

      <section className="mt-3 flex items-center gap-4 rounded-[20px] bg-card p-4">
        <button type="button" onClick={() => fileRef.current?.click()} className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-raised text-[24px] font-semibold" aria-label="Сменить аватар">
          {s.avatar ? <img src={s.avatar} alt="" className="h-full w-full object-cover" /> : s.name.slice(0, 1).toUpperCase()}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Выбрать аватар" onChange={(e) => e.target.files?.[0] && setAvatar(e.target.files[0])} />
        <div className="flex-1">
          <Field label="Имя" htmlFor="pname">
            <input id="pname" className={inputCls} value={s.name} onChange={(e) => s.set({ name: e.target.value })} />
          </Field>
        </div>
      </section>
      <p className="mt-2 text-[13px] text-muted">
        {memories.length} {plural(memories.length, ['день', 'дня', 'дней'])} · {countdowns.length} {plural(countdowns.length, ['событие', 'события', 'событий'])}
      </p>

      <section className="mt-7">
        <SectionTitle>Движение</SectionTitle>
        <Segmented
          label="Режим движения"
          value={s.motion}
          onChange={(motion) => s.set({ motion })}
          options={[
            { value: 'system', label: 'Как в системе' },
            { value: 'reduce', label: 'Уменьшить' },
            { value: 'full', label: 'Полное' },
          ]}
        />
        <p className="mt-2 text-[13px] text-muted">«Уменьшить» заменяет пульсацию и движение камеры статичным оформлением и ручным просмотром сцен.</p>
      </section>

      <section className="mt-7">
        <SectionTitle>Звук</SectionTitle>
        <label className="flex flex-col gap-2 text-[14px] text-muted">
          Громкость музыки · {Math.round(s.musicVolume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => s.set({ musicVolume: Number(e.target.value) })} />
        </label>
        <label className="mt-4 flex flex-col gap-2 text-[14px] text-muted">
          Громкость голоса · {Math.round(s.voiceVolume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={s.voiceVolume} onChange={(e) => s.set({ voiceVolume: Number(e.target.value) })} />
        </label>
        <p className="mt-2 text-[13px] text-muted">Звук включается только по нажатию «Воспроизвести».</p>
      </section>

      <section className="mt-7">
        <SectionTitle>Видимость</SectionTitle>
        <div className="rounded-[20px] bg-card p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Lock size={18} className="text-accent" aria-hidden="true" /> Все записи личные
          </p>
          <p className="mt-1 text-[14px] text-muted">Дни видны только вам. Карточка Share Again создаётся отдельным действием и не меняет сам день.</p>
          <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-[15px]">
            Скрывать названия и обложки на главной
            <input type="checkbox" className="h-5 w-5 accent-[#91A9D1]" checked={s.hidePrivateOnHome} onChange={(e) => s.set({ hidePrivateOnHome: e.target.checked })} />
          </label>
        </div>
      </section>

      <section className="mt-7">
        <SectionTitle>Где хранятся данные</SectionTitle>
        <div className="rounded-[20px] bg-card p-4 text-[14px]">
          <p className="flex items-center gap-2 font-semibold">
            <HardDrive size={18} className="text-accent" aria-hidden="true" /> Локально, в этом браузере
          </p>
          <p className="mt-1 text-muted">
            Фото, треки и голос — в IndexedDB этого устройства; настройки — в localStorage. Ничего не отправляется на сервер. Очистка данных сайта в браузере удалит архив.
          </p>
          {usage && (
            <p className="mt-2">
              Занято {mb(usage.used)} из доступных {mb(usage.quota)}. {usage.persisted ? '✓ Браузер не будет удалять архив при нехватке места.' : 'Постоянное хранение не подтверждено браузером.'}
            </p>
          )}
        </div>
        <div className="mt-3 rounded-[20px] bg-card p-4 text-[14px]">
          <p className="flex items-center gap-2 font-semibold">
            {cloud.configured ? <Cloud size={18} className="text-ok" aria-hidden="true" /> : <CloudOff size={18} className="text-muted" aria-hidden="true" />} Облако
          </p>
          <p className="mt-1 text-muted">{cloud.message}. Аккаунт, синхронизация устройств и общие альбомы появятся при подключённом сервисе.</p>
        </div>
      </section>

      <section className="mt-7 flex flex-col gap-3">
        <Button
          variant="outline"
          icon={RotateCcw}
          onClick={async () => {
            await setMeta('demoSeeded', false);
            const { seedDemos } = await import('../services/demo');
            toast('Готовлю демо-дни…');
            await seedDemos();
            await useData.getState().reload();
            toast('Демо-дни добавлены', 'ok');
          }}
        >
          Восстановить демо-дни
        </Button>
        <Button variant="danger" icon={Trash} onClick={() => setConfirmWipe(true)}>
          Удалить все данные
        </Button>
        <p className="text-center text-[12px] text-muted">MOMENTA · алгоритм {ALGORITHM_VERSION} · Your life. Your moments. Your memories.</p>
      </section>

      <ConfirmDialog
        open={confirmWipe}
        title="Удалить все данные?"
        text={`Будут удалены ${memories.length} ${plural(memories.length, ['день', 'дня', 'дней'])}, события, черновик и все медиа. Это нельзя отменить.`}
        confirmLabel="Удалить всё"
        onClose={() => setConfirmWipe(false)}
        onConfirm={async () => {
          setConfirmWipe(false);
          await wipeAll();
          await setMeta('demoSeeded', true);
          await useData.getState().reload();
          toast('Все данные удалены', 'ok');
        }}
      />
    </Page>
  );
}
