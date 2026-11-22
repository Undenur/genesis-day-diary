import '@fontsource-variable/inter';
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/dm-serif-display/400.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
