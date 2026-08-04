import { describe, expect, it } from "vitest";
import {
  guildDiningMenuLockNotice,
  toggleGuildDiningMenuSelection,
} from "./guildDiningMenuSelection";

describe("guild dining menu lock notice", () => {
  it("시설 승급으로 빈 메뉴 슬롯이 생기면 다음 주부터 사용할 수 있다고 안내한다", () => {
    expect(
      guildDiningMenuLockNotice({
        pantryPoints: 10,
        level: 2,
        menuSlots: 2,
        selectedCount: 1,
      }),
    ).toBe(
      "식당이 Lv.2로 성장했지만 이번 주 메뉴는 이미 1종으로 확정되었습니다. 다음 주 월요일 00:00부터 메뉴 2종을 선택할 수 있습니다.",
    );
  });

  it("기부 전에는 메뉴 잠금 안내를 표시하지 않는다", () => {
    expect(
      guildDiningMenuLockNotice({
        pantryPoints: 0,
        level: 2,
        menuSlots: 2,
        selectedCount: 1,
      }),
    ).toBeNull();
  });

  it("메뉴 슬롯을 모두 채운 뒤 기부가 시작되면 일반 잠금 사유를 안내한다", () => {
    expect(
      guildDiningMenuLockNotice({
        pantryPoints: 1,
        level: 2,
        menuSlots: 2,
        selectedCount: 2,
      }),
    ).toContain("식재료 기부가 시작되어 이번 주 메뉴가 확정되었습니다");
  });
});

describe("guild dining menu selection", () => {
  it("replaces the selected menu when the dining hall has one menu slot", () => {
    expect(
      toggleGuildDiningMenuSelection(
        ["hearty_stew"],
        "adventurer_meal",
        1,
      ),
    ).toEqual(["adventurer_meal"]);
  });

  it("keeps at least one menu selected", () => {
    expect(
      toggleGuildDiningMenuSelection(["hearty_stew"], "hearty_stew", 1),
    ).toEqual(["hearty_stew"]);
  });

  it("keeps multi-slot selection within its capacity", () => {
    expect(
      toggleGuildDiningMenuSelection(
        ["hearty_stew", "adventurer_meal"],
        "worker_lunch",
        2,
      ),
    ).toEqual(["hearty_stew", "adventurer_meal"]);
  });
});
