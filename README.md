# MOMENTA

**Your life. Your moments. Your memories.**

MOMENTA — мобильное веб-приложение (PWA) для REC GENESIS HACKATHON, трек ArtTech, кейс «Make the Invisible Visible».
Вы пишете о дне, добавляете свои кадры и песню. Приложение собирает индивидуальное воспоминание **RE:LIVE** — вертикальную историю на 15–30 секунд.
Её свет, ритм и движение рассчитываются из текста, снимков и звука (**Emotion DNA**, **Soundtrack Sync**).
Всё работает локально, без внешних AI-сервисов. После первого запуска приложение открывается и офлайн.

## Запуск

Нужен Node.js 20+ (проверено на Node 26.13.1, npm 11.20).

```powershell
npm install
```

```powershell
npm run dev
```

Откройте http://localhost:5173. При первом запуске приложение само готовит три демо-дня и два события Countdown.

Продакшн-сборка с service worker:

```powershell
npm run build
```

```powershell
npm run preview
```

Тесты движка (27 проверок: детерминизм, названия, BPM, замена трека и обложки, поиск, On This Day, Countdown):

```powershell
npm test
```

Пересоздать демо-иллюстрации и иконки PWA (собственная векторная живопись → JPG/PNG через sharp):

```powershell
npm run assets
```

## Что внутри

| Раздел | Где |
|---|---|
| Emotion DNA, генератор сцен, названия | `src/engine/` (чистые функции, покрыты тестами) |
| Хранилище IndexedDB (Blob + метаданные, атомарное сохранение, миграции) | `src/services/db.ts` |
| Медиа: Canvas-анализ фото, Web Audio-анализ трека | `src/services/media.ts` |
| Синтез MOMENTA (резерв музыки) и звук плеера | `src/services/synth.ts`, `src/services/storyAudio.ts` |
| Плеер RE:LIVE и художественный слой | `src/components/relive/` |
| Экраны | `src/screens/` |
| Облачный контракт (P2): схема, RLS, Storage | `supabase/migrations/`, `.env.example` |
| Документы | `docs/DESIGN.md`, `docs/CREDITS.md`, `docs/VIDEO_SCRIPT.md`, `docs/TEST_REPORT.md` |

**Стек:** React 19, TypeScript 5.9, Vite 8, React Router 7, Tailwind CSS 4, Motion, Zustand, idb, Leaflet + OpenStreetMap, lucide-react, vite-plugin-pwa.

## Три демо-дня

| День | Трек | Что показывает |
|---|---|---|
| «Там, где дышат горы» | эмбиент 76 BPM | 3 кадра, импрессионизм, органические формы, летняя подборка и Share Again |
| «Ночь громче наших слов» | электроника 136 BPM | геометрия Кандинского на долю, быстрые переходы, ночной концерт |
| «Дождь за тёплым стеклом» | камерное фортепиано 62 BPM | отражения и янтарные ореолы, голосовой финал, «В этот день» (дата = сегодня год назад) |

Треки — это синтез MOMENTA, отрендеренный в WAV. Приложение измеряет их как обычные файлы: 62 и 136 BPM определяются точно, эмбиент — как 74 при заданных 76.
Те же треки можно выбрать на шаге «Песня» (кнопки «Камерное фортепиано · 62 BPM» и др.), чтобы проверить замену песни.

## Данные и приватность

Все дни личные и хранятся только в IndexedDB этого браузера; настройки — в localStorage.
Share Again создаёт отдельную карточку PNG и не меняет сам день. Координаты и голос передаются только по отдельной галочке.
Облако не подключено: схема, правила доступа к строкам и файлам описаны в `supabase/migrations/0001_momenta_schema.sql`.
