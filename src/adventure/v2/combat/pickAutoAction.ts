import {
  POTIONS,
  POTION_IDS,
  computeHealAmount,
  type PotionId,
} from "@/adventure/data/potions";
import type { AutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";
import type { BattleState, PlayerAction } from "./engine";

// 자동 전투 — 카테고리 단위 규칙 평가. 회복량 작은 물약부터 소진해 큰 것을 아낌.
// 인벤토리 차감은 호출 측(BattleView)에서.
export function pickAutoAction(
  state: BattleState,
  ctx: {
    rules: AutoPotionConfig["rules"];
    potions: Partial<Record<PotionId, number>>;
  },
): PlayerAction {
  for (const rule of ctx.rules) {
    if (!rule.enabled) continue;
    if (state.playerHp >= state.playerMaxHp) continue;

    let triggered = false;
    if (rule.trigger.kind === "hp_below_pct") {
      const hpPct = (state.playerHp / state.playerMaxHp) * 100;
      if (hpPct < rule.trigger.pct) triggered = true;
    }
    if (!triggered) continue;

    const candidates = POTION_IDS.filter((id) => {
      const p = POTIONS[id];
      if (rule.target === "hp_heal" && p.effect.kind !== "heal_hp") return false;
      return (ctx.potions[id] ?? 0) > 0;
    }).sort(
      (a, b) =>
        computeHealAmount(POTIONS[a], state.playerMaxHp) -
        computeHealAmount(POTIONS[b], state.playerMaxHp),
    );

    for (const id of candidates) {
      return { kind: "use_potion", potionId: id, potion: POTIONS[id] };
    }
  }
  return { kind: "attack" };
}
