import {
  partitionWithMagicBarrier,
  type MagicBarrierPartition,
} from "@/adventure/data/v2/v2CombatConstants";

export type MagicBarrierDamageParams = {
  rawDamage: number;
  durability: number;
  absorbPct?: number;
  efficiencyPct?: number;
  eligible: boolean;
  mitigateBody: (bodyRawDamage: number) => number;
};

export type MagicBarrierDamageResult = MagicBarrierPartition & {
  mitigatedBodyDamage: number;
  hpBoundDamage: number;
};

export type MagicBarrierLogEntry = {
  kind: "info";
  text: string;
};

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function resolveMagicBarrierDamage({
  rawDamage,
  durability,
  absorbPct = 0,
  efficiencyPct = 0,
  eligible,
  mitigateBody,
}: MagicBarrierDamageParams): MagicBarrierDamageResult {
  const incoming = safeInteger(rawDamage);
  const available = safeInteger(durability);
  const partition = eligible
    ? partitionWithMagicBarrier(
        incoming,
        available,
        absorbPct,
        efficiencyPct,
      )
    : {
        bodyRawDamage: incoming,
        absorbedDamage: 0,
        spillDamage: 0,
        durabilitySpent: 0,
        durabilityLeft: available,
        destroyed: false,
      };
  const mitigatedBodyDamage = safeInteger(
    mitigateBody(partition.bodyRawDamage),
  );

  return {
    ...partition,
    mitigatedBodyDamage,
    hpBoundDamage: mitigatedBodyDamage + partition.spillDamage,
  };
}

export function magicBarrierCombatLogEntries(
  result: MagicBarrierDamageResult,
): MagicBarrierLogEntry[] {
  if (result.absorbedDamage <= 0) return [];
  const entries: MagicBarrierLogEntry[] = [
    {
      kind: "info",
      text: `[마나 실드] 피해 ${result.absorbedDamage.toLocaleString("ko-KR")} 차단 · 내구도 ${result.durabilitySpent.toLocaleString("ko-KR")} 소모 (남은 ${result.durabilityLeft.toLocaleString("ko-KR")})`,
    },
  ];
  if (result.destroyed) {
    entries.push({
      kind: "info",
      text: "[마나 실드 파괴] 내구도가 모두 소진되었다.",
    });
  }
  return entries;
}
