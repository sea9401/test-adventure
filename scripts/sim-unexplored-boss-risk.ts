// 미개척지 개인 보스 위험도별 체감을 실제 캐릭터 스냅샷으로 점검한다.
// 한 세션(소환 1회)을 공격 route와 같은 방식으로 이어서 싸운다: 공격마다 남은 체력과 보스 기믹 상태를 넘긴다.
// 읽기 전용. 스냅샷은 sim-live-top-combat의 loadTopPlayers가 읽는 행과 같은 모양의 JSON 배열이다.
// 운영 설정 파일이 없으면 전투 계산이 운영과 달라진다(--env-file=.env.production 필수).
// 실행: NODE_PATH=./scripts/server-only-stub node --env-file=.env.production --import tsx scripts/sim-unexplored-boss-risk.ts \
//         --snapshot=<파일> [--tiers=0,5,10,20] [--sessions=2] [--max-attacks=40]

import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_ATTACK_TURNS,
  COOP_BOSSES,
  coopBossForBattle,
  coopBossSessionMaxHp,
  coopImmortalBerserkerState,
  coopInvincibleFortressState,
  coopSkywardCrystalEyeState,
} from "../src/adventure/data/v2/coopBosses";
import { UNEXPLORED_BOSS_IDS, type UnexploredBossId } from "../src/adventure/data/v2/unexploredBosses";
import { COOP_BOSS_MAX_HP_DAMAGE_MULT } from "../src/adventure/data/v2/v2CombatConstants";
import { resolveBattle, setBattleLogCollection } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { initialImmortalBerserkerState } from "../src/adventure/v2/combat/immortalBerserkerMechanic";
import { initialInvincibleFortressState } from "../src/adventure/v2/combat/invincibleFortressMechanic";
import { initialSkywardCrystalEyeState } from "../src/adventure/v2/combat/skywardCrystalEyeMechanic";
import { loadTopPlayers, type SimPlayer } from "./sim-live-top-combat";
import { withSeededRandom } from "./sim-v2-coop-boss";

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const TIERS = (arg("tiers") ?? "0,5,10,20").split(",").map(Number);
const SESSIONS = Number(arg("sessions") ?? 2);
const MAX_ATTACKS = Number(arg("max-attacks") ?? 40);
const SEED = 20261116;

type SessionResult = { cleared: boolean; attacks: number; deaths: number };

