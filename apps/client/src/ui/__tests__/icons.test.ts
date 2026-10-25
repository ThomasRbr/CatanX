import { describe, expect, it } from 'vitest';
import { hasIcon, listIcons } from '../icons/registry';

describe('icon registry', () => {
  it('listIcons includes wood and dice', () => {
    const names = listIcons();
    expect(names).toContain('wood');
    expect(names).toContain('dice');
  });

  it('hasIcon works for known and unknown names', () => {
    expect(hasIcon('wood')).toBe(true);
    expect(hasIcon('dice')).toBe(true);
    expect(hasIcon('not-an-icon')).toBe(false);
  });
});
