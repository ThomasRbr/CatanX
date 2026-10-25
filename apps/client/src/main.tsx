import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SkipLink } from './components/a11y/SkipLink';
import { AppErrorBoundary } from './components/a11y/AppErrorBoundary';
import { applyCssVars } from './design/applyCssVars';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import './index.css';

applyCssVars();

// Dev-only handle for visual QA scripts (seasons, layers). Stripped from builds.
if (import.meta.env.DEV) {
  void import('./store/gameStore').then(({ useGameStore }) => {
    (window as Window & { __catanxDev?: unknown }).__catanxDev = { store: useGameStore };
  });
}

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene');
const isH1Scene = scene === 'h1';
const isH6Scene = scene === 'h6';
const isH7Scene = scene === 'h7';
const isDioramaScene = scene === 'diorama';
const isCkScene = scene === 'ck';
const isUiLab = params.get('ui-lab') === '1';

const LazyUiLabPage = lazy(async () => {
  const mod = await import('./ui/UiLabPage');
  return { default: mod.UiLabPage };
});

const LazyReferenceSceneH1 = lazy(async () => {
  const mod = await import('./render3d/reference/ReferenceSceneH1');
  return { default: mod.ReferenceSceneH1Page };
});

const LazyReferenceSceneH6 = lazy(async () => {
  const mod = await import('./render3d/reference/ReferenceSceneH6');
  return { default: mod.ReferenceSceneH6Page };
});

const LazyReferenceSceneH7 = lazy(async () => {
  const mod = await import('./render3d/reference/ReferenceSceneH7');
  return { default: mod.ReferenceSceneH7Page };
});

const LazyReferenceSceneCk = lazy(async () => {
  const mod = await import('./render3d/reference/ReferenceSceneCk');
  return { default: mod.ReferenceSceneCkPage };
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isUiLab ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#0B1F38',
                color: '#F7F8FC',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Chargement du laboratoire UI…
            </div>
          }
        >
          <LazyUiLabPage />
        </Suspense>
      ) : isH1Scene ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#1a221c',
                color: '#e8efe6',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              Chargement scène H1…
            </div>
          }
        >
          <LazyReferenceSceneH1 />
        </Suspense>
      ) : isH6Scene ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#1a221c',
                color: '#e8efe6',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              Chargement scène H6…
            </div>
          }
        >
          <LazyReferenceSceneH6 />
        </Suspense>
      ) : isCkScene ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#3c2519',
                color: '#f7f8fc',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Chargement des pièces Villes & Chevaliers…
            </div>
          }
        >
          <LazyReferenceSceneCk />
        </Suspense>
      ) : isH7Scene || isDioramaScene ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#1a221c',
                color: '#e8efe6',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              Chargement scène H7…
            </div>
          }
        >
          <LazyReferenceSceneH7 />
        </Suspense>
      ) : (
        <>
          <SkipLink />
          <App />
        </>
      )}
    </AppErrorBoundary>
  </React.StrictMode>,
);
