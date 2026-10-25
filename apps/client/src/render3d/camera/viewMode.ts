/** H7 — strategic gameplay vs promo cinematic (no HUD / tokens). */
export type BoardViewMode = 'strategic' | 'cinematic';

export function readViewModeFromUrl(): BoardViewMode {
  if (typeof window === 'undefined') return 'strategic';
  return new URLSearchParams(window.location.search).get('view') === 'cinematic'
    ? 'cinematic'
    : 'strategic';
}

export function syncViewModeToUrl(mode: BoardViewMode): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (mode === 'cinematic') url.searchParams.set('view', 'cinematic');
  else url.searchParams.delete('view');
  window.history.replaceState({}, '', url);
}

export function isCinematicView(mode: BoardViewMode): boolean {
  return mode === 'cinematic';
}
