import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DANGEROUS_BAITS,
  DANGEROUS_DEPTHS,
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  DANGEROUS_ZONES,
} from "@/adventure/data/v2/dangerousFishing";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import { DangerousFishingShopSection } from "./DangerousFishingShopSection";
import { FishingShopView } from "./FishingShopView";
import type { DangerousFishingViewModel } from "./useDangerousFishing";
import { dangerousFishingShopMessage } from "./useDangerousFishingShop";

function shopModel(): DangerousFishingViewModel {
  return {
    ok: true,
    now: 1_800_000_000_000,
    state: {
      ...emptyDangerousFishingState(),
      voyage: null,
      bossAttempt: null,
    },
    heritage: {
      unlocked: true,
      fishingLevel: 25,
      levelAssistPct: 0,
      highestFishingJobId: "fisher",
      lineage: {
        telegraphSteps: 1,
        targetReadingPct: 0,
        staminaBonusPct: 0,
        cargoProtectionPct: 0,
        deepTraceBonusPct: 0,
      },
      passives: {
        traceBonusPct: 0,
        targetReadingPct: 0,
        staminaBonusPct: 0,
        cargoProtectionPct: 0,
        sizeBonusPct: 0,
        deepTraceBonusPct: 0,
      },
    },
    fishingCoins: 150_000,
    activeAutoActivity: null,
    catalogs: {
      zones: DANGEROUS_ZONES,
      depths: DANGEROUS_DEPTHS,
      fish: DANGEROUS_FISH,
      rods: DANGEROUS_RODS,
      reels: DANGEROUS_REELS,
      lines: DANGEROUS_LINES,
      baits: DANGEROUS_BAITS,
    },
    riskPreview: { risk: 0, accidentChance: 0, maxLossFraction: 0 },
  };
}

describe("위험 해역 낚시 상점", () => {
  it("구매·장착 결과를 사용자가 바로 행동할 수 있는 문장으로 바꾼다", () => {
    expect(dangerousFishingShopMessage(true, "rod", "buy")).toBe("위험 해역 장비를 구매했다.");
    expect(dangerousFishingShopMessage(true, "line", "equip")).toContain("장착");
    expect(dangerousFishingShopMessage(false, "bait", "buy", "insufficient_coins")).toContain("부족");
    expect(dangerousFishingShopMessage(false, "rod", "equip", "encounter_active")).toContain("조우");
  });

  it("전용 장비와 미끼를 이미지·보유·장착·가격 상태와 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingShopSection
        model={shopModel()}
        coins={150_000}
        buying={null}
        onShop={vi.fn(async () => ({ ok: true, message: "완료" }))}
      />,
    );

    expect(html).toContain("위험 해역 전용 장비");
    expect(html).toContain("낚싯대");
    expect(html).toContain("릴");
    expect(html).toContain("낚싯줄");
    expect(html).toContain("특수 미끼");
    expect(html).toContain("starter_rod.webp");
    expect(html).toContain("reef_bait.webp");
    expect(html).toContain("장착 중");
    expect(html).toContain("25,000");
    expect(html).toContain("최대 장력 -3");
    expect(html).toContain("회수력 +1");
    expect(html).toContain("보유 0개");
    expect(html).not.toMatch(/bg-[^" ]+\/40/);
    expect(html).not.toMatch(/bg-[^" ]+\/70/);
  });

  it("기존 낚시 상점 안에서 일반 낚시와 위험 해역 탭을 분리한다", () => {
    const dangerous = shopModel();
    const html = renderToStaticMarkup(
      <FishingShopView
        state={{
          coins: 150_000,
          ownedTitleIds: [],
          staminaPotions: 0,
          progression: null,
          seedPouch: null,
          staminaPotionLimit: null,
        }}
        loading={false}
        buying={null}
        onBuy={vi.fn(async () => ({ ok: true, message: "완료" }))}
        dangerousShop={{
          model: dangerous,
          loading: false,
          error: null,
          buying: null,
          onShop: vi.fn(async () => ({ ok: true, message: "완료" })),
        }}
        initialTab="dangerous"
      />,
    );

    expect(html).toContain("일반 낚시");
    expect(html).toContain("위험 해역");
    expect(html).toContain("위험 해역 전용 장비");
    expect(html).not.toContain(">칭호<");
  });
});
