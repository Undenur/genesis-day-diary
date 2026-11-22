import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useReducedMotion } from './hooks/useReducedMotion';
import { CreateScreen } from './screens/CreateScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MemoriesScreen } from './screens/MemoriesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { useData } from './store/data';

const Wizard = lazy(() => import('./screens/WizardScreen'));
const Preview = lazy(() => import('./screens/PreviewScreen'));
const MemoryView = lazy(() => import('./screens/MemoryScreen'));
const MemoryEdit = lazy(() => import('./screens/EditScreen'));
const Countdown = lazy(() => import('./screens/CountdownScreen'));
const MapScreen = lazy(() => import('./screens/MapScreen'));
const Seasons = lazy(() => import('./screens/SeasonsScreen'));
const Shared = lazy(() => import('./screens/SharedScreen'));
const Song = lazy(() => import('./screens/SongScreen'));
const Share = lazy(() => import('./screens/ShareScreen'));

const fallback = (
  <div className="grid min-h-[50dvh] place-items-center">
    <Spinner label="Открываю…" />
  </div>
);
const L = (el: React.ReactNode) => <Suspense fallback={fallback}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/explore', element: <ExploreScreen /> },
      { path: '/create', element: <CreateScreen /> },
      { path: '/memories', element: <MemoriesScreen /> },
      { path: '/profile', element: <ProfileScreen /> },
      { path: '/map', element: L(<MapScreen />) },
      { path: '/seasons', element: L(<Seasons />) },
      { path: '/shared', element: L(<Shared />) },
      { path: '/song/:key', element: L(<Song />) },
      { path: '/create/relive', element: L(<Wizard />) },
      { path: '/create/relive/preview', element: L(<Preview />) },
      { path: '/m/:id', element: L(<MemoryView />) },
      { path: '/m/:id/edit', element: L(<MemoryEdit />) },
      { path: '/countdown/:id', element: L(<Countdown />) },
      { path: '/share/:id', element: L(<Share />) },
      { path: '*', element: <HomeScreen /> },
    ],
  },
]);

export function App() {
  const init = useData((s) => s.init);
  const reduced = useReducedMotion();
  useEffect(() => {
    init();
    // Просим браузер не вытеснять локальный архив при нехватке места.
    navigator.storage?.persist?.().catch(() => {});
  }, [init]);
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
