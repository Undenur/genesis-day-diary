/**
 * Облачное расширение (P2): Supabase Auth, PostgreSQL, приватное Storage, Realtime для общих альбомов.
 * Клиент не подключён в этой сборке: схема и правила доступа лежат в supabase/migrations.
 * Здесь — только проверка конфигурации, чтобы интерфейс честно показывал состояние.
 */
export function cloudStatus(): { configured: boolean; message: string } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    return { configured: true, message: 'Облако настроено, но клиент синхронизации ещё не включён в этой сборке' };
  }
  return { configured: false, message: 'Локальный режим: облако не подключено' };
}
