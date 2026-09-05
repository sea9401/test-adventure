import { V2_CLASS_DEFS, V2_TIER_STAT_BONUS_PCT } from "@/adventure/data/v2/classes";
import { effectiveStatCap } from "@/adventure/data/v2/proficiency";
import { V2_STAT_KEYS, emptyV2StatMap, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { V2_BASE_STATS } from "@/adventure/data/v2/v2Stats";
import { stackedVitalityIncreasePct } from "./combatStatScaling";
import type { DerivePlayerCombatV2PureInput } from "./derivePlayerCombatV2Pure";

export function derivePrimaryStats(input: DerivePlayerCombatV2PureInput) {
  const liberation = input.liberationEffects;
  // baseAllocatedStats = V2_BASE_STATS + 성장분, stat 별 cap 으로 클램프(수행으로 cap 상향).
  // PR-prof — 랜덤 레벨 성장은 cap 까지만(docs §2). statCaps 미지정이면 무클램프(sim 호환).
  const baseAllocatedStats: Record<V2StatKey, number> = V2_STAT_KEYS.reduce(
    (acc, k) => {
      // 스탯 = floor(저점) + 성장분. 한계치는 저점과 독립적인 기본 60+수행 이득으로
      // 클램프한다. floor 미지정=base.
      // statCaps(수행 이득 맵) 미지정이면 무클램프(sim/테스트 호환).
      const floor = input.statFloors?.[k] ?? (V2_BASE_STATS[k] ?? 0);
      const raw = floor + (input.allocatedStats?.[k] ?? 0);
      acc[k] = input.statCaps
        ? Math.min(raw, effectiveStatCap(input.statCaps[k] ?? 0))
        : raw;
      return acc;
    },
    emptyV2StatMap(),
  );
  // PR-4a — totalStats = baseAllocated 그대로. 장비는 더 이상 6스탯 token 을 안 준다
  // (위력/무게/옵션만). 1차 스탯 정체성은 훈련 분배 + 직업 보정에서만 나온다.
  const totalStats: Record<V2StatKey, number> = { ...baseAllocatedStats };

  // PR-1 직업 보정 — 직업 앵커 스탯에 차수별 보정 %. (전사 1차 = STR +10%, 4차 = +35%)
  // 차수(classTier)는 proficiency.groups[job].tier 에서. none 은 보정 없음.
  const playerClass = input.playerClass ?? "none";
  const classDef = V2_CLASS_DEFS[playerClass];
  const bonusPct =
    playerClass === "none"
      ? 0
      : (V2_TIER_STAT_BONUS_PCT[Math.max(1, Math.floor(input.classTier ?? 1))] ??
        0);
  if (bonusPct > 0) {
    const k = classDef.anchorStat;
    totalStats[k] = Math.floor(totalStats[k] * (1 + bonusPct / 100));
  }

  // 직업 시스템 v2 — 직업 보너스(플랫 스탯) 가산. 앵커 % 보정 뒤에 더해 "순수 플랫"으로 유지
  //   (앵커 스탯 보너스가 % 배수를 받지 않음). cap 무관(보너스라 cap 위로). flag off/sim 이면
  //   jobBonus 미지정 → 무가산(byte-identical). 가산 후 아래 모든 파생 스탯에 자연 반영.
  if (input.jobBonus) {
    for (const k of V2_STAT_KEYS) {
      const b = input.jobBonus[k];
      if (b) totalStats[k] += b;
    }
  }

  // 직업 시스템 v2 — 상위 직업 % 스탯 패시브(근력 II 등). 플랫 가산 뒤에 곱해 "최종 스탯 ×
  //   (1 + %/100)". 여러 패시브 %는 호출부에서 이미 합산됨. floor 로 정수 유지. flag off/sim
  //   이면 statPct 미지정 → 무적용(byte-identical).
  if (input.statPct) {
    for (const k of V2_STAT_KEYS) {
      const pct = input.statPct[k];
      if (pct) {
        const effectivePct =
          k === "vit" ? stackedVitalityIncreasePct(pct) : pct;
        totalStats[k] = Math.floor(totalStats[k] * (1 + effectivePct / 100));
      }
    }
  }

  // 음식%와 해방%는 패시브% 계산이 끝난 뒤, 각각 기초 능력치만 기준으로 절삭해 고정 가산한다.
  // 두 효과가 직업·패시브 또는 서로를 다시 증폭하지 않도록 계산 축을 분리한다.
  for (const k of V2_STAT_KEYS) {
    const base = baseAllocatedStats[k];
    const foodBonus = Math.floor(base * ((input.foodPrimaryPct?.[k] ?? 0) / 100));
    const liberationBonus = Math.floor(
      base * ((liberation?.baseStatPct[k] ?? 0) / 100),
    );
    totalStats[k] += foodBonus + liberationBonus;
  }
  return { baseAllocatedStats, totalStats };
}
