import { describe, expect, it } from 'vitest';
import type { ResourceBundle } from '@catanx/engine';
import { listCkCommodityCounters, listHeldCatanResources } from '../ResourceBar';

describe('ResourceBar visibility', () => {
  it('hides zero-value resources and keeps only held CATAN cards', () => {
    const resources: ResourceBundle = {
      wood: 2,
      clay: 0,
      sheep: 1,
      wheat: 0,
      ore: 0,
    };

    expect(listHeldCatanResources(resources)).toEqual([
      ['wood', 2],
      ['sheep', 1],
    ]);
  });

  it('returns an empty hand when every amount is zero', () => {
    expect(listHeldCatanResources({ wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 })).toEqual([]);
  });

  it('keeps all three C&K commodity counters visible, including zeroes', () => {
    expect(listCkCommodityCounters({ ck_cloth: 2, ck_paper: 1 })).toEqual([
      ['ck_cloth', 2],
      ['ck_coin', 0],
      ['ck_paper', 1],
    ]);
  });
});
