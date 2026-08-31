import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkshopSpecializationPanel } from "./WorkshopSpecializationPanel";
import type { WorkshopState } from "./guildWorkshopPanelModel";

function state(level: number, specialty?: "weapon" | "armor" | "jewelry"): WorkshopState {
  return {
    hasGuildSmithy: true,
    favoriteRecipeIds: [],
    spendableGold: 0,
    resources: {},
    materials: {},
    artisan: {
      blacksmith: {
        name: "대장장이",
        xp: 0,
        crafts: 0,
        level,
        xpIntoLevel: 0,
        xpForNext: 1,
      },
    },
    workshopStats: { totalCrafts: 0, qualityCrafts: 0, craftedByRecipe: {} },
    guildBonus: {
      totalCrafts: 0,
      qualityChanceBonusPct: 0,
      tier: 0,
      nextTotalCrafts: null,
    },
    recipes: [],
    blacksmithProgression: specialty ? { specialty } : {},
    signatureCandidates: specialty
      ? [
          {
            iid: "eq_signature",
            equipmentId: "v2_crafted_gale_bow",
            itemName: "질풍궁",
            slot: "weapon",
            masterwork: true,
            craftQualityLevel: 2,
          },
        ]
      : [],
  };
}

function render(workshopState: WorkshopState) {
  return renderToStaticMarkup(
    <WorkshopSpecializationPanel
      state={workshopState}
      onProgressionChange={vi.fn()}
      onMessage={vi.fn()}
    />,
  );
}

describe("WorkshopSpecializationPanel", () => {
  it("shows the Lv.13 gate before permanent selection unlocks", () => {
    const html = render(state(12));
    expect(html).toContain("Lv 13");
    expect(html).not.toContain(">무기 단조</button>");
  });

  it("shows all three choices and a permanent warning at level 13", () => {
    const html = render(state(13));
    expect(html).toContain("무기 단조");
    expect(html).toContain("방어구 단조");
    expect(html).toContain("장신구 세공");
    expect(html).toContain("영구 전문 분야 선택");
    expect(html).toContain("변경하거나 초기화할 수 없습니다");
  });

  it("shows the locked specialty and representative-work selector without reset", () => {
    const html = render(state(28, "weapon"));
    expect(html).toContain("선택 분야 · 무기 단조");
    expect(html).toContain("변경할 수 없습니다");
    expect(html).toContain("대표작");
    expect(html).toContain("질풍궁");
    expect(html).not.toContain("초기화");
  });
});
