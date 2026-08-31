import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeMaterialCost,
  guildWorkshopRecipeView,
} from "@/adventure/data/v2/guildWorkshop";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  WorkshopCraftPanel,
  matchesWorkshopCodexFilter,
  matchesWorkshopTierFilter,
  workshopCraftRequestBody,
} from "./WorkshopCraftPanel";
import type {
  WorkshopEquipmentCodexLoadStatus,
  WorkshopState,
} from "./guildWorkshopPanelModel";

const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
const recipeItemName = guildWorkshopRecipeView(recipe, {}).itemName;

function workshopState(): WorkshopState {
  return {
    hasGuildSmithy: true,
    favoriteRecipeIds: [],
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
  state: WorkshopState = workshopState(),
) {
  return renderToStaticMarkup(
    <WorkshopCraftPanel
      state={state}
      weekly={null}
      recommendedRecipeId={null}
      registeredEquipmentIds={registeredEquipmentIds}
      equipmentCodexStatus={equipmentCodexStatus}
      loading={false}
      onMessage={vi.fn()}
      onServerSync={vi.fn()}
      onAfterCraft={vi.fn()}
      onFavoriteRecipeIdsChange={vi.fn()}
      autoCraft={null}
      onAutoCraftConsumed={vi.fn()}
    />,
  );
}

describe("guild workshop recipe equipment codex badge", () => {
  it("builds a craft request with only the selected professional controls", () => {
    expect(
      workshopCraftRequestBody({
        recipeId: recipe.id,
        craftMode: "normal",
        useMaterialSubstitution: false,
        outpostId: undefined,
        control: {
          optionFocus: "weapon_offense",
          structure: "primary",
          useCatalyst: true,
        },
      }),
    ).toEqual({
      recipeId: recipe.id,
      mode: "normal",
      useMaterialSubstitution: false,
      optionFocus: "weapon_offense",
      structure: "primary",
      useCatalyst: true,
    });
  });

  it("shows only server-provided focus, structure, and catalyst choices", () => {
    const controlledState: WorkshopState = {
      ...workshopState(),
      blacksmithProgression: { specialty: "weapon" },
      materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 3 },
      recipes: [
        {
          ...guildWorkshopRecipeView(recipe, {}),
          techniques: {
            eligible: true,
            optionFocuses: [
              {
                id: "weapon_offense",
                name: "화력",
                optionKeys: ["crit", "critMult"],
              },
            ],
            structures: [
              { id: "balanced", name: "균형 제작", requiredLevel: 20 },
              { id: "stable", name: "안정 제작", requiredLevel: 22 },
            ],
            focusChancePct: 75,
            catalystUnlocked: true,
            catalystFocusChancePct: 90,
            catalystPreserveChancePct: 20,
            masterworkTechniquesUnlocked: false,
            signatureUnlocked: false,
            inspectionUnlocked: false,
            catalyst: {
              materialId: GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
              required: 1,
              owned: 3,
            },
          },
        },
      ],
    };

    const html = renderWorkshop(new Set(), "ready", controlledState);
    expect(html).toContain("전문 제작 설정");
    expect(html).toContain("화력");
    expect(html).toContain("균형 제작");
    expect(html).toContain("안정 제작");
    expect(html).toContain("기본 75% · 촉매 90%");
    expect(html).toContain("정제 철괴 1개 · 보유 3개");
    expect(html).not.toContain("저항");
  });
  it("shows normal and masterwork crafting fees", () => {
    const html = renderWorkshop(new Set());
    expect(html).toContain("제작 수수료: 10,000 G");
    expect(html).toContain("제작 수수료: 20,000 G");
  });

  it("부족한 일반·명장 제작 재료에 필요량과 보유량을 표시한다", () => {
    const shortageRecipe = GUILD_WORKSHOP_RECIPES.crafted_toxic_mist_gloves;
    const materialCost = guildWorkshopRecipeMaterialCost(shortageRecipe);
    const materials = Object.fromEntries(
      Object.entries(materialCost).map(([id, amount]) => [id, amount ?? 0]),
    );
    materials[GUILD_WORKSHOP_MATERIAL_ID.mithrilShard] = 1;
    materials[GUILD_WORKSHOP_MATERIAL_ID.sunstone] = 1;
    const state: WorkshopState = {
      ...workshopState(),
      materials,
      smithyLevel: 5,
      recipes: [
        guildWorkshopRecipeView(
          shortageRecipe,
          {},
          { blacksmith: { xp: 999_999, crafts: 999 } },
          0,
          5,
          materials,
        ),
      ],
    };

    const html = renderWorkshop(new Set(), "ready", state);
    expect(html).toContain(
      '<span class="font-semibold text-rose-700 dark:text-rose-300">미스릴 조각 2 (필요 2 · 보유 1 · 부족)</span>',
    );
    expect(html).toContain("<span>태양석 1</span>");
    expect(html).toContain(
      '<span class="font-semibold text-rose-700 dark:text-rose-300">태양석 2 (필요 2 · 보유 1 · 부족)</span>',
    );
  });

  it("shows an explicit higher-material substitution action and marketplace link", () => {
    const substituteRecipe = GUILD_WORKSHOP_RECIPES.crafted_master_ring;
    const cost = guildWorkshopRecipeMaterialCost(substituteRecipe);
    const materials = Object.fromEntries(
      Object.entries(cost).map(([id, amount]) => [id, amount ?? 0]),
    );
    materials[GUILD_WORKSHOP_MATERIAL_ID.refinedIron] = 0;
    materials[GUILD_WORKSHOP_MATERIAL_ID.mithrilShard] = 2;
    const state: WorkshopState = {
      ...workshopState(),
      materials,
      smithyLevel: 2,
      recipes: [
        guildWorkshopRecipeView(
          substituteRecipe,
          {},
          { blacksmith: { xp: 999_999, crafts: 999 } },
          0,
          2,
          materials,
        ),
      ],
    };

    const html = renderWorkshop(new Set(), "ready", state);
    expect(html).toContain("정제 철괴 부족분 2개");
    expect(html).toContain("미스릴 조각 2개");
    expect(html).toContain("추가 4,000 G");
    expect(html).toContain("상위 재료로 대체 제작");
    expect(html).toContain('href="/plaza/market"');
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

  it("제작 레시피 즐겨찾기 필터와 별표 상태를 표시한다", () => {
    const state = {
      ...workshopState(),
      favoriteRecipeIds: [recipe.id],
    };
    const html = renderWorkshop(new Set(), "ready", state);

    expect(html).toContain('<option value="favorite">즐겨찾기</option>');
    expect(html).toContain(
      `aria-label="${recipeItemName} 즐겨찾기 해제"`,
    );
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows tier navigation without the redundant set description", () => {
    const html = renderWorkshop(new Set(), "ready");
    expect(html).toContain('aria-label="제작 장비 티어"');
    expect(html).toContain("2T 1종");
    expect(html).not.toContain("수호/격노/질풍/룬 각인 장비 중심");
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

describe("matchesWorkshopTierFilter", () => {
  it("groups internal equipment tiers into the displayed 1T-6T bands", () => {
    expect(matchesWorkshopTierFilter({ tier: 1 }, 1)).toBe(true);
    expect(matchesWorkshopTierFilter({ tier: 4 }, 2)).toBe(true);
    expect(matchesWorkshopTierFilter({ tier: 13 }, 5)).toBe(true);
    expect(matchesWorkshopTierFilter({ tier: 16 }, 6)).toBe(true);
    expect(matchesWorkshopTierFilter({ tier: 4 }, 1)).toBe(false);
    expect(matchesWorkshopTierFilter({ tier: 4 }, "all")).toBe(true);
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
