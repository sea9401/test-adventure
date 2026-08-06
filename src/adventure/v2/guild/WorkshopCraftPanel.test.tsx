import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeView,
} from "@/adventure/data/v2/guildWorkshop";
import {
  WorkshopCraftPanel,
  matchesWorkshopCodexFilter,
} from "./WorkshopCraftPanel";
import type {
  WorkshopEquipmentCodexLoadStatus,
  WorkshopState,
} from "./guildWorkshopPanelModel";

const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;

function workshopState(): WorkshopState {
  return {
    hasGuildSmithy: true,
    spendableGold: Number.MAX_SAFE_INTEGER,
    resources: {},
    materials: {},
    artisan: {
      blacksmith: {
        name: "대장장이",
        xp: 0,
        crafts: 0,
        level: 1,
        xpIntoLevel: 0,
        xpForNext: 100,
      },
    },
    workshopStats: { totalCrafts: 0, qualityCrafts: 0, craftedByRecipe: {} },
    guildBonus: {
      totalCrafts: 0,
      qualityChanceBonusPct: 0,
      tier: 0,
      nextTotalCrafts: null,
    },
    recipes: [guildWorkshopRecipeView(recipe, {})],
  };
}

function renderWorkshop(
  registeredEquipmentIds: ReadonlySet<string>,
  equipmentCodexStatus: WorkshopEquipmentCodexLoadStatus = "ready",
) {
  return renderToStaticMarkup(
    <WorkshopCraftPanel
      state={workshopState()}
      weekly={null}
      recommendedRecipeId={null}
      registeredEquipmentIds={registeredEquipmentIds}
      equipmentCodexStatus={equipmentCodexStatus}
      loading={false}
      onMessage={vi.fn()}
      onServerSync={vi.fn()}
      onAfterCraft={vi.fn()}
      autoCraft={null}
      onAutoCraftConsumed={vi.fn()}
    />,
  );
}

describe("guild workshop recipe equipment codex badge", () => {
  it("shows normal and masterwork crafting fees", () => {
    const html = renderWorkshop(new Set());
    expect(html).toContain("제작 수수료: 10,000 G");
    expect(html).toContain("제작 수수료: 20,000 G");
  });

  it("shows registered and unregistered status on the crafted item row", () => {
    const registeredHtml = renderWorkshop(new Set([recipe.equipmentId]));
    expect(registeredHtml).toContain(">도감 등록</span>");
    expect(registeredHtml).not.toContain(">도감 미등록</span>");

    const unregisteredHtml = renderWorkshop(new Set());
    expect(unregisteredHtml).toContain(">도감 미등록</span>");
  });

  it("shows a read failure instead of incorrectly marking the item unregistered", () => {
    const html = renderWorkshop(new Set(), "error");
    expect(html).toContain("도감 확인 실패");
    expect(html).not.toContain("도감 미등록");
  });

  it("shows an unregistered-only filter after the codex is ready", () => {
    const html = renderWorkshop(new Set(), "ready");
    expect(html).toContain("도감 미등록만");
    expect(html).toContain('aria-pressed="false"');
  });

  it("disables the codex filter while loading or after a read failure", () => {
    const loadingHtml = renderWorkshop(new Set(), "loading");
    const errorHtml = renderWorkshop(new Set(), "error");
    expect(loadingHtml).toContain("도감 확인 중");
    expect(errorHtml).toContain("도감 필터 사용 불가");
    expect(loadingHtml).toContain("disabled");
    expect(errorHtml).toContain("disabled");
  });
});

describe("matchesWorkshopCodexFilter", () => {
  const registered = new Set(["registered"]);

  it("필터를 켜면 도감 미등록 제작품만 통과시킨다", () => {
    expect(
      matchesWorkshopCodexFilter("registered", registered, "ready", true),
    ).toBe(false);
    expect(
      matchesWorkshopCodexFilter("unregistered", registered, "ready", true),
    ).toBe(true);
  });

  it("필터가 꺼졌거나 도감 조회가 완료되지 않았으면 목록을 숨기지 않는다", () => {
    expect(
      matchesWorkshopCodexFilter("registered", registered, "ready", false),
    ).toBe(true);
    expect(
      matchesWorkshopCodexFilter("registered", registered, "loading", true),
    ).toBe(true);
    expect(
      matchesWorkshopCodexFilter("registered", registered, "error", true),
    ).toBe(true);
  });
});