function simulateSession(player: SimPlayer, bossId: UnexploredBossId, riskTier: number, seed: number): SessionResult {
  const kind = COOP_BOSSES[bossId];
  const maxHp = coopBossSessionMaxHp(kind, riskTier);
  const base = player.combat.player;
  let hp = maxHp;
  let threat = 0;
  let fortress = initialInvincibleFortressState(maxHp);
  let crystalEye = initialSkywardCrystalEyeState();
  let berserker = initialImmortalBerserkerState(maxHp);
  let attacks = 0;
  let deaths = 0;
  while (hp > 0 && attacks < MAX_ATTACKS) {
    const { monster } = coopBossForBattle(kind, hp, { sharedMaxHp: maxHp, riskTier });
    const bossMechanic =
      bossId === "tracking_weapon" ? { kind: "tracking_weapon" as const, initialThreat: threat }
      : bossId === "toxic_blood_lord" ? { kind: "toxic_blood_lord" as const }
      : bossId === "glacial_colossus" ? { kind: "glacial_colossus" as const }
      : bossId === "invincible_fortress" ? { kind: "invincible_fortress" as const, sharedMaxHp: maxHp, initialState: fortress }
      : bossId === "skyward_crystal_eye" ? { kind: "skyward_crystal_eye" as const, sharedMaxHp: maxHp, initialState: crystalEye }
      : { kind: "immortal_berserker" as const, sharedMaxHp: maxHp, initialState: berserker };
    const result = withSeededRandom(seed + attacks, () =>
      resolveBattle(
        // 공격 route와 같게: 최대 체력·마력으로 시작한다.
        { ...base, hp: player.combat.maxHp, mp: base.maxMp ?? 0 },
        { ...monster, hp: maxHp },
        "위험도 시뮬",
        {
          pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
          potions: {}, v2Skills: player.skills, isBoss: true, maxTurns: COOP_ATTACK_TURNS,
          maxHpDamageMult: COOP_BOSS_MAX_HP_DAMAGE_MULT,
          initialEnemyHp: hp, bossMechanic,
        },
      ));
    attacks += 1;
    if (result.finalState.playerHp <= 0) deaths += 1;
    const nextHp = Math.max(0, Math.min(maxHp, Math.floor(result.finalState.enemyHp)));
    const mechanic = result.finalState.bossMechanic;
    if (mechanic?.kind === "tracking_weapon") threat = mechanic.trackingThreat;
    if (mechanic?.kind === "invincible_fortress") fortress = coopInvincibleFortressState(kind, { fortress: mechanic }, nextHp, maxHp);
    if (mechanic?.kind === "skyward_crystal_eye") crystalEye = coopSkywardCrystalEyeState(kind, { crystalEye: mechanic });
    if (mechanic?.kind === "immortal_berserker") berserker = coopImmortalBerserkerState(kind, { immortalBerserker: mechanic }, nextHp, maxHp);
    hp = nextHp;
  }
  return { cleared: hp <= 0, attacks, deaths };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

async function main(): Promise<void> {
  const snapshot = arg("snapshot");
  if (!snapshot) throw new Error("--snapshot=<파일>이 필요합니다.");
  const rows = JSON.parse(readFileSync(snapshot, "utf8")) as unknown[];
  const players = await loadTopPlayers({ query: async () => ({ rows }) } as unknown as Pool, Number.POSITIVE_INFINITY);
  console.log(`캐릭터 ${players.length}명 · 위험도 ${TIERS.join(",")} · 세션 ${SESSIONS}회/인/보스/위험도 · 세션당 공격 상한 ${MAX_ATTACKS}회(스태미나 ${MAX_ATTACKS * COOP_ATTACK_STAMINA_COST})`);
  setBattleLogCollection(true);
  const startedAt = Date.now();
  for (const bossId of UNEXPLORED_BOSS_IDS) {
    console.log(`\n${COOP_BOSSES[bossId].name}`);
    console.log("위험도  처치하는 인원(절반 이상)  처치 공격 수 중앙/상위90%  공격당 조기 사망률  한 번에 처치하는 인원");
    for (const tier of TIERS) {
      let clearers = 0;
      let oneShot = 0;
      const attackCounts: number[] = [];
      let attacksTotal = 0;
      let deathsTotal = 0;
      players.forEach((player, playerIndex) => {
        const sessions = Array.from({ length: SESSIONS }, (_, index) =>
          simulateSession(player, bossId, tier, SEED + playerIndex * 1_000 + index * 100));
        const cleared = sessions.filter((session) => session.cleared);
        if (cleared.length * 2 >= sessions.length) {
          clearers += 1;
          attackCounts.push(median(cleared.map((session) => session.attacks)));
          if (cleared.every((session) => session.attacks === 1)) oneShot += 1;
        }
        for (const session of sessions) { attacksTotal += session.attacks; deathsTotal += session.deaths; }
      });
      const sorted = [...attackCounts].sort((a, b) => a - b);
      const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0;
      console.log(`${String(tier).padStart(4)}    ${String(clearers).padStart(2)}/${players.length}명                ${median(attackCounts)}회 / ${p90}회              ${Math.round((deathsTotal / Math.max(1, attacksTotal)) * 100)}%              ${oneShot}명`);
    }
  }
  console.log(`\n소요 ${Math.round((Date.now() - startedAt) / 1000)}초`);
}

main().catch((error) => { console.error(error); process.exit(1); });
