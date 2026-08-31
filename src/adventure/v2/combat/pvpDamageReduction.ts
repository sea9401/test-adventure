import type { PvPSide } from "./engine-pvp";
import { ironWallDamageReductionPct } from "./fortressKnight";
import { lowHpDamageReductionPct } from "./signatureEffects";

export function pvpSideDamageTakenReductionPct(side: PvPSide): number {
  const activePct =
    side.stacks.skillDmgReduceTurns > 0
      ? side.stacks.skillDmgReducePct
      : 0;
  const signaturePct = lowHpDamageReductionPct(
    side.player.equipSignatures,
    side.hp,
    side.maxHp,
  );
  return Math.max(
    0,
    (side.player.passiveDamageTakenReductionPct ?? 0) +
      activePct +
      ironWallDamageReductionPct(side.stacks.ironWallReflectCharges) +
      signaturePct,
  );
}
