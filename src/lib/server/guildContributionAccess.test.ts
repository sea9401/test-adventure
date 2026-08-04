import { describe, expect, it } from "vitest";
import { canViewGuildContributionDetails } from "./guildContributionAccess";

describe("길드 기여 상세 조회 권한", () => {
  it.each(["master", "manager"])("%s 역할은 상세 내역을 볼 수 있다", (role) => {
    expect(canViewGuildContributionDetails(role)).toBe(true);
  });

  it.each(["member", "vice_master", "", "admin"])(
    "%s 역할은 상세 내역을 볼 수 없다",
    (role) => {
      expect(canViewGuildContributionDetails(role)).toBe(false);
    },
  );
});
