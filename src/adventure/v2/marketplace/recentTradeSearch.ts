export function filterMarketplaceRecentTrades<
  T extends { itemName: string },
>(rows: T[], search: string): T[] {
  const query = search.trim().toLocaleLowerCase("ko-KR");
  if (!query) return rows;
  return rows.filter((row) =>
    row.itemName.toLocaleLowerCase("ko-KR").includes(query),
  );
}
