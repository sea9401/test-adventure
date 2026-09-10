export function matchesItemSearch(name: string | undefined, search: string): boolean {
  const query = search.trim().toLocaleLowerCase("ko-KR");
  return !query || (name?.toLocaleLowerCase("ko-KR").includes(query) ?? false);
}

/** Filter display data only; preserve the authoritative counts for item actions. */
export function filterItemCounts<K extends string>(
  counts: Partial<Record<K, number>>,
  search: string,
  nameFor: (id: K) => string | undefined,
): Partial<Record<K, number>> {
  if (!search.trim()) return counts;
  return Object.fromEntries(
    (Object.keys(counts) as K[])
      .filter((id) => matchesItemSearch(nameFor(id), search))
      .map((id) => [id, counts[id]]),
  ) as Partial<Record<K, number>>;
}
