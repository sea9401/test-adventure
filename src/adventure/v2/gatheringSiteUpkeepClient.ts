// 채집지 정비 화면이 쓰는 요청·오류 문구. 응답 모양은 /api/v2/life-workshop/upkeep 와 같다.

import {
  parseGatheringSiteUpkeep,
  type GatheringSiteId,
  type GatheringSiteUpkeepView,
} from "./gatheringSiteUpkeep";

const ERROR_LABELS: Record<string, string> = {
  upkeep_max: "이미 최고 단계입니다.",
  upkeep_master_locked: "그 생활의 주전공 명장 3단계부터 올릴 수 있습니다.",
  not_enough_materials: "원자재가 모자랍니다.",
  not_enough_byproducts: "부산물이 모자랍니다.",
  not_enough_master_product: "명장 산물이 모자랍니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export function gatheringSiteUpkeepErrorLabel(error: unknown): string {
  return (typeof error === "string" && ERROR_LABELS[error]) || "정비하지 못했습니다.";
}

function parseView(json: Record<string, unknown>): GatheringSiteUpkeepView {
  const materials: Record<string, number> = {};
  if (json.materials && typeof json.materials === "object") {
    for (const [id, amount] of Object.entries(json.materials as Record<string, unknown>)) {
      const count = Math.floor(Number(amount) || 0);
      if (count > 0) materials[id] = count;
    }
  }
  const unlocked = (json.masterUnlocked ?? {}) as Record<string, unknown>;
  return {
    stages: parseGatheringSiteUpkeep(json.stages),
    materials,
    masterUnlocked: { mining: unlocked.mining === true, woodcutting: unlocked.woodcutting === true },
  };
}

export async function fetchGatheringSiteUpkeep(): Promise<GatheringSiteUpkeepView | null> {
  try {
    const response = await fetch("/api/v2/life-workshop/upkeep");
    const json = (await response.json()) as Record<string, unknown>;
    return response.ok && json.ok ? parseView(json) : null;
  } catch {
    return null;
  }
}

export type GatheringSiteUpkeepResponse =
  | { ok: true; view: GatheringSiteUpkeepView; stage: number; grantedTitleIds: string[] }
  | { ok: false; error: string };

export async function requestGatheringSiteUpkeep(
  siteId: GatheringSiteId,
): Promise<GatheringSiteUpkeepResponse> {
  try {
    const response = await fetch("/api/v2/life-workshop/upkeep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "failed" };
    }
    const result = (json.result ?? {}) as { stage?: unknown; grantedTitleIds?: unknown };
    return {
      ok: true,
      view: parseView(json),
      stage: Math.floor(Number(result.stage) || 0),
      grantedTitleIds: Array.isArray(result.grantedTitleIds)
        ? result.grantedTitleIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return { ok: false, error: "failed" };
  }
}
