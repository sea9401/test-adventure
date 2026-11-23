import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 휴대폰 하단 메뉴 바가 생기면서, 화면 아래에 고정되던 요소는 바 높이만큼 위로 올라가야 한다.
// 높이는 globals.css의 --game-bottom-nav 하나로 정하고, 각 요소는 그 값을 더해 쓴다.
const CLEARANCE = "var(--game-bottom-nav,0px)";

const BOTTOM_ANCHORED = [
  ["채팅 버튼", "src/components/ChatButton.tsx"],
  ["보상 알림", "src/adventure/v2/RewardToastProvider.tsx"],
  ["새 버전 안내", "src/components/VersionCheck.tsx"],
  ["농장 안내", "src/adventure/v2/AdventurerFarmPanel.tsx"],
  ["낚시 버튼", "src/adventure/v2/FishingView.tsx"],
  ["강화 조작 줄", "src/adventure/v2/V2EnhanceView.tsx"],
  ["위험 해역 조우 조작 줄", "src/adventure/v2/DangerousFishingEncounterPanel.tsx"],
  ["위험 해역 낚시 조작 줄", "src/adventure/v2/DangerousFishingRealtimePanel.tsx"],
  ["사냥 화면 조작 카드", "src/adventure/v2/V2DungeonFloorView.tsx"],
  ["인벤토리 일괄 작업 줄", "src/adventure/v2/inventory/EquipmentTab.tsx"],
  ["전투 기록 맨 위로 버튼", "src/adventure/v2/BattleLogScrollTopButton.tsx"],
  ["본문 아래 여백", "src/adventure/v2/GameChrome.tsx"],
] as const;

describe("하단 메뉴 바와 겹치지 않기", () => {
  it("바 높이를 한 곳에서 정하고 PC 폭에서는 0으로 둔다", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /:root:has\(\[data-game-bottom-nav\]\)\s*\{\s*--game-bottom-nav: 3\.75rem;/,
    );
    expect(css).toMatch(
      /@media \(min-width: 768px\)\s*\{\s*:root:has\(\[data-game-bottom-nav\]\)\s*\{\s*--game-bottom-nav: 0px;/,
    );
  });

  it.each(BOTTOM_ANCHORED)("%s은(는) 바 높이만큼 위로 올린다", (_name, file) => {
    expect(readFileSync(file, "utf8")).toContain(CLEARANCE);
  });

  it("바 높이를 더하지 않은 옛 아래 고정 값이 남아 있지 않다", () => {
    for (const [, file] of BOTTOM_ANCHORED) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /bottom-\[calc\(env\(safe-area-inset-bottom\)\+[0-9.]+rem\)\]/,
      );
      expect(source, file).not.toMatch(/fixed inset-x-0 bottom-0/);
      expect(source, file).not.toMatch(/sticky bottom-[0-9]/);
    }
  });
});
