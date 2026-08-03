import type { AdminUserRow } from "./tabs/users/types";

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

/** 관리자 유저 검색 결과에서 닉네임이 실제로 일치하는 계정만 추려 우선순위를 정한다. */
export function mailRecipientMatches(
  rows: readonly AdminUserRow[],
  query: string,
): AdminUserRow[] {
  const needle = normalizedName(query);
  if (!needle) return [];

  return rows
    .filter((row) => normalizedName(row.gameName ?? "").includes(needle))
    .sort((a, b) => {
      const aName = normalizedName(a.gameName ?? "");
      const bName = normalizedName(b.gameName ?? "");
      const exactOrder = Number(bName === needle) - Number(aName === needle);
      if (exactOrder !== 0) return exactOrder;
      const prefixOrder =
        Number(bName.startsWith(needle)) - Number(aName.startsWith(needle));
      if (prefixOrder !== 0) return prefixOrder;
      return aName.localeCompare(bName, "ko-KR");
    });
}

/** 정확히 일치하는 닉네임이 하나일 때만 자동 선택한다. */
export function exactMailRecipient(
  rows: readonly AdminUserRow[],
  query: string,
): AdminUserRow | null {
  const needle = normalizedName(query);
  if (!needle) return null;
  const exact = rows.filter(
    (row) => normalizedName(row.gameName ?? "") === needle,
  );
  return exact.length === 1 ? exact[0] : null;
}
