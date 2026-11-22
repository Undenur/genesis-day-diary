/**
 * IndexedDB: Blob медиа + метаданные. Сохранение дня атомарно (одна транзакция memories+blobs+drafts).
 * localStorage используется только для маленьких настроек (см. store/settings.ts).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CountdownEvent, Generation, Memory, MemoryInput } from '../lib/types';

export const SCHEMA_VERSION = 1;

export interface BlobRecord {
  id: string;
  blob: Blob;
  owner: string;
  createdAt: string;
}

export interface DraftRecord {
  id: string;
  step: number;
  /** Версия последовательности шагов мастера (нет у черновиков до 1.1) */
  flow?: number;
  input: MemoryInput;
  memoryId: string;
  generation: Generation | null;
  updatedAt: string;
}

interface MomentaDB extends DBSchema {
  memories: { key: string; value: Memory; indexes: { date: string } };
  blobs: { key: string; value: BlobRecord; indexes: { owner: string } };
  countdowns: { key: string; value: CountdownEvent };
  drafts: { key: string; value: DraftRecord };
  meta: { key: string; value: { key: string; value: unknown } };
}

let dbPromise: Promise<IDBPDatabase<MomentaDB>> | null = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<MomentaDB>('momenta', 1, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const m = d.createObjectStore('memories', { keyPath: 'id' });
          m.createIndex('date', 'date');
          const b = d.createObjectStore('blobs', { keyPath: 'id' });
          b.createIndex('owner', 'owner');
          d.createObjectStore('countdowns', { keyPath: 'id' });
          d.createObjectStore('drafts', { keyPath: 'id' });
          d.createObjectStore('meta', { keyPath: 'key' });
        }
        // Будущие версии схемы: добавлять ветки `if (oldVersion < N)` и не удалять старые хранилища.
      },
    });
  }
  return dbPromise;
}

export class StorageFullError extends Error {
  constructor() {
    super('На устройстве не хватает места для сохранения. Удалите старые дни или освободите память браузера.');
  }
}

