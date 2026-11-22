/**
 * Один владелец музыки в каждый момент. Кто начинает звучать — «захватывает» звук,
 * предыдущий владелец немедленно останавливается. Асинхронные операции (загрузка файла,
 * resume контекста, play()) после каждого await проверяют, что их токен ещё актуален.
 */
type Kind = 'preview' | 'story';

interface Owner {
  token: number;
  kind: Kind;
  stop: () => void;
}

let current: Owner | null = null;
let seq = 0;

/** Захватить звук: предыдущий владелец останавливается. Возвращает токен. */
export function claimAudio(kind: Kind, stop: () => void): number {
  const prev = current;
  current = { token: ++seq, kind, stop };
  if (prev) prev.stop();
  return current.token;
}

/** Актуален ли ещё этот токен (никто не перехватил звук и он не освобождён). */
export function ownsAudio(token: number): boolean {
  return current?.token === token;
}

/** Освободить звук, если он всё ещё принадлежит токену. */
export function releaseAudio(token: number) {
  if (current?.token === token) current = null;
}

/** Остановить любого текущего владельца (например, при открытии истории). */
export function stopAllAudio() {
  const prev = current;
  current = null;
  prev?.stop();
}

export function audioOwnerKind(): Kind | null {
  return current?.kind ?? null;
}
