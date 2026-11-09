import { useRef, useState } from "react";
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

/** 한 번에 이어서 제작할 수 있는 최대 횟수(#840). */
export const WORKSHOP_REPEAT_CRAFT_OPTIONS = [1, 5, 10, 20, 50] as const;

export type WorkshopCraftProgress = {
  recipeId: GuildWorkshopRecipeId;
  done: number;
  total: number;
};

type RepeatedCraftTally = {
  done: number;
  total: number;
  quality1: number;
  quality2: number;
  xp: number;
  titleNames: string[];
};

/** 연속 제작이 끝났을 때 알릴 한 줄 요약. */
export function repeatedCraftSummaryText(
  tally: RepeatedCraftTally,
  outcome: "complete" | "stopped" | { error: string },
): string {
  const head =
    outcome === "complete"
      ? ["연속 제작 완료", `${tally.done.toLocaleString()}회`]
      : [
          outcome === "stopped" ? "연속 제작 중지" : "연속 제작 멈춤",
          `${tally.total.toLocaleString()}회 중 ${tally.done.toLocaleString()}회`,
        ];
  return [
    ...head,
    ...(tally.quality1 > 0 ? [`★ ${tally.quality1.toLocaleString()}개`] : []),
    ...(tally.quality2 > 0 ? [`★★ ${tally.quality2.toLocaleString()}개`] : []),
    ...(tally.xp > 0 ? [`숙련도 +${tally.xp.toLocaleString()}`] : []),
    ...tally.titleNames.map((name) => `칭호 ${name}`),
    ...(typeof outcome === "object" ? [outcome.error] : []),
  ].join(" · ");
}

function grantedTitleNamesOf(json: { grantedTitles?: unknown }): string[] {
  return Array.isArray(json.grantedTitles)
    ? json.grantedTitles
        .map((id: unknown) =>
          typeof id === "string" ? TITLES[id]?.name : undefined,
        )
        .filter((name: unknown): name is string => typeof name === "string")
    : [];
}

// 제작 요청 + 결과 표시 상태 — 제작 탭(WorkshopCraftPanel)과 메인 탭 추천 카드가 공유한다.
// times > 1 이면 같은 제작을 서버에 차례로 다시 요청한다(연속 제작, #840). 실패·최종 검수·
// 중지 요청이 생기면 그 자리에서 멈추고, 결과 창 대신 합계를 메시지로 알린다.
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
  const [craftProgress, setCraftProgress] =
    useState<WorkshopCraftProgress | null>(null);
  const stopRequestedRef = useRef(false);
  const pendingInspection = state?.blacksmithProgression?.pendingInspection;

  async function requestCraft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode,
    useMaterialSubstitution: boolean,
  ) {
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
    return res.json();
  }

  async function craftRepeated(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode,
    useMaterialSubstitution: boolean,
    times: number,
  ) {
    const tally: RepeatedCraftTally = {
      done: 0,
      total: times,
      quality1: 0,
      quality2: 0,
      xp: 0,
      titleNames: [],
    };
    const fallbackXp =
      state?.recipes.find((recipe) => recipe.id === recipeId)?.artisanXp ?? 0;
    let outcome: "complete" | "stopped" | { error: string } = "complete";
    setCraftProgress({ recipeId, done: 0, total: times });
    try {
      while (tally.done < times) {
        if (stopRequestedRef.current) {
          outcome = "stopped";
          break;
        }
        const json = await requestCraft(recipeId, craftMode, useMaterialSubstitution);
        if (!json.ok) {
          onServerSync({ ok: false, ...json });
          outcome = {
            error: ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.",
          };
          break;
        }
        onServerSync({ ok: true, ...json });
        tally.done += 1;
        const level = Math.floor(Number(json.craftQuality?.level ?? 0));
        if (level === 1) tally.quality1 += 1;
        if (level >= 2) tally.quality2 += 1;
        tally.xp += Math.max(
          0,
          Math.floor(Number(json.artisanXpGained ?? fallbackXp)),
        );
        tally.titleNames.push(...grantedTitleNamesOf(json));
        setCraftProgress({ recipeId, done: tally.done, total: times });
        if (json.pendingInspection) {
          if (tally.done < times) {
            outcome = { error: "최종 검수를 확정해야 이어서 제작할 수 있습니다." };
          }
          break;
        }
      }
      if (stopRequestedRef.current && outcome === "complete" && tally.done < times) {
        outcome = "stopped";
      }
    } catch {
      outcome = { error: "제작 요청을 처리하지 못했습니다." };
    }
    if (tally.done === 0) {
      onMessage(
        typeof outcome === "object" ? outcome.error : null,
      );
      return;
    }
    onMessage(repeatedCraftSummaryText(tally, outcome));
    onAfterCraft();
  }

  async function craft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode = "normal",
    useMaterialSubstitution = false,
    times = 1,
  ) {
    if (pendingInspection) {
      onMessage(ERROR_TEXT.pending_inspection);
      return;
    }
    setCraftingId(recipeId);
    onMessage(null);
    setCraftResult(null);
    stopRequestedRef.current = false;
    const repeat = Math.max(1, Math.floor(times));
    if (repeat > 1) {
      try {
        await craftRepeated(recipeId, craftMode, useMaterialSubstitution, repeat);
      } finally {
        setCraftProgress(null);
        setCraftingId(null);
      }
      return;
    }
    try {
      const json = await requestCraft(recipeId, craftMode, useMaterialSubstitution);
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
      const grantedTitleNames = grantedTitleNamesOf(json);
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
    craftProgress,
    closeCraftResult: () => setCraftResult(null),
    stopCraft: () => {
      stopRequestedRef.current = true;
    },
    craft,
  };
}
