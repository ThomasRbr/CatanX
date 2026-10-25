import { tokensToCssVars } from './tokens';

/** Inject design tokens as CSS custom properties on :root. */
export function applyCssVars(target: HTMLElement = document.documentElement): void {
  const vars = tokensToCssVars();
  for (const [key, value] of Object.entries(vars)) {
    target.style.setProperty(key, value);
  }
}
