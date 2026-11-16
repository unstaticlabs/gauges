import { normalizeForSearch, searchGauges } from '../search';
import { makeGauge } from '../__testSupport__/makeGauge';

const gauges = [
  makeGauge({ id: 'a', name: 'Arroser les plantes' }),
  makeGauge({ id: 'b', name: 'Nettoyer la cuisinière' }),
  makeGauge({ id: 'c', name: 'Vider le lave-vaisselle' }),
  makeGauge({ id: 'd', name: 'Ménage' }),
];

const ids = (query: string) => searchGauges(gauges, query).map((g) => g.id);

describe('searchGauges', () => {
  it('ignores case', () => {
    expect(ids('ARROSER')).toEqual(['a']);
  });

  it('ignores accents in the query and in the name', () => {
    expect(ids('cuisiniere')).toEqual(['b']);
    expect(ids('menage')).toEqual(['d']);
    expect(ids('MÉNAGE')).toEqual(['d']);
    expect(ids('vidér')).toEqual(['c']);
  });

  it('returns all gauges for an empty query', () => {
    expect(ids('  ')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns no gauge when nothing matches', () => {
    expect(ids('aspirateur')).toEqual([]);
  });

  it('normalizes text', () => {
    expect(normalizeForSearch('Été Ça')).toBe('ete ca');
  });
});
