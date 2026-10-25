import { describe, expect, it } from 'vitest';
import { tokensToCssVars } from '../tokens';

describe('tokensToCssVars sync', () => {
  it('exposes the CatanX Next palette and motion tokens', () => {
    const vars = tokensToCssVars();
    expect(vars['--midnight']).toBeTruthy();
    expect(vars['--turquoise']).toBeTruthy();
    expect(vars['--motion-feedback']).toBeTruthy();
  });
});
