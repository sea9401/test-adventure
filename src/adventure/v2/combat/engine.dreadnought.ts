import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { dreadnoughtImpactSpend, type DreadnoughtState } from "./dreadnought";
import { applySkillHealing } from "./engine.skillHealing";
import { healingAfterBurn } from "./burnHealing";
import { healingAfterReceivedMultiplier, type V2SkillCastResult } from "./combatShared";
import { type V2Dot } from "./combatDots";
import { appendLog } from "./engineSupport";
import { type BattleLogEntry, type PlayerCombat } from "./engineState";

/** Both engines call this after hit resolution; one source for inherited healing and preparation. */
export function applyDreadnoughtImpactSpend(input: {
  state?: DreadnoughtState;
  result: V2SkillCastResult;
  landed: boolean;
  hp: number;
  maxHp: number;
  player: PlayerCombat;
  playerName: string;
  dots: readonly V2Dot[];
  log: BattleLogEntry[];
  side?: "p1" | "p2";
  healReducePct?: number;
  scaleHeal?: (amount: number) => number;
}) {
  const spent = dreadnoughtImpactSpend({
    state: input.state, consumed: input.result.fortressImpactToConsume,
    landed: input.landed, maxHp: input.maxHp,
    healPctPerStack: input.player.fortressImpactHealPctPerStack,
    counterBoostPct: input.result.castSkillId ? V2_SKILLS[input.result.castSkillId]?.fortressFullImpactCounterBoostPct : undefined,
  });
  let log = input.log;
  if (spent.state !== input.state) {
    log = appendLog(log, {
      kind: "info", text: `[시즈 브레이커] 다음 자동 반격 피해 +${spent.state?.counterBoostPct}% 준비`,
      ...(input.side ? { side: input.side } : { turn: "player" as const }),
    });
  }
  const reduced = healingAfterBurn(spent.heal, input.dots, input.healReducePct ?? 0);
  const scaled = input.scaleHeal ? input.scaleHeal(reduced) : reduced;
  const healed = applySkillHealing({
    hp: input.hp, maxHp: input.maxHp, player: input.player, playerName: input.playerName,
    skillName: "[끝없는 진군]", triggeredHeal: true, side: input.side,
    skillHeal: input.hp > 0 ? healingAfterReceivedMultiplier(scaled, input.player.receivedHealMult) : 0,
    passiveHeal: 0, log,
  });
  return { ...healed, state: spent.state };
}
