import type { Gauge } from './types';

/**
 * Returns the text in lower case and without accents, for a comparison.
 * For example, "Été" becomes "ete".
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Returns the gauges whose name contains the query. The comparison ignores
 * case and accents. An empty query returns all the gauges. The function
 * does not change the input list.
 */
export function searchGauges<G extends Pick<Gauge, 'name'>>(
  gauges: readonly G[],
  query: string,
): G[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === '') return [...gauges];
  return gauges.filter((gauge) => normalizeForSearch(gauge.name).includes(needle));
}
