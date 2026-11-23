# Источники, референсы и инструменты

## Музыка: каталог настроений

Шесть композиций **Kevin MacLeod** (incompetech.com), лицензия **Creative Commons Attribution 4.0** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).
Лицензия разрешает включать записи в публичный репозиторий и приложение при указании автора, произведения, источника, лицензии и внесённых изменений — всё это ниже; в редакторе под выбором настроения показаны автор, ссылка на источник и лицензия звучащего трека.

Строка атрибуции: «<Произведение>» Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/

| Файл | Настроение | Произведение | ISRC | Страница источника | Усиление при подготовке |
|---|---|---|---|---|---|
| `public/audio/km-meditation-impromptu-02.mp3` | 🌿 Спокойствие | Meditation Impromptu 02 | USUAN1100162 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100162 | +8,6 дБ |
| `public/audio/km-carefree.mp3` | ☀️ Радость | Carefree | USUAN1400037 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037 | +6,2 дБ |
| `public/audio/km-gymnopedie-1.mp3` | 🫶 Нежность | Gymnopedie No. 1 (композитор Erik Satie, исполнение и запись Kevin MacLeod) | USUAN1100787 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100787 | +6,2 дБ |
| `public/audio/km-bittersweet.mp3` | 🌧 Ностальгия | Bittersweet | USUAN1700004 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700004 | +2,8 дБ |
| `public/audio/km-raving-energy-faster.mp3` | 🎉 Драйв | Raving Energy (faster) | USUAN1900012 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1900012 | −2,3 дБ |
| `public/audio/km-floating-cities.mp3` | 🌌 Мечтательность | Floating Cities | USUAN1600018 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600018 | +6,2 дБ |

Исходные MP3 скачаны со страниц incompetech.com (`https://incompetech.com/music/royalty-free/mp3-royaltyfree/<Название>.mp3`) и в репозиторий не входят.

### Внесённые изменения (одинаковы для всех шести файлов)

Сделаны скриптом `scripts/prepare-audio.mjs` (`node scripts/prepare-audio.mjs <папка с исходниками>`):

1. **Фрагмент 36 с** от начала звучания (пропуск тишины в начале). Для «Raving Energy (faster)» скрипт ищет вступление ритма — у этой записи оно совпадает с началом, фрагмент начинается с 0:00.
2. **Выравнивание громкости**: RMS звучащей части приведён к −18 dBFS (усиление — в таблице выше).
3. **Ограничитель пиков с упреждением 2 мс**, потолок −2 dBFS, восстановление 120 мс. Итоговые пики — от −1,6 до −2,4 dBFS.
4. **Мягкие вход 0,8 с и выход 3 с.**
5. **Кодирование MP3 128 кбит/с**, затем повторное декодирование для проверки длительности и уровня.

Автоматическая проверка в тестах (`src/lib/catalog.test.ts`): каждый файл декодируется, длится ≈36 с, пики ниже 0,9 полной шкалы, есть звук; у «Драйва» энергия и плотность атак выше, чем у «Спокойствия». Это проверка сигнала, а не прослушивание.

## Остальные материалы

| Материал | Источник | Лицензия |
|---|---|---|
| 9 демо-иллюстраций (`public/demo/*.jpg`) | созданы кодом `scripts/gen-assets.mjs` (векторная живопись → JPG через sharp) | собственные |
| Знак MOMENTA и иконки PWA | `scripts/gen-assets.mjs`, `src/components/Logo.tsx` | собственные |
| Тексты демо-дней, места, события | вымышленные | собственные |
| Inter (интерфейс) | @fontsource-variable/inter, лежит в сборке | SIL OFL 1.1 — `licenses/Inter-OFL.txt` |
| PT Serif (названия и подписи) | @fontsource/pt-serif, лежит в сборке | SIL OFL 1.1 — `licenses/PT-Serif-OFL.txt` |
| DM Serif Display (латинский знак MOMENTA) | @fontsource/dm-serif-display | SIL OFL 1.1 — `licenses/DM-Serif-Display-OFL.txt` |
| Пиктограммы | lucide-react | ISC — `licenses/Lucide-ISC.txt` |
| Карта | Leaflet + тайлы OpenStreetMap (атрибуция на карте) | BSD-2 (`licenses/Leaflet-BSD2.txt`), данные © участники OpenStreetMap, ODbL |

Шрифты подключены локально через пакеты Fontsource и попадают в прекеш PWA.
Запасные семейства: `system-ui` и `Segoe UI` для интерфейса, `Georgia` и `DejaVu Serif` для антиквы.

Инструменты подготовки аудио (только dev-зависимости, в приложение не попадают):
- `mpg123-decoder` — MIT, декодирование MP3 в скрипте и тестах;
- `@breezystack/lamejs` — LGPL-3.0, кодирование MP3 только в `scripts/prepare-audio.mjs`.

## Художественные референсы (принципы, не копии)

- **Импрессионизм** (Моне, Писсарро): рассеянный свет, мазок вместо контура, зерно — для тихих дней.
- **Василий Кандинский**, «Точка и линия на плоскости»: соответствие формы, цвета и звука, геометрия на ритм — для ночных и танцевальных дней.
- **Минимализм** в фотокниге: воздух, тонкая рамка, один кадр — для камерных сюжетов.
- Коллаж мобильных интерфейсов (материалы кейса): из него взяты три приёма — крупное число как главный смысл Countdown, строка песни с обложкой и вторичной информацией, единообразные пиктограммы быстрых действий.
- MyMoments Countdown Widget (материалы кейса): фотособытие с обратным отсчётом и спокойная композиция знака. Знак MOMENTA нарисован заново.

## Инструменты

React 19, TypeScript 5.9, Vite 8, React Router 7, Tailwind CSS 4, Motion, Zustand, idb, Leaflet, vite-plugin-pwa (Workbox), Vitest, sharp, mpg123-decoder, lamejs.
Web Audio API (анализ, громкость и приглушение музыки), Canvas 2D (анализ фото, художественный слой, карточка Share Again), MediaRecorder (голос), Web Speech API («Прочитать запись»), Web Share API, Cache API (офлайн-аудио).
Разработка — Claude Code.
