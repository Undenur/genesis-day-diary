import { useEffect, useState } from 'react';
import { getBlob } from '../services/db';

/**
 * Временный URL для Blob из IndexedDB. Создаётся заново после перезапуска
 * и освобождается при размонтировании компонента.
 */
export function useBlobUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    getBlob(id).then((b) => {
      if (!alive || !b) return;
      created = URL.createObjectURL(b);
      setUrl(created);
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [id]);
  return url;
}

/** Несколько URL сразу (для плеера RE:LIVE). */
export function useBlobUrls(ids: string[]): Record<string, string> {
  const key = ids.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    Promise.all(ids.map(async (id) => [id, await getBlob(id)] as const)).then((pairs) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const [id, b] of pairs) {
        if (!b) continue;
        const u = URL.createObjectURL(b);
        created.push(u);
        map[id] = u;
      }
      setUrls(map);
    });
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
      setUrls({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
