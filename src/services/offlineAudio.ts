/**
 * Композиции каталога доступны офлайн.
 *
 * Прекэш Workbox отдаёт файл целиком и не отвечает на Range-запросы, а <audio> при перемотке просит диапазон.
 * Поэтому /audio/ обслуживает отдельный маршрут CacheFirst с поддержкой диапазонов (vite.config.ts),
 * а этот модуль после первого запуска кладёт в тот же кэш полные ответы 200 — их маршрут режет на диапазоны.
 * Кэш заполняется напрямую через Cache API: прогрев работает, даже пока сервис-воркер ещё не управляет страницей.
 */
import { TRACKS } from '../lib/catalog';

/** Имя кэша должно совпадать с runtimeCaching в vite.config.ts. */
export const AUDIO_CACHE = 'momenta-audio';

export async function warmAudioCache(urls: string[] = TRACKS.map((t) => t.url)): Promise<{ cached: number; failed: number }> {
  if (typeof caches === 'undefined') return { cached: 0, failed: urls.length };
  const cache = await caches.open(AUDIO_CACHE);
  let cached = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) await cache.add(url);
      cached++;
    } catch {
      failed++; // нет сети — повторим при следующем запуске
    }
  }
  return { cached, failed };
}
