import { CircleUserRound, Compass, House, Images, CirclePlus, WifiOff, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useOnline } from '../hooks/useReducedMotion';
import { useData } from '../store/data';
import { Wordmark } from './Logo';
import { Spinner, Toaster } from './ui';

const TABS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Главная', icon: House, end: true },
  { to: '/explore', label: 'Обзор', icon: Compass },
  { to: '/create', label: 'Создать', icon: CirclePlus },
  { to: '/memories', label: 'Дни', icon: Images },
  { to: '/profile', label: 'Профиль', icon: CircleUserRound },
];

/** Экраны без нижней панели: плеер, мастер, редакторы. */
const IMMERSIVE = [/^\/create\/relive/, /^\/m\//, /^\/countdown\//, /^\/share\//];

export function Layout() {
  const { pathname } = useLocation();
  const immersive = IMMERSIVE.some((r) => r.test(pathname));
  const status = useData((s) => s.status);
  const online = useOnline();

  return (
    <div className="min-h-dvh bg-night text-ink lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-night">
        К содержимому
      </a>
      <Toaster />
      {!immersive && (
        <nav aria-label="Основная навигация" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line px-4 py-6 lg:flex">
          <div className="mb-6 px-2">
            <Wordmark />
          </div>
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] transition-colors ${isActive ? 'bg-raised font-semibold text-ink' : 'text-muted hover:bg-card hover:text-ink'}`
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon size={22} className={isActive ? 'text-accent' : ''} fill={isActive && t.to !== '/create' ? 'rgba(145,169,209,0.18)' : 'none'} />
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
          <p className="mt-auto px-2 text-[12px] leading-relaxed text-muted">Your life. Your moments. Your memories.</p>
        </nav>
      )}

      <main id="main" className={`min-w-0 flex-1 ${immersive ? '' : 'pb-[calc(84px+var(--safe-bottom))] lg:pb-10'}`}>
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-warn/15 px-4 py-2 text-[13px] text-warn" role="status">
            <WifiOff size={16} aria-hidden="true" /> Нет сети — архив, плеер и создание дней работают локально
          </div>
        )}
        {status === 'seeding' && (
          <div className="flex items-center justify-center gap-2 bg-card px-4 py-2 text-[13px]" role="status">
            <Spinner /> Готовлю три демо-дня: снимки, треки и сцены…
          </div>
        )}
        {status === 'error' && (
          <div className="bg-err/15 px-4 py-2 text-center text-[13px] text-err" role="alert">
            Хранилище браузера недоступно (возможно, приватный режим). Записи не сохранятся после закрытия.
          </div>
        )}
        <Outlet />
      </main>

      {!immersive && (
        <nav
          aria-label="Основная навигация"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/95 pb-[var(--safe-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="mx-auto flex max-w-[560px] items-stretch justify-around px-1">
            {TABS.map((t) => (
              <li key={t.to} className="flex-1">
                <NavLink to={t.to} end={t.end} className="flex min-h-[64px] flex-col items-center justify-center gap-1">
                  {({ isActive }) => (
                    <>
                      <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive ? 'bg-raised' : ''}`}>
                        <t.icon
                          size={t.to === '/create' ? 26 : 22}
                          className={isActive ? 'text-accent' : 'text-muted'}
                          fill={isActive && t.to !== '/create' ? 'rgba(145,169,209,0.18)' : 'none'}
                          aria-hidden="true"
                        />
                      </span>
                      <span className={`text-[11.5px] leading-none ${isActive ? 'font-semibold text-ink' : 'text-muted'}`}>{t.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Обёртка страницы: поля 20 px на телефоне, шире на компьютере. */
export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-5 pb-6 ${wide ? 'max-w-6xl' : 'max-w-[640px] lg:max-w-3xl'}`}>{children}</div>;
}
