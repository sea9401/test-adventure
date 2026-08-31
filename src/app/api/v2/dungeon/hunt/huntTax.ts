import { V2_CORE_LOOP_V2, lossTaxOf } from "@/adventure/data/v2/coreLoopConfig";

// 코어루프 패배 페널티 — 마지막 패배 이후 번 골드(atRiskGold)를 승리마다 누적, 일반 패배 시 그
//   절반(보유 한도 클램프)을 소실하고 0 리셋. 시간초과는 무승부성 패배라 소실·리셋하지 않는다.
//   원금이 아닌 최근 승리분만 대상 → 전멸 없음.
//   off = lossTax 0·atRiskGold 미기록(byte-identical). 소실 골드는 어디에도 입금하지 않는다.
export function computeLossTax(params: {
  won: boolean;
  timedOut?: boolean;
  goldNet: number;
  atRiskGoldRaw: unknown;
  goldRaw: number | undefined;
}): { lossTax: number; nextAtRisk: number } {
  const { won, timedOut = false, goldNet, atRiskGoldRaw, goldRaw } = params;
  const prevAtRisk = V2_CORE_LOOP_V2
    ? Math.max(0, Number(atRiskGoldRaw) || 0)
    : 0;
  let lossTax = 0;
  let nextAtRisk = prevAtRisk;
  if (V2_CORE_LOOP_V2) {
    if (won) {
      nextAtRisk = prevAtRisk + Math.max(0, goldNet);
    } else if (!timedOut) {
      lossTax = lossTaxOf(prevAtRisk, Math.max(0, goldRaw ?? 0)).tax;
      nextAtRisk = 0;
    }
  }
  return { lossTax, nextAtRisk };
}