function isQuota(e: unknown) {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

/** Нормализует записи старых версий схемы, чтобы ранее сохранённые дни открывались. */
export function migrateMemory(raw: Memory): Memory {
  const m = { ...raw } as Memory;
  if (!m.schemaVersion) m.schemaVersion = 1;
  m.photos = m.photos ?? [];
  m.coverId = m.coverId ?? m.photos[0]?.id ?? null;
  m.voice = m.voice ?? null;
  m.place = m.place ?? null;
  m.song = m.song ?? null;
  m.weather = m.weather ?? '';
  m.visibility = 'private';
  return m;
}

export async function putBlob(blob: Blob, owner: string, id: string): Promise<string> {
  try {
    await (await db()).put('blobs', { id, blob, owner, createdAt: new Date().toISOString() });
    return id;
  } catch (e) {
    if (isQuota(e)) throw new StorageFullError();
    throw e;
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  const r = await (await db()).get('blobs', id);
  return r?.blob ?? null;
}

export function memoryBlobIds(m: MemoryInput): string[] {
  const ids: string[] = [];
  for (const p of m.photos) ids.push(p.blobId, p.thumbBlobId);
  if (m.song?.fileBlobId) ids.push(m.song.fileBlobId);
  if (m.voice) ids.push(m.voice.blobId);
  return ids;
}

/**
 * Атомарное сохранение дня: в одной транзакции блобы получают владельца-день,
 * запись дня кладётся целиком, черновик удаляется. Повторный вызов с тем же id идемпотентен.
 */
export async function saveMemoryAtomic(memory: Memory, opts: { clearDraft?: boolean } = {}) {
  const d = await db();
  const tx = d.transaction(['memories', 'blobs', 'drafts'], 'readwrite');
  try {
    const blobs = tx.objectStore('blobs');
    for (const id of memoryBlobIds(memory)) {
      const rec = await blobs.get(id);
      if (!rec) throw new Error('Не найден файл дня в хранилище. Добавьте медиа заново.');
      if (rec.owner !== memory.id) await blobs.put({ ...rec, owner: memory.id });
    }
    await tx.objectStore('memories').put(memory);
    if (opts.clearDraft) await tx.objectStore('drafts').delete('current');
    await tx.done;
  } catch (e) {
    try { tx.abort(); } catch { /* транзакция уже завершена */ }
    if (isQuota(e) || (e instanceof DOMException && e.name === 'AbortError' && isQuota(tx.error))) throw new StorageFullError();
    throw e;
  }
}

export async function listMemories(): Promise<Memory[]> {
  const all = await (await db()).getAll('memories');
  return all.map(migrateMemory);
}

export async function deleteMemory(id: string) {
  const d = await db();
  const tx = d.transaction(['memories', 'blobs'], 'readwrite');
  const idx = tx.objectStore('blobs').index('owner');
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore('memories').delete(id);
  await tx.done;
}

export async function listCountdowns() {
  return (await db()).getAll('countdowns');
}

export async function saveCountdown(c: CountdownEvent) {
  const d = await db();
  const tx = d.transaction(['countdowns', 'blobs'], 'readwrite');
  if (c.coverBlobId) {
    const rec = await tx.objectStore('blobs').get(c.coverBlobId);
    if (rec && rec.owner !== c.id) await tx.objectStore('blobs').put({ ...rec, owner: c.id });
  }
  await tx.objectStore('countdowns').put(c);
  await tx.done;
}

export async function deleteCountdown(id: string) {
  const d = await db();
  const tx = d.transaction(['countdowns', 'blobs'], 'readwrite');
  const idx = tx.objectStore('blobs').index('owner');
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore('countdowns').delete(id);
  await tx.done;
}

export async function loadDraft(): Promise<DraftRecord | null> {
  return (await (await db()).get('drafts', 'current')) ?? null;
}

export async function saveDraft(rec: Omit<DraftRecord, 'id' | 'updatedAt'>) {
  try {
    await (await db()).put('drafts', { ...rec, id: 'current', updatedAt: new Date().toISOString() });
  } catch (e) {
    if (isQuota(e)) throw new StorageFullError();
    throw e;
  }
}

export async function clearDraft() {
  await (await db()).delete('drafts', 'current');
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await (await db()).put('meta', { key, value });
}

/**
 * Удаляет «осиротевшие» файлы: черновые медиа брошенных правок и т. п.
 * Вызывается при старте, до открытия мастера.
 */
export const GC_GRACE_MS = 60 * 60 * 1000;

/**
 * Удаляет «осиротевшие» файлы старше часа. Свежие файлы не трогаем: другая вкладка может прямо сейчас
 * импортировать фото в черновик или собирать демо-день — ссылка на них появится чуть позже.
 * Всё делается в одной транзакции, поэтому ссылки и удаление согласованы.
 */
export async function collectGarbage(now = Date.now()) {
  const d = await db();
  const tx = d.transaction(['memories', 'countdowns', 'drafts', 'blobs'], 'readwrite');
  const used = new Set<string>();
  for (const m of await tx.objectStore('memories').getAll()) memoryBlobIds(migrateMemory(m)).forEach((id) => used.add(id));
  for (const c of await tx.objectStore('countdowns').getAll()) if (c.coverBlobId) used.add(c.coverBlobId);
  const draft = await tx.objectStore('drafts').get('current');
  if (draft) memoryBlobIds(draft.input).forEach((id) => used.add(id));
  let cursor = await tx.objectStore('blobs').openCursor();
  let removed = 0;
  while (cursor) {
    const age = now - (Date.parse(cursor.value.createdAt) || 0);
    if (!used.has(cursor.key) && age > GC_GRACE_MS) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

/**
 * Записать день вместе с файлами, только если дня с таким id ещё нет.
 * Проверка и запись — в одной транзакции, поэтому две вкладки не создадут дубль,
 * а уже существующий (возможно, отредактированный) день останется нетронутым.
 */
export async function insertMemoryIfAbsent(memory: Memory, blobs: { id: string; blob: Blob }[]): Promise<boolean> {
  const d = await db();
  const tx = d.transaction(['memories', 'blobs'], 'readwrite');
  try {
    if (await tx.objectStore('memories').get(memory.id)) {
      await tx.done;
      return false;
    }
    const at = new Date().toISOString();
    for (const b of blobs) await tx.objectStore('blobs').put({ id: b.id, blob: b.blob, owner: memory.id, createdAt: at });
    await tx.objectStore('memories').put(memory);
    await tx.done;
    return true;
  } catch (e) {
    try { tx.abort(); } catch { /* уже завершена */ }
    if (isQuota(e)) throw new StorageFullError();
    throw e;
  }
}

/**
 * Замена записи дня, только если её никто не изменил с момента чтения (updatedAt совпадает).
 * Старые файлы удаляются в той же транзакции. Нужна для фоновых обновлений, которые не должны
 * перетирать правку автора, сделанную в это же время в другой вкладке.
 */
export async function replaceMemoryIfUnchanged(memory: Memory, expectedUpdatedAt: string, removeBlobIds: string[] = []): Promise<boolean> {
  const d = await db();
  const tx = d.transaction(['memories', 'blobs'], 'readwrite');
  try {
    const cur = (await tx.objectStore('memories').get(memory.id)) as Memory | undefined;
    if (!cur || cur.updatedAt !== expectedUpdatedAt) {
      await tx.done;
      return false;
    }
    await tx.objectStore('memories').put(memory);
    for (const id of removeBlobIds) await tx.objectStore('blobs').delete(id);
    await tx.done;
    return true;
  } catch (e) {
    try { tx.abort(); } catch { /* уже завершена */ }
    if (isQuota(e)) throw new StorageFullError();
    throw e;
  }
}

export async function insertCountdownIfAbsent(ev: CountdownEvent, cover: { id: string; blob: Blob } | null): Promise<boolean> {
  const d = await db();
  const tx = d.transaction(['countdowns', 'blobs'], 'readwrite');
  if (await tx.objectStore('countdowns').get(ev.id)) {
    await tx.done;
    return false;
  }
  if (cover) await tx.objectStore('blobs').put({ id: cover.id, blob: cover.blob, owner: ev.id, createdAt: new Date().toISOString() });
  await tx.objectStore('countdowns').put(ev);
  await tx.done;
  return true;
}

export async function wipeAll() {
  const d = await db();
  const tx = d.transaction(['memories', 'blobs', 'countdowns', 'drafts', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('memories').clear(),
    tx.objectStore('blobs').clear(),
    tx.objectStore('countdowns').clear(),
    tx.objectStore('drafts').clear(),
    tx.objectStore('meta').clear(),
  ]);
  await tx.done;
}
