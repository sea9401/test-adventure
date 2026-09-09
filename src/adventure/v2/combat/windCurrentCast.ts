import { previewWindCurrent, finishWindCurrent, WIND_CURRENT_MAX, type WindCurrentSkill } from "@/adventure/data/v2/windCurrent";
import { type PlayerCombat, type BattleStacks } from "./engineState";

type WindStacks = Pick<BattleStacks, "windCurrent" | "windCurrentReboundReady">;
type WindPassives = Pick<PlayerCombat, "windCurrentDamagePctPerStack" | "windCurrentMpRestorePctPerStack" | "windCurrentRebound" | "windCurrentShieldPctPerStack" | "windCurrentReleaseEvades">;

/** PvE/PvP 모두 시전 전 기류로 피해를 계산한다. 준비 보너스는 생성량만 바꾼다. */
export function previewPlayerWindCurrent(stacks: WindStacks, player: WindPassives, skill?: WindCurrentSkill) {
  const reboundEnabled = player.windCurrentRebound === true;
  const reboundReady = reboundEnabled && stacks.windCurrentReboundReady === true;
  return {
    ...previewWindCurrent(stacks.windCurrent, player.windCurrentDamagePctPerStack ?? 0, skill, reboundReady ? 1 : 0),
    skill,
    reboundEnabled,
    reboundReady,
    mpRestorePct: player.windCurrentMpRestorePctPerStack ?? 0,
    shieldPct: player.windCurrentShieldPctPerStack ?? 0,
    releaseEvades: player.windCurrentReleaseEvades ?? 0,
  };
}

/** 적중 확정 후에만 자원·재생성 준비·MP를 정산한다. 비용 부족이나 빗나감은 증가량0. */
export function settlePlayerWindCurrent(preview: ReturnType<typeof previewPlayerWindCurrent>, landed: boolean, maxMp: number) {
  const final = finishWindCurrent(preview, landed);
  const gained = Math.max(0, (final.current ?? 0) - (preview.current ?? 0));
  let reboundReady = preview.reboundReady;
  if (landed && preview.current !== undefined && preview.reboundEnabled) {
    if (preview.skill?.kind === "release" && preview.current === WIND_CURRENT_MAX) reboundReady = true;
    else if (preview.skill?.kind === "gather") reboundReady = false;
  }
  return {
    stacks: {
      ...(final.current !== undefined ? { windCurrent: final.current } : {}),
      ...(preview.reboundEnabled ? { windCurrentReboundReady: reboundReady } : {}),
    },
    hastePct: final.hastePct,
    shieldGain: Math.floor(Math.max(0, maxMp) * Math.max(0, preview.shieldPct) * gained / 100),
    guaranteedEvades: landed && preview.skill?.kind === "release" && preview.current === WIND_CURRENT_MAX
      ? Math.max(0, Math.floor(preview.releaseEvades)) : 0,
    mpRestore: Math.floor(Math.max(0, maxMp) * Math.max(0, preview.mpRestorePct) * gained / 100),
  };
}
