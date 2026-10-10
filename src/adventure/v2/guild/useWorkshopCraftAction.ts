import { useState } from "react";
import { TITLES } from "@/adventure/data/titles";
import type {
  GuildWorkshopCraftMode,
  GuildWorkshopRecipeId,
} from "@/adventure/data/v2/guildWorkshop";
import type { BlacksmithCraftControlSelection } from "@/adventure/data/v2/blacksmithSpecialization";
import {
  ERROR_TEXT,
  type CraftResultView,
  type WorkshopState,
} from "./guildWorkshopPanelModel";

/** 제작 응답 중 부모 워크숍 상태에 반영할 조각 — 부모 콜백(applyCraftServerState)의 입력. */
export type CraftServerSync = {
  ok: boolean;
  gold?: number;
  bankedGold?: number;
  spendableGold?: number;
  resources?: WorkshopState["resources"];
  materials?: WorkshopState["materials"];
  artisan?: WorkshopState["artisan"];
  workshopStats?: WorkshopState["workshopStats"];
  workshopRecords?: WorkshopState["workshopRecords"];
  guildBonus?: WorkshopState["guildBonus"];
  recipes?: WorkshopState["recipes"];
  blacksmithProgression?: WorkshopState["blacksmithProgression"];
};

export type WorkshopCraftControl = BlacksmithCraftControlSelection;

export function workshopCraftRequestBody({
  recipeId,
  craftMode,
  useMaterialSubstitution,
  outpostId,
  control,
}: {
  recipeId: GuildWorkshopRecipeId;
  craftMode: GuildWorkshopCraftMode;
  useMaterialSubstitution: boolean;
  outpostId?: string;
  control?: WorkshopCraftControl;
}) {
  return {
    recipeId,
    mode: craftMode,
    ...(outpostId ? { outpostId } : {}),
    useMaterialSubstitution,
    ...(control?.optionFocus ? { optionFocus: control.optionFocus } : {}),
    ...(control?.structure ? { structure: control.structure } : {}),
    ...(control?.useCatalyst ? { useCatalyst: true } : {}),
  };
}

// 제작 요청 + 결과 표시 상태 — 제작 탭(WorkshopCraftPanel)과 메인 탭 추천 카드가 공유한다.
export function useWorkshopCraftAction({
  state,
  endpoint,
  outpostId,
  onMessage,
  onServerSync,
  onAfterCraft,
  controlFor,
}: {
  state: WorkshopState | null;
  endpoint: string;
  outpostId?: string;
  onMessage: (text: string | null) => void;
  onServerSync: (sync: CraftServerSync) => void;
  onAfterCraft: () => void;
  /** 레시피별 전문 제작 조정(옵션 집중·구조·촉매). 없으면 기본값. */
  controlFor?: (recipeId: GuildWorkshopRecipeId) => WorkshopCraftControl;
}) {
  const [craftingId, setCraftingId] = useState<GuildWorkshopRecipeId | null>(
    null,
  );
  const [craftResult, setCraftResult] = useState<CraftResultView | null>(null);
  const pendingInspection = state?.blacksmithProgression?.pendingInspection;

  async function craft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode = "normal",
    useMaterialSubstitution = false,
  ) {
    if (pendingInspection) {
      onMessage(ERROR_TEXT.pending_inspection);
      return;
    }
    setCraftingId(recipeId);
    onMessage(null);
    setCraftResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workshopCraftRequestBody({
          recipeId,
          craftMode,
          outpostId,
          useMaterialSubstitution,
          control:
            craftMode === "normal" ||
            state?.recipes.find((recipe) => recipe.id === recipeId)?.techniques
              ?.masterworkTechniquesUnlocked
              ? (controlFor?.(recipeId) ?? { useCatalyst: false })
              : undefined,
        })),
      });
      const json = await res.json();
      if (!json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.");
        setCraftResult(null);
        onServerSync({ ok: false, ...json });
        return;
      }
      const crafted = state?.recipes.find((recipe) => recipe.id === recipeId);
      const selectedSubstitution =
        craftMode === "masterwork"
          ? crafted?.masterwork?.materialSubstitution
          : crafted?.materialSubstitution;
      onServerSync({ ok: true, ...json });
      const grantedTitleNames = Array.isArray(json.grantedTitles)
        ? json.grantedTitles
            .map((id: unknown) =>
              typeof id === "string" ? TITLES[id]?.name : undefined,
            )
            .filter((name: unknown): name is string => typeof name === "string")
        : [];
      if (json.pendingInspection) {
        setCraftResult(null);
        onAfterCraft();
        return;
      }
      setCraftResult({
        iid: typeof json.iid === "string" ? json.iid : null,
        itemName: crafted?.itemName ?? "장비",
        slot: crafted?.slot ?? "weapon",
        tier: crafted?.tier ?? 1,
        craftOnly: crafted?.craftOnly === true,
        craftQualityLevel: Math.max(
          0,
          Math.floor(Number(json.craftQuality?.level ?? 0)),
        ),
        craftMode:
          json.craftMode === "masterwork" || craftMode === "masterwork"
            ? "masterwork"
            : "normal",
        masterwork: json.craftMode === "masterwork" || craftMode === "masterwork",
        artisanXpGained: Math.max(
          0,
          Math.floor(Number(json.artisanXpGained ?? crafted?.artisanXp ?? 0)),
        ),
        grantedTitleNames,
        materialSubstitutionText:
          useMaterialSubstitution && selectedSubstitution
            ? selectedSubstitution.replacements
                .map(
                  (replacement) =>
                    `${replacement.requiredMaterialName} → ${replacement.substituteMaterialName} ${replacement.count}개`,
                )
                .join(" · ")
            : null,
        substitutionGoldCost: Math.max(
          0,
          Math.floor(Number(json.substitutionGoldCost) || 0),
        ),
      });
      onAfterCraft();
    } catch {
      onMessage("제작 요청을 처리하지 못했습니다.");
      setCraftResult(null);
    } finally {
      setCraftingId(null);
    }
  }

  return {
    craftingId,
    craftResult,
    closeCraftResult: () => setCraftResult(null),
    craft,
  };
}
