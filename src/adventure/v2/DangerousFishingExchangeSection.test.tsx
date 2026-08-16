import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dangerousBossMaterialId } from "@/adventure/data/v2/dangerousFishing";
import { DANGEROUS_FISHING_EXCHANGE_ENTRIES } from "./dangerousFishingExchange";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import {
  DangerousFishingExchangeConfirmDialog,
  DangerousFishingExchangeSection,
} from "./DangerousFishingExchangeSection";
import {
  dangerousFishingExchangeMessage,
  type DangerousFishingExchangeViewModel,
} from "./useDangerousFishingExchange";

function exchangeModel(): DangerousFishingExchangeViewModel {
  const tidalToken = dangerousBossMaterialId("tidal_colossus");
  return {
    ok: true,
    unlocked: true,
    requiredLevel: 15,
    fishingLevel: 25,
    materials: {
      danger_catch_ironjaw_tuna: 3,
      danger_catch_thunder_ray: 5,
      [tidalToken]: 12,
    },
    fishingCoins: 50_000,
    state: emptyDangerousFishingState(),
    ownedTitleIds: [],
    ownedCosmeticIds: [],
    entries: DANGEROUS_FISHING_EXCHANGE_ENTRIES.map((entry) => ({
      ...entry,
      alreadyOwned: entry.id === "token_maelstrom_reel",
      maxBatches:
        entry.id === "catch_rare_to_blood_bait"
          ? 2
          : entry.id === "token_tidal_to_luminous_bait"
            ? 12
            : 0,
    })),
  };
}

describe("위험 해역 교환 UI", () => {
  it("어획물·장비·수집·반복 교환을 불투명 표면과 상태로 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
      />,
    );
    expect(html).toContain("위험 해역 교환");
    expect(html).toContain("어획물 납품");
    expect(html).toContain("증표 장비 교환");
    expect(html).toContain("수집 보상");
    expect(html).toContain("반복 미끼 교환");
    expect(html).toContain("교환 가능 2회");
    expect(html).toContain("최대 2회 교환");
    expect(html).toContain("보유 중");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toMatch(/bg-[^" ]+\/(40|70)/);
  });

  it("확인창에 혼합 납품의 어종별 소모와 교환 후 잔량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingExchangeConfirmDialog
        pending={{
          operationId: "4fd3980e-0d2f-4f0d-8214-0b7e51bd52f4",
          entryId: "catch_rare_to_blood_bait",
          entryName: "희귀 어획물 납품",
          batches: 2,
          selectedMaterials: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          costMaterials: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          materialBalances: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          coinCost: 0,
          fishingCoins: 50_000,
          outputLabel: "핏빛 미끼 10개",
        }}
        exchanging={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("희귀 어획물 납품 2회");
    expect(html).toContain("뇌광 가오리 5개");
    expect(html).toContain("교환 후 0개");
    expect(html).toContain("철턱 참치 3개");
    expect(html).toContain("핏빛 미끼 10개");
  });

  it("교환 오류를 다음 행동이 드러나는 문장으로 바꾼다", () => {
    expect(dangerousFishingExchangeMessage(false, "insufficient_materials")).toContain("재료");
    expect(dangerousFishingExchangeMessage(false, "insufficient_coins")).toContain("코인");
    expect(dangerousFishingExchangeMessage(false, "already_owned")).toContain("보유");
    expect(dangerousFishingExchangeMessage(true, undefined, true)).toContain("이미 처리");
  });
});
