/** «Прочитать запись» — системный синтез речи (Web Speech API), русский голос. */
import type { Generation } from '../lib/types';

let seq = 0;

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function ruVoice(): Promise<SpeechSynthesisVoice | null> {
  return new Promise((resolve) => {
    const pick = () => speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ru')) ?? null;
    const v = pick();
    if (v || speechSynthesis.getVoices().length) return resolve(v);
    const t = setTimeout(() => resolve(pick()), 1200);
    speechSynthesis.onvoiceschanged = () => {
      clearTimeout(t);
      resolve(pick());
    };
  });
}

/**
 * Читает текст. onStart вызывается, когда речь действительно началась (для приглушения музыки),
 * onEnd — после завершения, отмены или ошибки. Если до старта вызвали stopSpeaking — чтение не начнётся.
 * Скорость и высота подобраны по Emotion DNA: спокойный день читается медленнее и ниже.
 */
export async function speak(text: string, g: Generation | null, onEnd: () => void, onStart: () => void = () => {}): Promise<void> {
  if (!speechAvailable()) throw new Error('Системный синтез речи в этом браузере недоступен — остальной просмотр работает.');
  const my = ++seq;
  const voice = await ruVoice();
  if (my !== seq) return;
  if (!voice) throw new Error('Русский системный голос не найден — история и музыка доступны как обычно.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  const e = (g?.params.energy ?? 40) / 100;
  const i = (g?.params.intimacy ?? 50) / 100;
  u.rate = 0.85 + e * 0.25;
  u.pitch = 1.05 - i * 0.15;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd();
  };
  u.onstart = onStart;
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  seq++;
  if (speechAvailable()) speechSynthesis.cancel();
}
