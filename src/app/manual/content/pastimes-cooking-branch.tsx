import {
  COOKING_BRANCHES,
  COOKING_BRANCH_CHANGE_COOLDOWN_MS,
  COOKING_BRANCH_MASTERPIECE_PCT_PER_RANK,
  COOKING_BRANCH_MAX_RANK,
  COOKING_BRANCH_RANK_XP,
} from "@/adventure/v2/cooking/branch";
import { COOKING_BRANCH_RECIPES } from "@/adventure/v2/cooking/branchRecipes";
import { cookingEffectText } from "@/adventure/v2/cooking/foodShared";
import {
  COOKING_PANTRY_ITEMS,
  COOKING_PROCESSING_RECIPES,
} from "@/adventure/v2/cooking/kitchen";
import {
  COOKING_FIELD_NAMES,
  COOKING_METHOD_NAMES,
  type CookingIngredientId,
} from "@/adventure/v2/cooking/types";
import { FARM_ITEMS, type FarmItemId } from "@/adventure/v2/farm";
import {
  FISHING_CATCH_ITEMS,
  type FishingCatchItemId,
} from "@/adventure/v2/fishingStock";
import { H2, UL, Em, Table } from "./primitives";

// 생활 안내서의 "요리 특화" 항목. 생활 안내서 본문(pastimes.tsx)이 불러 쓴다.

function cookingIngredientName(id: CookingIngredientId): string {
  const [kind, shortId] = id.split(":");
  if (kind === "farm") return FARM_ITEMS[shortId as FarmItemId]?.name ?? shortId;
  if (kind === "fishing") {
    return FISHING_CATCH_ITEMS[shortId as FishingCatchItemId]?.name ?? shortId;
  }
  return (
    COOKING_PANTRY_ITEMS.find((item) => item.id === id)?.name ??
    COOKING_PROCESSING_RECIPES.find((item) => item.outputId === id)?.name ??
    shortId
  );
}

const COOKING_BRANCH_DISH_ROWS = COOKING_BRANCH_RECIPES.map((dish) => {
  const branch = COOKING_BRANCHES.find((entry) => entry.id === dish.branchId)!;
  return [
    `${COOKING_FIELD_NAMES[branch.field]} · ${branch.name}`,
    `${dish.requiredRank}`,
    dish.name,
    cookingEffectText(dish.effect),
    dish.ingredients
      .map((ingredient) => `${cookingIngredientName(ingredient.id)} ${ingredient.count}`)
      .join(", "),
  ];
});

export function CookingBranchManualSection() {
  return (
    <>
      <H2>요리 특화</H2>
      <UL>
        <li>
          전문 분야 랭크 5가 되면 주방의 전문 분야 탭에서 자기 전문 분야에 속한 <Em>특화</Em> 하나를
          고를 수 있습니다. 특화는 분야 안의 조리법으로 나뉩니다:{" "}
          {COOKING_BRANCHES.map(
            (branch) =>
              `${COOKING_FIELD_NAMES[branch.field]} ${branch.name}(${branch.methods
                .map((method) => COOKING_METHOD_NAMES[method])
                .join("·")})`,
          ).join(", ")}
          .
        </li>
        <li>
          고른 특화에 속한 음식(분야와 조리법이 맞는 음식과 전용 요리)을 만들면 1개당 티어 × 10의
          특화 숙련이 쌓입니다. 랭크 2~{COOKING_BRANCH_MAX_RANK}의 누적 요구량은{" "}
          {COOKING_BRANCH_RANK_XP.slice(1)
            .map((xp) => xp.toLocaleString("ko-KR"))
            .join(" · ")}
          이며, 그 계열 음식의 걸작 확률이 랭크당{" "}
          <Em>+{COOKING_BRANCH_MASTERPIECE_PCT_PER_RANK}%p</Em> 오릅니다.
        </li>
        <li>
          랭크 1·3·5에서 그 특화만 만들 수 있는 <Em>전용 요리</Em>가 하나씩 열립니다. 연구 없이
          조합법이 공개되어 있고, 완성한 음식은 다른 음식처럼 사용·거래·납품할 수 있습니다.
          전용 요리는 요리 도감의 발견 수에 들어가지 않습니다.
        </li>
        <li>
          특화는 바꿀 수 있지만, 바꾼 뒤에는{" "}
          {COOKING_BRANCH_CHANGE_COOLDOWN_MS / 86_400_000}일 동안 다시 바꿀 수 없습니다. 쌓은 숙련은
          특화마다 따로 남고, 보너스와 전용 요리 제작은 지금 고른 특화에만 적용됩니다.
        </li>
      </UL>
      <Table
        head={["특화", "랭크", "전용 요리", "효과", "재료"]}
        rows={COOKING_BRANCH_DISH_ROWS}
        caption="전용 요리는 요리 Lv 20부터 만들 수 있습니다."
      />
    </>
  );
}
