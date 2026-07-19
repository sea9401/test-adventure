import { describe, expect, it } from "vitest";
import {
  GUILD_FACILITY_ICON_COLORS,
  GUILD_FACILITY_IDS,
  isGuildFacilityId,
  unlockedGuildFacilityIds,
} from "./guildFacilities";

describe("guildFacilities", () => {
  it("길드 드롭다운에 개방된 시설만 반환한다", () => {
    expect(
      unlockedGuildFacilityIds({
        guild_smithy: 1,
        training_ground: 0,
        dining_hall: 2,
      }),
    ).toEqual(["guild_smithy", "dining_hall"]);
  });

  it("지원하는 시설 식별자만 허용한다", () => {
    for (const id of GUILD_FACILITY_IDS) {
      expect(isGuildFacilityId(id)).toBe(true);
    }
    expect(isGuildFacilityId("castle")).toBe(false);
    expect(isGuildFacilityId(null)).toBe(false);
  });

  it("모든 시설은 드롭다운과 목록이 공유할 아이콘 색상을 가진다", () => {
    for (const id of GUILD_FACILITY_IDS) {
      expect(GUILD_FACILITY_ICON_COLORS[id]).toMatch(/^text-/);
      expect(GUILD_FACILITY_ICON_COLORS[id]).toContain("dark:text-");
    }
    expect(new Set(Object.values(GUILD_FACILITY_ICON_COLORS)).size).toBe(
      GUILD_FACILITY_IDS.length,
    );
  });
});
