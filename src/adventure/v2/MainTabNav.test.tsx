import { describe, expect, it } from "vitest";
import { CHARACTER_MENU_ITEMS } from "./MainTabNav";

describe("상단 캐릭터 하위 메뉴", () => {
  it("전투 프리셋 전용 경로를 제공한다", () => {
    expect(CHARACTER_MENU_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "전투 프리셋",
          href: "/character/presets",
        }),
      ]),
    );
  });
});
