// 생활 한 번에 정산 — 자동 채집 정산·재시작, 밭 수확·다시 심기, 목장 수거·사료 채우기를 차례로 요청한다.
// 새 서버 동작은 없다. 각 화면이 쓰는 기존 요청을 순서대로 보낼 뿐이라 규칙과 제한은 그대로 적용된다.
// 한 단계가 실패해도 나머지는 이어서 처리하고, 단계마다 결과 한 줄을 돌려준다.

import { farmReplantOutcomeText, runFarmHarvestAndReplant } from "./farmBatchActions";

export type LifeCollectLine = {
  area: "gathering" | "farm" | "ranch";
  tone: "ok" | "info" | "error";
  text: string;
};

type Json = Record<string, unknown>;
type Request = typeof fetch;

const ACTIVITY_NAME = { mining: "채광", woodcutting: "벌목" } as const;
type AutoActivity = keyof typeof ACTIVITY_NAME;

async function call(
  request: Request,
  url: string,
  body?: Json,
): Promise<{ ok: boolean; json: Json }> {
  try {
    const response = await request(
      url,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const json = ((await response.json().catch(() => null)) ?? {}) as Json;
    return { ok: response.ok && json.ok === true, json };
  } catch {
    return { ok: false, json: {} };
  }
}

function isAutoActivity(value: unknown): value is AutoActivity {
  return value === "mining" || value === "woodcutting";
}

async function collectGathering(request: Request): Promise<LifeCollectLine> {
  const line = (tone: LifeCollectLine["tone"], text: string): LifeCollectLine => ({
    area: "gathering",
    tone,
    text,
  });
  let status = await call(request, "/api/v2/mining/status");
  if (!status.ok) return line("error", "자동 채집: 상태를 불러오지 못했습니다.");
  const activity = status.json.activeAutoActivity;
  if (!isAutoActivity(activity)) return line("info", "자동 채집: 진행 중인 작업이 없습니다.");
  if (activity === "woodcutting") {
    status = await call(request, "/api/v2/woodcutting/status");
    if (!status.ok) return line("error", "자동 채집: 상태를 불러오지 못했습니다.");
  }
  const name = ACTIVITY_NAME[activity];
  const session = (status.json.autoSession ?? null) as Json | null;
  if (!session) return line("info", "자동 채집: 진행 중인 작업이 없습니다.");
  if (Number(status.json.serverNow) < Number(session.readyAt)) {
    return line("info", `자동 ${name}: 아직 진행 중입니다.`);
  }

  const claim = await call(request, `/api/v2/${activity}/auto`, { action: "claim" });
  if (!claim.ok) return line("error", `자동 ${name}: 정산하지 못했습니다.`);
  const gained = `${String(claim.json.materialName ?? "재료")} +${Math.max(
    0,
    Math.floor(Number(claim.json.materialsGained) || 0),
  ).toLocaleString("ko-KR")}`;
  if (typeof session.spotId !== "string" || !session.spotId) {
    return line("ok", `자동 ${name}: ${gained}.`);
  }
  const restart = await call(request, `/api/v2/${activity}/auto`, {
    action: "start",
    spotId: session.spotId,
    planId: session.planId === "extended" ? "extended" : "standard",
  });
  if (restart.ok) {
    return line(
      "ok",
      `자동 ${name}: ${gained}. ${String(session.sourceName ?? "같은 곳")}에서 다시 시작했습니다.`,
    );
  }
  return line(
    "info",
    restart.json.error === "human_verification_required"
      ? `자동 ${name}: ${gained}. 다시 시작하려면 ${name} 화면에서 사람 확인을 해 주세요.`
      : `자동 ${name}: ${gained}. 다시 시작하지 못했습니다.`,
  );
}

async function collectFarm(request: Request): Promise<LifeCollectLine> {
  const line = (tone: LifeCollectLine["tone"], text: string): LifeCollectLine => ({
    area: "farm",
    tone,
    text,
  });
  const farm = await call(request, "/api/v2/farm");
  if (!farm.ok) return line("error", "밭: 농장 정보를 불러오지 못했습니다.");
  const now = Number(farm.json.now);
  const plots = ((farm.json.farm as Json | undefined)?.plots ?? []) as Array<Json>;
  const ready = plots.flatMap((plot) =>
    typeof plot.id === "string" &&
    typeof plot.cropId === "string" &&
    typeof plot.readyAt === "number" &&
    plot.readyAt <= now
      ? [{ plotId: plot.id, cropId: plot.cropId }]
      : [],
  );
  if (ready.length === 0) return line("info", "밭: 수확할 칸이 없습니다.");
  const outcome = await runFarmHarvestAndReplant({ plots: ready, onSuccess: () => {}, request });
  if (outcome.harvested === 0) return line("error", "밭: 수확하지 못했습니다.");
  return line("ok", `밭: ${farmReplantOutcomeText(outcome)}`);
}

async function collectRanch(request: Request): Promise<LifeCollectLine> {
  const collected = (await call(request, "/api/v2/farm/ranch/collect", {})).ok;
  const fed = (await call(request, "/api/v2/farm/ranch/feed", { slotId: "all", amount: 0 })).ok;
  const text = collected
    ? fed
      ? "목장: 산물을 수거하고 사료를 채웠습니다."
      : "목장: 산물을 수거했습니다."
    : fed
      ? "목장: 사료를 채웠습니다."
      : "목장: 수거하거나 채울 것이 없습니다.";
  return { area: "ranch", tone: collected || fed ? "ok" : "info", text };
}

export async function runLifeCollectAll(request: Request = fetch): Promise<LifeCollectLine[]> {
  // 서버의 생활 요청 제한을 한꺼번에 쓰지 않도록 차례로 보낸다.
  const gathering = await collectGathering(request);
  const farm = await collectFarm(request);
  const ranch = await collectRanch(request);
  return [gathering, farm, ranch];
}
