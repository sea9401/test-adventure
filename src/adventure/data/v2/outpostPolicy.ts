// 거점 입장 정책 평가 — hunt 요청 시 사냥자가 거점에 들어갈 수 있는지,
// 들어갈 수 있다면 세금을 부과해야 하는지 결정하는 순수함수.
//
// 라우트 코드(`api/v2/dungeon/hunt`)가 lock 직후 호출. DB/IO 없음.

import type { OutpostPolicy } from "./types";

export type PolicyContext = {
  // 거점에 저장된 raw policy 문자열. 옛 값("alliance")이나 알 수 없는 값도 안전하게 처리.
  policy: string;
  // 점령 길드. null = 미점령(NPC).
  occupiedByGuildId: number | null;
  // 사냥자(요청자) 길드. null = 미소속 (1인 길드 자동 생성 룰상 정상 user 는 null 아님,
  // 방어적으로만 처리).
  viewerGuildId: number | null;
};

export type PolicyDecision =
  | { allowed: true; charge: "tax" }   // 세금 부과 대상 (다른 길드의 open 거점)
  | { allowed: true; charge: "none" }  // 세금 면제 (미점령 / 자기 길드)
  | { allowed: false; reason: "guild_only" };

// raw policy 를 알려진 OutpostPolicy 로 정규화. 알 수 없으면 "open" (가장 관대).
// 옛 "alliance" 도 여기서 open 으로 대우 — 동맹 시스템 구현 시 별도 분기 추가.
export function normalizePolicy(raw: string): OutpostPolicy {
  if (raw === "guild-only") return "guild-only";
  return "open";
}

export function evaluateOutpostEntry(ctx: PolicyContext): PolicyDecision {
  // 미점령(NPC) 거점은 정책 무관 모두 허용 + 세금 없음.
  if (ctx.occupiedByGuildId == null) {
    return { allowed: true, charge: "none" };
  }

  const isOwnGuild =
    ctx.viewerGuildId != null && ctx.viewerGuildId === ctx.occupiedByGuildId;

  // 자기 길드 거점이면 정책 무관 허용 + 세금 면제.
  if (isOwnGuild) {
    return { allowed: true, charge: "none" };
  }

  const policy = normalizePolicy(ctx.policy);
  if (policy === "guild-only") {
    return { allowed: false, reason: "guild_only" };
  }

  // open — 다른 길드 거점이라 세금 부과 대상.
  return { allowed: true, charge: "tax" };
}
