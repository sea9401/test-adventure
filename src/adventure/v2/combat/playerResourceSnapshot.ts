import { mergePainSnapshot } from "./darkPriest";
import { mergeTier7ResourceSnapshot, type BattleState } from "./engineState";
import { activeTier6ResourceSnapshot } from "./tier6UniqueEffects";
import { mergeTripleWardResourceSnapshot } from "./tripleWard";
import { mergeLawInscriptionSnapshot } from "./lawInscription";
import { mergeWindCurrentSnapshot } from "@/adventure/data/v2/windCurrent";
import { mergeHolyPowerSnapshot } from "./holyPower";

/** ATB/레거시와 PvE/PvP가 같은 자원 표시를 사용한다. */
export function playerResourceSnapshot(stacks: Pick<BattleState["stacks"], "tier6Uniques" | "tier7" | "tripleWard" | "lawInscriptions" | "holyPower" | "windCurrent" | "windCurrentReboundReady" | "pain">) {
  const base = mergeHolyPowerSnapshot(
    mergeLawInscriptionSnapshot(
      mergeTripleWardResourceSnapshot(
        mergeTier7ResourceSnapshot(activeTier6ResourceSnapshot(stacks.tier6Uniques), stacks.tier7),
        stacks.tripleWard,
      ),
      stacks.lawInscriptions,
    ),
    stacks.holyPower,
  );
  return mergePainSnapshot(mergeWindCurrentSnapshot(base, stacks.windCurrent, stacks.windCurrentReboundReady), stacks.pain);
}
