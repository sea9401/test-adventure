import { describe, expect, it } from "vitest";
import type { AdminUserRow } from "./tabs/users/types";
import { exactMailRecipient, mailRecipientMatches } from "./mailRecipient";

function user(
  id: string,
  gameName: string | null,
  email: string | null = null,
): AdminUserRow {
  return {
    id,
    gameName,
    email,
    className: null,
    lastSeenAt: null,
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}

describe("관리자 우편 닉네임 검색", () => {
  const rows = [
    user("u-1", "푸른모험가", "blue@example.com"),
    user("u-2", "모험가푸름", "other@example.com"),
    user("u-3", "푸른", "exact@example.com"),
    user("u-4", null, "no-name@example.com"),
  ];

  it("닉네임만 부분 검색하고 정확 일치 결과를 먼저 둔다", () => {
    expect(mailRecipientMatches(rows, "푸른").map((row) => row.id)).toEqual([
      "u-3",
      "u-1",
    ]);
  });

  it("대소문자를 무시한 정확 일치가 하나일 때만 자동 선택한다", () => {
    const english = [user("u-5", "Adventurer")];
    expect(exactMailRecipient(english, "adventurer")?.id).toBe("u-5");
    expect(exactMailRecipient([...english, user("u-6", "ADVENTURER")], "adventurer"))
      .toBeNull();
  });
});
