// 보석 세공 화면이 쓰는 요청·오류 문구. 응답 모양은 /api/v2/life-workshop/gem-cut 과 같다.

import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  GEM_CUT_REQUIRED_MINING_LEVEL,
  type CutGemGrade,
  type GemCutMode,
} from "./gemCutting";

export type GemCuttingView = {
  miningLevel: number;
  masterUnlocked: boolean;
  roughGems: number;
  masterAlloy: number;
  /** 보유한 세공 보석(등급 → 개수). */
  cutGems: Record<CutGemGrade, number>;
};

const ERROR_LABELS: Record<string, string> = {
  mining_level_required: `채광 Lv.${GEM_CUT_REQUIRED_MINING_LEVEL}부터 세공할 수 있습니다.`,
  master_locked: "명장 세공은 채광 주전공 명장 3단계부터 할 수 있습니다.",
  not_enough_rough_gems: "원석 보석이 모자랍니다.",
  not_enough_master_alloy: "명장 합금이 모자랍니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export function gemCuttingErrorLabel(error: unknown): string {
  return (typeof error === "string" && ERROR_LABELS[error]) || "세공하지 못했습니다.";
}

function count(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function parseView(json: Record<string, unknown>): GemCuttingView {
  const held = (json.cutGems ?? {}) as Record<string, unknown>;
  return {
    miningLevel: count(json.miningLevel),
    masterUnlocked: json.masterUnlocked === true,
    roughGems: count(json.roughGems),
    masterAlloy: count(json.masterAlloy),
    cutGems: Object.fromEntries(
      CUT_GEM_GRADES.map((grade) => [grade, count(held[CUT_GEMS[grade].id])]),
    ) as Record<CutGemGrade, number>,
  };
}

export async function fetchGemCuttingView(): Promise<GemCuttingView | null> {
  try {
    const response = await fetch("/api/v2/life-workshop/gem-cut");
    const json = (await response.json()) as Record<string, unknown>;
    return response.ok && json.ok ? parseView(json) : null;
  } catch {
    return null;
  }
}

export type GemCutResponse =
  | { ok: true; view: GemCuttingView; results: Record<CutGemGrade, number> }
  | { ok: false; error: string };

export async function requestGemCut(mode: GemCutMode, amount: number): Promise<GemCutResponse> {
  try {
    const response = await fetch("/api/v2/life-workshop/gem-cut", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, count: amount }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "failed" };
    }
    const raw = ((json.result ?? {}) as { results?: Record<string, unknown> }).results ?? {};
    return {
      ok: true,
      view: parseView(json),
      results: Object.fromEntries(
        CUT_GEM_GRADES.map((grade) => [grade, count(raw[grade])]),
      ) as Record<CutGemGrade, number>,
    };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** "다듬은 보석 3, 정교한 보석 2" — 나온 등급만 적는다. */
export function gemCutResultText(results: Record<CutGemGrade, number>): string {
  return CUT_GEM_GRADES.filter((grade) => results[grade] > 0)
    .map((grade) => `${CUT_GEMS[grade].name} ${results[grade].toLocaleString("ko-KR")}`)
    .join(", ");
}
