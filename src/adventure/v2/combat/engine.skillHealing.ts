import { recordCombatMetric } from "./combatDiagnostics";
import type { BattleLogEntry, PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import { healingAfterReceivedMultiplier, type V2SkillCastResult } from "./combatShared";
import { healToShield } from "./signatureEffects";

/** 스킬 자체 회복과 패시브 흡혈의 상한·로그·회복 보호막 처리를 PvE/PvP에서 공유한다. */
export function applySkillHealing({
  hp, maxHp, player, playerName, skillName, skillId, skillHeal, passiveHeal, log, side,
}: {
  hp: number;
  maxHp: number;
  player: PlayerCombat;
  playerName: string;
  skillName: string | null;
  skillId?: string | null;
  skillHeal: number;
  passiveHeal: number;
  log: BattleLogEntry[];
  side?: "p1" | "p2";
}): { hp: number; shield: number; log: BattleLogEntry[] } {
  let shield = 0;
  for (const kind of ["skill", "passive"] as const) {
    const amount = kind === "skill" ? skillHeal : passiveHeal;
    if (amount <= 0 || (kind === "skill" ? !skillName : hp <= 0)) continue;
    const actual = Math.min(maxHp - hp, amount);
    if (actual <= 0) continue;
    hp += actual;
    recordCombatMetric("healing", kind === "skill" ? (skillId ?? "skill") : "passive_lifesteal", side ?? "player", actual);
    const overflow = amount > actual ? ` (산출 ${amount})` : "";
    log = appendLog(log, {
      kind: kind === "skill" ? "player_attack" : "info",
      text: kind === "skill"
        ? `${skillName}! ${side ? `${playerName} ` : ""}HP ${actual} 회복했다.${overflow}`
        : `[패시브 흡혈] ${playerName}의 HP +${actual}`,
      ...(side ? { side } : kind === "passive" ? { turn: "player" as const } : {}),
    });
    const sigShield = healToShield(player.equipSignatures, {
      actualHeal: actual, calculatedHeal: amount, maxHp,
    });
    if (sigShield) {
      shield += sigShield.amount;
      log = appendLog(log, {
        kind: "info",
        text: `[${sigShield.label}] ${side ? `${playerName} ` : ""}보호막 +${sigShield.amount}`,
        ...(side ? { side } : { turn: "player" as const }),
      });
    }
  }
  return { hp, shield, log };
}

/** 피해 기반 자체 회복에는 일반 회복량 증가를 다시 곱하지 않는다. */
export function skillSelfHealingAmount(
  result: Pick<V2SkillCastResult, "selfHeal" | "healFromActualDamagePct">,
  actualDamage: number,
  unityMultiplier: number,
  receivedHealMultiplier?: number,
): number {
  const base = result.selfHeal + Math.floor(
    (actualDamage * Math.max(0, result.healFromActualDamagePct)) / 100,
  );
  return healingAfterReceivedMultiplier(
    Math.floor(base * unityMultiplier), receivedHealMultiplier,
  );
}
