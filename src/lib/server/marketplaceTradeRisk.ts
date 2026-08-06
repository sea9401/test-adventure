export type MarketplaceTradeRiskLevel = "normal" | "watch" | "review";

export function marketplaceEquipmentTradeRisk(input: {
  sameIp: boolean;
  nearFloor: boolean;
  repeatedPairTrades: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  if (input.sameIp) {
    score += 60;
    reasons.push("same_ip");
  }
  if (input.nearFloor) {
    score += 25;
    reasons.push("near_floor");
  }
  if (input.repeatedPairTrades >= 5) {
    score += 20;
    reasons.push("repeated_pair");
  } else if (input.repeatedPairTrades >= 3) {
    score += 10;
    reasons.push("repeated_pair");
  }
  const cappedScore = Math.min(100, score);
  const level: MarketplaceTradeRiskLevel =
    cappedScore >= 50 ? "review" : cappedScore >= 20 ? "watch" : "normal";
  return { score: cappedScore, level, reasons };
}
