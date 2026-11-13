"use client";

import { useState } from "react";
import { GameDialogHost } from "@/components/ui/GameDialogHost";
import { CookingBranchPanel } from "@/adventure/v2/cooking/CookingBranchPanel";
import {
  cookingBranchMasterpieceBonusPct,
  cookingBranchNextRankXp,
  cookingBranchRankForXp,
  type CookingBranchId,
} from "@/adventure/v2/cooking/branch";
import type {
  CookingBranchView,
  CookingMutation,
  CookingResponse,
} from "@/adventure/v2/cooking/clientTypes";

const PREVIEW_NOW = Date.parse("2026-11-13T12:00:00+09:00");

function previewData(branch: CookingBranchView): CookingResponse {
  return {
    now: PREVIEW_NOW,
    level: 62,
    cooking: { specialty: { field: "baking", xp: 7_210 } },
    branch,
    farmItems: { wheat: 17_864, milk: 256, egg: 550, potato: 12, sugarcane: 261, strawberry: 131, cacao: 248, golden_wheat: 13 },
    fishingItems: {},
    kitchenItems: { "pantry:yeast": 40, "processed:cheese": 4, "processed:butter": 12, "processed:cream": 9 },
    farmItemDefinitions: {
      wheat: { name: "밀" },
      milk: { name: "우유" },
      egg: { name: "달걀" },
      potato: { name: "감자" },
      sugarcane: { name: "사탕수수" },
      strawberry: { name: "딸기" },
      cacao: { name: "카카오" },
      rice: { name: "쌀" },
      golden_wheat: { name: "황금 밀" },
      royal_cacao: { name: "왕실 카카오" },
      crystal_sugarcane: { name: "수정 사탕수수" },
    },
    fishingItemDefinitions: {},
    pantryItems: [{ id: "pantry:yeast", name: "효모" }],
    processingRecipes: [
      { outputId: "processed:cheese", name: "치즈" },
      { outputId: "processed:butter", name: "버터" },
      { outputId: "processed:cream", name: "생크림" },
      { outputId: "processed:flour", name: "밀가루" },
    ],
  } as unknown as CookingResponse;
}

function viewFor(current: CookingBranchId | null, xpByBranch: CookingBranchView["xpByBranch"]): CookingBranchView {
  const xp = current ? xpByBranch[current] ?? 0 : 0;
  const rank = current ? cookingBranchRankForXp(xp) : 0;
  return {
    eligible: true,
    current,
    rank,
    xp,
    nextRankXp: current ? cookingBranchNextRankXp(xp) : null,
    xpByBranch,
    nextChangeAt: null,
    masterpieceBonusPct: cookingBranchMasterpieceBonusPct(rank),
  };
}

// 개발 전용 — 주방의 특화 화면을 로그인 없이 확인한다. 선택과 제작은 화면 안 mock 상태에만 적용된다.
export default function CookingBranchPreview() {
  const [view, setView] = useState<CookingBranchView>(() =>
    viewFor("baking_bread", { baking_bread: 3_400, baking_pastry: 1_200 }),
  );
  const mutate: CookingMutation = async (body) => {
    if (body.action === "choose_branch") {
      setView((current) => viewFor(body.branchId as CookingBranchId, current.xpByBranch));
    }
    return undefined;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <GameDialogHost />
      <button
        type="button"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        onClick={() => setView(viewFor(null, {}))}
      >
        고르기 전 상태로
      </button>
      <CookingBranchPanel data={previewData(view)} busy={false} mutate={mutate} />
    </main>
  );
}
