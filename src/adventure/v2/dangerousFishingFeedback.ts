import type { DangerousFishBehavior } from "@/adventure/data/v2/dangerousFishing";
import type {
  DangerousEncounterView,
  DangerousFishingAction,
} from "./dangerousFishingEncounter";

export type DangerousFishingFeedback = {
  scope: "voyage" | "boss";
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  detail: string;
  terminal: boolean;
};

const ACTION_LABEL: Record<DangerousFishingAction, string> = {
  reel: "감아올리기",
  give: "줄 풀기",
  brace: "버티기",
};

export function recommendedDangerousFishingAction(
  behavior: DangerousFishBehavior,
): DangerousFishingAction {
  if (behavior === "charge") return "give";
  if (behavior === "turn") return "reel";
  return "brace";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function encounterDelta(
  before: DangerousEncounterView,
  after: Record<string, unknown>,
): string | null {
  const tension = finiteNumber(after.tension);
  const stamina = finiteNumber(after.stamina);
  const distance = finiteNumber(after.distance);
  if (tension == null || stamina == null || distance == null) return null;
  return [
    `장력 ${signed(tension - before.tension)}`,
    `어체력 ${signed(stamina - before.stamina)}`,
    `거리 ${signed(distance - before.distance)}`,
  ].join(" · ");
}

function failureFeedback(
  scope: "voyage" | "boss",
  event: string,
  targetName: string,
): DangerousFishingFeedback | null {
  const reason =
    event === "line_broken"
      ? "줄이 끊어져"
      : event === "hook_lost"
        ? "바늘이 빠져"
        : event === "timeout"
          ? "제한 시간이 지나"
          : null;
  if (!reason) return null;
  return {
    scope,
    tone: "danger",
    title: `${reason} ${targetName}를 놓쳤습니다.`,
    detail:
      scope === "boss"
        ? "이번 개인 시도는 종료됐지만 기존 누적 기여는 유지됩니다."
        : "이번 미끼는 소모됐지만 귀환 전 화물은 유지됩니다.",
    terminal: true,
  };
}

export function dangerousFishingActionFeedback(args: {
  scope: "voyage" | "boss";
  action: DangerousFishingAction;
  before: DangerousEncounterView;
  response: Record<string, unknown>;
  targetName: string;
}): DangerousFishingFeedback | null {
  const event =
    typeof args.response.event === "string" ? args.response.event : null;
  if (!event) return null;

  const failed = failureFeedback(args.scope, event, args.targetName);
  if (failed) return failed;

  if (event === "caught" && args.scope === "boss") {
    const contribution = finiteNumber(args.response.contribution);
    const totalContribution = finiteNumber(args.response.totalContribution);
    if (contribution == null || totalContribution == null) return null;
    const defeated = args.response.defeated === true;
    return {
      scope: "boss",
      tone: "success",
      title: `개인 시도 성공 · 기여 +${contribution.toLocaleString()}`,
      detail: defeated
        ? `누적 기여 ${totalContribution.toLocaleString()} · 마지막 인양에 성공했습니다. 보상을 확인하세요.`
        : `누적 기여 ${totalContribution.toLocaleString()} · 거대어 제압 후 보상을 받을 수 있습니다.`,
      terminal: true,
    };
  }

  if (event === "caught") {
    const fish = record(args.response.fish);
    const name = typeof fish?.name === "string" ? fish.name : args.targetName;
    const sizeCm = finiteNumber(fish?.sizeCm);
    const xp = finiteNumber(args.response.fishingXpGained);
    const coins = finiteNumber(args.response.fishingCoinsGained);
    if (sizeCm == null || xp == null || coins == null) return null;
    return {
      scope: "voyage",
      tone: "success",
      title: `${name} ${sizeCm.toLocaleString()}cm 어획 성공`,
      detail: `낚시 경험치 +${xp.toLocaleString()} · 낚시 코인 +${coins.toLocaleString()} · 귀환 전 화물 +1`,
      terminal: true,
    };
  }

  if (event !== "progress") return null;
  const after = record(args.response.encounter);
  if (!after) return null;
  const detail = encounterDelta(args.before, after);
  if (!detail) return null;
  const correct =
    recommendedDangerousFishingAction(args.before.behavior) === args.action;
  return {
    scope: args.scope,
    tone: correct ? "success" : "info",
    title: `${correct ? "정확한 대응" : "일반 조작"} · ${ACTION_LABEL[args.action]}`,
    detail,
    terminal: false,
  };
}

export function dangerousFishingReturnFeedback(
  response: Record<string, unknown>,
): DangerousFishingFeedback | null {
  if (response.returned !== true) return null;
  const materials = record(response.materials) ?? {};
  const confirmedCount = Object.values(materials).reduce<number>((sum, value) => {
    const quantity = finiteNumber(value);
    return sum + (quantity == null ? 0 : Math.max(0, Math.floor(quantity)));
  }, 0);
  if (response.incident === true) {
    const lostValue = finiteNumber(response.lostValue) ?? 0;
    return {
      scope: "voyage",
      tone: "warning",
      title: "해상 사고로 강제 귀환",
      detail: `손실 가치 ${lostValue.toLocaleString()} · 남은 어획물 ${confirmedCount.toLocaleString()}개를 확정했습니다.`,
      terminal: true,
    };
  }
  return {
    scope: "voyage",
    tone: "success",
    title: "안전 귀환 완료",
    detail: `어획물 ${confirmedCount.toLocaleString()}개를 확정했습니다. 낚시 상점의 위험 해역 교환이나 거래소에서 사용할 수 있습니다.`,
    terminal: true,
  };
}

export function dangerousFishingBossClaimFeedback(
  response: Record<string, unknown>,
  bossName: string,
): DangerousFishingFeedback | null {
  const reward = record(response.reward);
  const coins = finiteNumber(reward?.fishingCoins);
  const materialCount = finiteNumber(reward?.materialCount);
  if (coins == null || materialCount == null) return null;
  return {
    scope: "boss",
    tone: "success",
    title: `${bossName} 보상 수령`,
    detail: `낚시 코인 +${coins.toLocaleString()} · 거대어 증표 +${materialCount.toLocaleString()} · 전용 장비·미끼·칭호·꾸미기 교환에 사용할 수 있습니다.`,
    terminal: true,
  };
}
