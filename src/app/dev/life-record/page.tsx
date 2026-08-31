import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { FISH_IDS } from "@/adventure/data/v2/fish";
import { lifeSummaryFromSaves } from "@/adventure/v2/lifeSummary";
import { V2LifeRecordView } from "@/adventure/v2/V2LifeRecordView";

const PREVIEW_SUMMARY = lifeSummaryFromSaves(
  {
    farmRaw: {
      stats: {
        farmingXp: 6_800,
        harvests: 328,
        rareHarvests: 27,
        deliveries: 84,
        reputation: 1_240,
      },
    },
    woodcuttingRaw: {
      cuts: 612,
      xp: 39_200,
      perfectCuts: 146,
      timberEarned: 784,
      bestCombo: 23,
    },
    miningRaw: {
      successes: 405,
      xp: 18_200,
      oreEarned: 536,
      byproductsEarned: 91,
      nodes: { iron: 405 },
    },
    fishingRaw: {
      xp: 28_100,
      catches: 958,
      ownedRods: ["reed_rod", "lacquered_rod", "deepcurrent_rod"],
      equippedRodId: "deepcurrent_rod",
      ownedLures: ["dough_lure", "tide_lure", "rare_lure"],
      equippedLureId: "rare_lure",
    },
    fishingCodexRaw: {
      fish: Object.fromEntries(
        FISH_IDS.slice(0, 18).map((fishId, index) => [
          fishId,
          {
            discovered: true,
            bestSize: 20 + index,
            totalCaught: index + 1,
          },
        ]),
      ),
    },
    cookingRaw: {
      xp: 3_100,
      discoveredRecipeIds: COOKING_PUBLIC_RECIPES.slice(0, 14).map(
        (recipe) => recipe.id,
      ),
      stats: {
        dishesCooked: 214,
        deliveriesCompleted: 63,
        masterpiecesCooked: 19,
        rareIngredientDishes: 31,
      },
    },
    craftingRaw: {
      artisan: { blacksmith: { xp: 4_900, crafts: 96 } },
      workshopStats: { totalCrafts: 86, qualityCrafts: 14 },
    },
  },
  Date.UTC(2026, 7, 6),
);

// 로그인·DB 없이 생활 기록 UI를 확인하는 개발 전용 샘플.
export default function LifeRecordPreviewPage() {
  return <V2LifeRecordView initialSummary={PREVIEW_SUMMARY} preview />;
}
