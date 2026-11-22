# Источники, референсы и инструменты

## Происхождение материалов

| Материал | Источник | Лицензия |
|---|---|---|
| 9 демо-иллюстраций (`public/demo/*.jpg`) | созданы кодом `scripts/gen-assets.mjs` (векторная живопись → JPG через sharp) | собственные |
| Знак MOMENTA и иконки PWA | `scripts/gen-assets.mjs`, `src/components/Logo.tsx` | собственные |
| Демо-треки «Высота 2800», «Стробоскоп», «Капли на стекле» | синтез MOMENTA (`src/services/synth.ts`), рендер в WAV при первом запуске | собственные |
| Тексты демо-дней, места, события | вымышленные | собственные |
| Inter (интерфейс) | @fontsource-variable/inter, лежит в сборке | SIL OFL 1.1 — `licenses/Inter-OFL.txt` |
| PT Serif (названия и подписи) | @fontsource/pt-serif, лежит в сборке | SIL OFL 1.1 — `licenses/PT-Serif-OFL.txt` |
| DM Serif Display (латинский знак MOMENTA) | @fontsource/dm-serif-display | SIL OFL 1.1 — `licenses/DM-Serif-Display-OFL.txt` |
| Пиктограммы | lucide-react | ISC — `licenses/Lucide-ISC.txt` |
| Карта | Leaflet + тайлы OpenStreetMap (атрибуция на карте) | BSD-2 (`licenses/Leaflet-BSD2.txt`), данные © участники OpenStreetMap, ODbL |

Шрифты подключены локально через пакеты Fontsource и попадают в прекеш PWA.
Запасные семейства: `system-ui` и `Segoe UI` для интерфейса, `Georgia` и `DejaVu Serif` для антиквы.

## Художественные референсы (принципы, не копии)

- **Импрессионизм** (Моне, Писсарро): рассеянный свет, мазок вместо контура, зерно — для тихих дней.
- **Василий Кандинский**, «Точка и линия на плоскости»: соответствие формы, цвета и звука, геометрия на ритм — для ночных и танцевальных дней.
- **Минимализм** в фотокниге: воздух, тонкая рамка, один кадр — для камерных сюжетов.
- Коллаж мобильных интерфейсов (материалы кейса): из него взяты три приёма — крупное число как главный смысл Countdown, строка песни с обложкой и вторичной информацией, единообразные пиктограммы быстрых действий.
- MyMoments Countdown Widget (материалы кейса): фотособытие с обратным отсчётом и спокойная композиция знака. Знак MOMENTA нарисован заново.

## Инструменты

React 19, TypeScript 5.9, Vite 8, React Router 7, Tailwind CSS 4, Motion, Zustand, idb, Leaflet, vite-plugin-pwa (Workbox), Vitest, sharp.
Web Audio API (анализ и синтез), Canvas 2D (анализ фото, художественный слой, карточка Share Again), MediaRecorder (голос), Web Speech API («Прочитать запись»), Web Share API.
Разработка — Claude Code.
