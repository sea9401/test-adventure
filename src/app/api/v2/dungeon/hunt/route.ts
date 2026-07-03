import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guilds, outpostOccupations, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { battleCountOf } from "@/lib/server/battleCount";
import { v2LevelGrowthHpMp } from "@/lib/server/derivePlayerCombatV2";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { readGuildCombatSupplyLevels } from "@/lib/server/guildCombatSupply";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { applyExpGain, requiredExpToNext } from "@/lib/leveling";

// BattleScene replay UI 의 EXP 바 max — 이미 만렙이면 분모로 쓸 값 없음.
// EXP 바 안 보이게 0 으로 fallback (현재 exp 와 동일 → pct 0).
function requiredExpToNextNullable(level: number): number | null {
  return requiredExpToNext(level);
}
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { enemiesForDepth, MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  elementDamageMult,
  elementMatchup,
  V2_ELEMENT_ADV_PCT,
  V2_ELEMENT_DIS_PCT,
  type ElementMatchup,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  applyGuildCombatRewardBonus,
  guildCombatSupplyBonuses,
} from "@/adventure/data/v2/guildCombatSupply";
import { OUTPOSTS, OUTPOST_NPC_TAX_RATE } from "@/adventure/data/v2/outposts";
import {
  V2_SETTLEMENT_WARFARE,
  V2_TILE_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import {
  RARE_MAP_KINDS,
  parseRareMaps,
  type RareMapInstance,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import {
  HUNT_COST,
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MODE,
  HUNT_COOLDOWN_MS,
  combatCooldownRemainingMs,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import { mergeDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
import {
  TREASURE_FRAGMENTS_KEY,
  HUNT_FRAGMENT_DROP_CHANCE,
  addFragments,
  parseTreasureFragments,
  rollFragmentDrop,
} from "@/adventure/v2/treasureFragments";
import {
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  toReplayPayload,
  toReplayPayloadLite,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonEnemy, DungeonFloorId } from "@/adventure/data/v2/types";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  insertFeedEntry,
  resolveUserDisplayName,
} from "@/lib/server/serverFeed";
import {
  checkUserRateLimit,
  userRateLimitResponse,
} from "@/lib/server/userRateLimit";
import { rollHuntDrops } from "./huntDrops";
import { computeGoldTax, computeLossTax } from "./huntTax";
import { creditOutpostTreasury } from "./huntTreasury";
import { computeBattleRewards, applyChargeRestore } from "./huntRewards";
import { updateRareMaps } from "./huntRareMaps";
import { recordMonsterKill } from "./huntKillLog";
import { applyHuntProficiency } from "./huntProficiency";

// POST /api/v2/dungeon/hunt — 던전 한 번 사냥 intent.
//
// 본문: { floor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
// 서버 권위:
//   1. character.v2 잠금 + stamina 회복 + HUNT_COST 차감.
//   2. derive PlayerCombat (장비/스킬/룬/부여/파라곤 반영).
//   3. floor 의 enemies 에서 균등 random pick.
//   4. resolveBattle 단판 sim.
//   5. 승리 시 monster.exp 만큼 exp gain — applyExpGain 으로 level up 처리.
//   6. 패배 시 보상 0. hp 처리는 다음 PR (지금은 character.hp 변경 안 함).
//   7. character.v2 save.
//
// 단순화 (다음 PR 에서 발전):
//   - 사망/부활 처리 없음 (사후 시간 회복으로 만피까지)
//   - playerName placeholder "모험가"
//   - drop 은 placeholder 풀 (`dungeonDrops.ts`) — 정식 재료 시스템 통째 교체 예정

// 단일 무한 프론티어 — 깊이(depth) 1→∞. 조기 검증은 정수·≥1 만, 실제 게이트(최고도달+1)는
// character.v2 lock 후. 드랍 풀은 깊이를 DungeonFloorId(1~8)로 클램프해 조회(8 이상=8 풀).
const DROP_FLOOR_CAP = 8 as DungeonFloorId;

// 일괄(batch) 사냥 — 한 요청에서 서버가 N회 사냥을 한 트랜잭션으로 돌린다(클라 50회 왕복 폐기).
// 클라 전투설정의 최대 횟수와 일치. 본문 count(없으면 1=단판).
const MAX_HUNT_BATCH = 50;

function pickRandomEnemy(
  enemies: readonly DungeonEnemy[],
): DungeonEnemy | null {
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

type CharSave = {
  stamina?: unknown;
  hp?: number;
  hpRegenSince?: number;
  level?: number;
  exp?: number;
  gold?: number;
  materials?: unknown;
  lastHuntedOutpost?: unknown;
  ejectedFrom?: unknown;
  rareMaps?: unknown;
  lastBattleAt?: number; // 코어루프 사냥 쿨다운 — 마지막 사냥/오프라인 정산 시각.
  atRiskGold?: number; // 코어루프 패배 페널티 — 마지막 패배 이후 번 골드(패배 시 절반 소실 대상).
  lastHuntDepth?: number; // 코어루프 오프라인 정산 farm 깊이(마지막 정상 사냥 깊이).
  frontierDepth?: number; // 프론티어 최고 도달 깊이(오프라인 깊이 검증·게이트에 사용).
  [k: string]: unknown;
};

type HuntTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type RunOneHuntCtx = {
  tx: HuntTx;
  userId: string;
  depth: number;
  dropFloor: DungeonFloorId;
  outpostId: string | null;
  // 레어맵 입장 — 보유 지도 iid. 검증(소유·깊이 일치·잔여 판수)은 save lock 후.
  rareMapIid: string | null;
  // 오프라인 정산 모드 — 전투 쿨다운 게이트·per-battle lastBattleAt 기록을 건너뛴다(정산
  //   루프가 마지막에 한 번 lastBattleAt=realNow 기록). 패배 페널티/HP/포션/레벨업은 그대로 적용.
  offline?: boolean;
  // 시각 주입(오프라인) — 판별 HP 회복 시각을 lastBattleAt+i×쿨다운 으로 시뮬(5초 간격 회복).
  //   미지정 = Date.now()(온라인).
  nowOverride?: number;
};

// 한 번의 사냥 — 기존 단판 로직 그대로(트랜잭션 클로저 tx 사용). 일괄 모드는 이 함수를
//   루프로 N회 호출한다. 매 호출이 character.v2/equipment 등을 재-락·재-read 하므로 직전
//   사냥의 레벨/HP/스태미나/드랍이 DB 재read 로 자동 이월된다(수동 스레딩 불필요).
//   fullReplay=true 면 BattleScene 용 log 를 보존한다. 온라인 단판/5·10·50회 사냥은 기록 확인이
//   필요하므로 full, 오프라인 정산은 결과 집계만 쓰므로 lite 로 둔다.
export async function runOneHunt(fullReplay: boolean, ctx: RunOneHuntCtx) {
  const { tx, userId, depth, dropFloor, outpostId, rareMapIid } = ctx;
  // === 1. outpost 점령 조회 (FOR UPDATE) ===
  // v2 의 lock 순서 통일: outpost FOR UPDATE → getGuildId → character.v2.
  // FOR UPDATE 로 정책 게이트 평가와 세금 결정이 같은 스냅샷을 사용 — 점령자가
  // hunt 도중 정책을 바꿔도 이 hunt 는 진입 시점 정책으로 일관.
  let occRow: {
    occupiedByUserId: string | null;
    occupiedByGuildId: number | null;
    policy: string;
    taxRate: string;
  } | null = null;
  if (outpostId) {
    occRow =
      (
        await tx
          .select()
          .from(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, outpostId))
          .for("update")
          .limit(1)
      )[0] ?? null;
  }

  // === 2. 사냥자 길드 확인 (정책 게이트 + 세금 면제 판정용) ===
  // 무소속이면 null — same-guild 세금면제 분기에서 false 로 통과.
  const viewerGuildId = await getGuildId(tx, userId);
  const guildCombatSupply = guildCombatSupplyBonuses(
    await readGuildCombatSupplyLevels(tx, viewerGuildId),
  );

  // === 3. 정책 게이트 — 거부 시 즉시 403, stamina 차감/character.v2 lock 전. ===
  if (occRow) {
    const decision = evaluateOutpostEntry({
      policy: occRow.policy,
      occupiedByGuildId: occRow.occupiedByGuildId,
      viewerGuildId,
    });
    if (!decision.allowed) {
      return {
        ok: false as const,
        status: 403,
        body: {
          ok: false as const,
          error: "policy_blocked" as const,
          reason: decision.reason,
        },
      };
    }
  }

  // === 4. 세금 owner 결정 ===
  // 점령자가 본인이 아닌 다른 user 이고, 사냥자가 점령 길드 멤버가 아닐 때만
  // 세금 transfer. 같은 길드면 세금 면제(정책 게이트의 charge="none" 의미).
  // owner row 가 비어 있으면(가입했지만 캐릭 미생성) 고아 지급 위험 → skip.
  // 미점령(NPC 운영) 거점이면 OUTPOST_NPC_TAX_RATE 만큼 거점 금고에 누적.
  let taxOwnerId: string | null = null;
  let taxRate = 0;
  let npcTaxOutpostId: string | null = null;
  // 타일 전쟁 — 마커가 길드 점령 정착지 위면 사냥세 행선지(그 타일 금고). charSave lock 후 결정.
  let tileTaxOutpostId: string | null = null;
  if (
    occRow &&
    occRow.occupiedByUserId &&
    occRow.occupiedByUserId !== userId
  ) {
    const isSameGuild =
      occRow.occupiedByGuildId != null &&
      occRow.occupiedByGuildId === viewerGuildId;
    if (!isSameGuild) {
      const probe = await tx
        .select({ key: savesKv.key })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, occRow.occupiedByUserId),
            eq(savesKv.key, "character.v2"),
          ),
        )
        .limit(1);
      if (probe.length > 0) {
        taxOwnerId = occRow.occupiedByUserId;
        taxRate = Math.max(0, Math.min(1, Number(occRow.taxRate) || 0));
      }
    }
  } else if (outpostId && (!occRow || !occRow.occupiedByUserId)) {
    // 미점령 거점 사냥 — NPC 가 OUTPOST_NPC_TAX_RATE 만큼 징수, 거점 금고에 누적.
    npcTaxOutpostId = outpostId;
    taxRate = OUTPOST_NPC_TAX_RATE;
  }

  // === 5. character.v2 lock — deadlock 방지 위해 두 user 모두 잠글 땐 userId 정렬 순서 ===
  let charSave: CharSave;
  let ownerSave: CharSave | null = null;
  if (taxOwnerId) {
    const ids = [userId, taxOwnerId].sort();
    const first = await lockSaveForUpdate<CharSave>(
      tx,
      ids[0],
      "character.v2",
      {},
    );
    const second = await lockSaveForUpdate<CharSave>(
      tx,
      ids[1],
      "character.v2",
      {},
    );
    if (ids[0] === userId) {
      charSave = first;
      ownerSave = second;
    } else {
      charSave = second;
      ownerSave = first;
    }
  } else {
    charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
  }

  // equipment.v2 조기 잠금 (드랍/굴림 한 번에 기록). lock 순서 char→equipment.
  const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
    tx,
    userId,
    "equipment.v2",
    {},
  );
  const { owned: ownedEquip, equipped: equippedEquip } =
    parseEquipmentSave(equipmentSave);

  // 프론티어 깊이 게이트(수동 푸시) — 깊이 1~최고도달+1 만. 도달은 character.v2.frontierDepth.
  // 들판 초반(min 2 → 깊이 3까지)은 기본 해금. 잠긴 깊이는 stamina 소모 전 거부.
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(charSave.frontierDepth) || 2),
  );
  // 프론티어 끝 게이트 — 마지막 테마(MAX_FRONTIER_DEPTH) 너머는 콘텐츠 없음(새 테마 추가 전까지).
  if (depth > MAX_FRONTIER_DEPTH) {
    return {
      ok: false as const,
      status: 403,
      body: {
        ok: false as const,
        error: "frontier_end" as const,
        maxDepth: Math.min(frontierDepth, MAX_FRONTIER_DEPTH),
      },
    };
  }
  // 깊이 1~최고도달+1 게이트.
  if (depth > frontierDepth + 1) {
    return {
      ok: false as const,
      status: 403,
      body: {
        ok: false as const,
        error: "depth_locked" as const,
        maxDepth: frontierDepth,
      },
    };
  }

  // 오프라인 정산은 판별 시뮬 시각 주입(HP 회복을 5초 간격으로). 온라인 = 실시간.
  const now = ctx.nowOverride ?? Date.now();

  // === 희귀 탐사 — 입장 검증 + 보상 배수. 스태미나 차감 전 거부. ===
  // parse 가 만료/소진을 lazy purge — 아래 save 기록 시 정리분이 함께 영속된다.
  let rareMaps: RareMapInstance[] = parseRareMaps(charSave.rareMaps, now);
  let activeRareMap: RareMapInstance | null = null;
  if (rareMapIid) {
    activeRareMap = rareMaps.find((m) => m.iid === rareMapIid) ?? null;
    // utility 계열(비밀 상점/개명/화공)은 사냥 입장 불가 — 전용 화면에서 사용.
    if (
      !activeRareMap ||
      activeRareMap.depth !== depth ||
      RARE_MAP_KINDS[activeRareMap.kind].category !== "hunt"
    ) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "rare_map_invalid" as const },
      };
    }
  }
  // ⚠️ 보상 배수 = 종류별 임시 다이얼(rareMaps.ts). 유니크 드랍은 ×1 유지(보상 확정 시 결정).
  const mapDef = activeRareMap ? RARE_MAP_KINDS[activeRareMap.kind] : null;
  const mapExpMult = mapDef?.expMult ?? 1;
  const mapGoldMult = mapDef?.goldMult ?? 1;
  const mapDropMult = mapDef?.equipDropMult ?? 1;
  const mapUniqueMult = mapDef?.uniqueDropMult ?? 1;
  const mapStoneMult = mapDef?.enhanceStoneMult ?? 1;

  const stamina = parseStaminaFromSave(charSave.stamina, now);
  // per-user 스태미나 최대치 — 기본 + 한계의 비약 보너스.
  const staminaMax =
    MAX_STAMINA + staminaCapBonusOf(charSave.staminaCapBonus);
  // 쿨다운 모드 — 스태미나 폐지·전투 쿨다운(마지막 전투 후 HUNT_COOLDOWN_MS 경과해야 다음 판).
  //   V1식 한판한판 throttle. 그 외(스태미나 모드·코어루프 off) — 스태미나 차감. afterStamina 는
  //   쿨다운 모드일 때 회복만(스태미나 미사용이라 표시·한계의 비약 보존용).
  let afterStamina = applyRegen(stamina, now, staminaMax);
  if (HUNT_COOLDOWN_MODE) {
    // 오프라인 정산은 쿨다운 게이트 건너뜀(과거 누적 판수를 정산 — 미래 throttle 아님).
    const lastBattleAt = Number(charSave.lastBattleAt) || 0;
    if (!ctx.offline && combatCooldownRemainingMs(lastBattleAt, now) > 0) {
      return {
        ok: false as const,
        status: 429,
        body: {
          ok: false as const,
          error: "on_cooldown" as const,
          nextBattleAt: lastBattleAt + HUNT_COOLDOWN_MS,
          cooldownMs: HUNT_COOLDOWN_MS,
        },
      };
    }
  } else {
    const after = tryConsume(stamina, HUNT_COST, now, staminaMax);
    if (!after) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(stamina, now, staminaMax),
        },
      };
    }
    afterStamina = after;
  }

  // PR-perf — character/equipment 에 더해 skills/proficiency 도 derive 전에 한 번 lock-read 해서
  //   4개 save 를 모두 preload → derive 의 중복 select 자체를 제거(판당 prof 2read→1·skills
  //   2read→1·derive 왕복 0). #571 이 캡 산출 select 를 이미 제거했으니, 남은 prof read 는
  //   derive 의 SELECT 와 권위 쓰기 락 둘 — 이 둘을 upfront 락 하나로 합친다. 같은 락 결과를
  //   아래 cast hook·권위적 proficiency 쓰기에서 재사용(동일 tx 스냅샷·중간 쓰기 없음 →
  //   결과 byte-동일). 레벨 캡은 #571 처럼 derive 가 노출한 player.classTier 를 쓴다.
  //   lock 순서: character→equipment→
  //   skills→proficiency. 모든 라우트가 character.v2 를 가장 먼저 잠그므로 같은 유저 동시 tx 는
  //   character.v2 에서 직렬화 → 이후 같은-유저 키 락 순서는 데드락과 무관(dev/admin grant 도
  //   이미 proficiency→inventory 순이라 이 순서가 외려 더 일관).
  const preparedActor = await prepareV2BattleActor({
    tx,
    userId,
    charSave,
    equipmentSave,
  });
  if (!preparedActor) {
    return {
      ok: false as const,
      status: 400,
      body: {
        ok: false as const,
        error: "no_character" as const,
        stamina: afterStamina,
      },
    };
  }
  const {
    player,
    skills: v2Skills,
    proficiencyRaw,
    playerElement,
    basicAttackElement,
  } = preparedActor;

  // PR-1/5b 속성 상성 — 양방향 데미지 ±%.
  //   캐릭 속성(playerElement) = 방어(피격) 속성 + 스킬 기본 속성.
  //   평타/공격 속성(basicAttackElement) = 무기 속성 ?? 캐릭 속성 (PR-5b 무기 속성 우선).
  //   atk 엔 basicAttackElement 를 baked, 스킬은 combatShared 가 스킬속성으로 재정규화.

  // 적 — 깊이 풀에서 랜덤 픽 후 깊이 스케일(이름·초상화는 사냥터 고유 값으로 덮어씀).
  //   spread 로 새 객체를 만들어 V2_MONSTERS 카탈로그 원본을 mutate 하지 않는다.
  const enemy = pickRandomEnemy(enemiesForDepth(depth));
  if (!enemy) {
    return {
      ok: false as const,
      status: 400,
      body: {
        ok: false as const,
        error: "empty_floor" as const,
        stamina: afterStamina,
      },
    };
  }
  const baseMonster = V2_MONSTERS[enemy.key];
  if (!baseMonster) {
    return {
      ok: false as const,
      status: 500,
      body: {
        ok: false as const,
        error: "monster_not_found" as const,
        stamina: afterStamina,
      },
    };
  }
  const enemyName: string = enemy.name;
  const monsterElement: V2Element = enemy.element ?? "neutral";
  const scaledEnemy = scaleMonsterForFloor(baseMonster, depth);
  // PR-9 + 마법몹 시전 — 사냥터 몹 v2 스킬 시드. statusSkill(DoT/디버프) + castSkill(마법 단일딜)을
  //   병합해 equipped 에 둔다(둘 다 monsterOnly·mpCost 0). 엔진 적 페이즈가 슬롯순+쿨다운+procChance 로
  //   자동 시전(시전 턴 평타 생략). 둘 다 없으면 v2Skills 미시드(byte-identical). v2 전용(라이브 Monster 무수정).
  const seededMonsterSkills = [enemy.statusSkill, enemy.castSkill].filter(
    (s): s is NonNullable<typeof s> => s != null,
  );
  const enemyMonster: import("@/adventure/data/monsters/types").Monster = {
    ...scaledEnemy,
    name: enemyName,
    image: enemy.image ?? baseMonster.image,
    element: monsterElement, // PR-5b — 스킬 cast 상성 계산용.
    ...(seededMonsterSkills.length
      ? {
          v2Skills: {
            learned: seededMonsterSkills,
            equipped: seededMonsterSkills,
          },
        }
      : {}),
  };
  const playerElemMult = elementDamageMult(
    basicAttackElement,
    monsterElement,
    // 원소 통달(원소술사) — 유리/불리 +%p 가산. 미보유=0 → 전역 상수(byte-identical). atk 에 baked 되어
    //   평타·스킬(같은 속성) 데미지 모두 이 배수를 받는다(스킬은 combatShared 가 mSkill/mBasic=1 로 통과).
    V2_ELEMENT_ADV_PCT + (player.player.elementAdvPctBonus ?? 0),
    V2_ELEMENT_DIS_PCT + (player.player.elementDisPctBonus ?? 0),
  );
  // 약점 찌르기 = 공격 전용(2026-06-08): 몹→플레이어 속성 피해는 제거(중립). 페널티/피격↑ 없음.
  const playerElemMatchup = elementMatchup(
    basicAttackElement,
    monsterElement,
  );

  // 전투 로그에 박을 캐릭 이름 — character-profile.v2 의 name. 없으면 "모험가".
  const profile = await readSave<{ name?: string } | null>(
    tx,
    userId,
    "character-profile.v2",
    null,
  );
  const playerName = profile?.name?.trim() || "모험가";

  // 사냥 전 hp 회복 — 마지막 사냥 이후 흐른 시간만큼 충전.
  const hpBefore = parseHpRegenSince(charSave.hpRegenSince, now);
  const regenResult = applyHpRegen(
    Math.max(0, charSave.hp ?? player.maxHp),
    player.maxHp,
    hpBefore,
    now,
  );

  const invSave = await lockSaveForUpdate<{
    hpCharges?: number;
    mpCharges?: number;
    [k: string]: unknown;
  }>(tx, userId, "inventory.v2", {});
  let hpCharges = Math.max(0, invSave.hpCharges ?? 0);
  let mpCharges = Math.max(0, invSave.mpCharges ?? 0);

  let startPlayerHp = regenResult.hp;
  let usedPreBattleHpCharge = false;
  if (!canHuntWithHp(startPlayerHp, player.maxHp) && hpCharges > 0) {
    const restore = Math.min(player.maxHp - startPlayerHp, hpCharges);
    if (restore > 0) {
      startPlayerHp += restore;
      hpCharges -= restore;
      usedPreBattleHpCharge = true;
    }
  }

  const playerForBattle = {
    ...player.player,
    hp: startPlayerHp,
    // MP 실자원화 — 보존된 MP 로 전투 시작(derive 가 character.v2.mp 시드). 전투 후 mpCharges 가
    // 부족분을 채우므로 충전약이 남는 한 사실상 풀로 시작하고, 떨어지면 줄어 마법 위력이 빠진다.
    mp: player.player.mp,
    atk: Math.max(1, Math.round(player.player.atk * playerElemMult)),
    magicAtk: Math.max(
      0,
      Math.round((player.player.magicAtk ?? 0) * playerElemMult),
    ),
    // PR-5b — 평타 속성(baked) + 캐릭 속성(스킬 기본·피격 방어). combatShared 가 스킬 보정에 사용.
    attackElement: basicAttackElement,
    characterElement: playerElement,
  };

  // 체력 부족(최대치 5% 미만) 상태에선 사냥 불가 — 스태미나 미소모 + hpRegenSince 미리셋으로
  // 회복 대기. 0 에서 시간 재생이 0→1 을 금방 넘겨 doomed 전투가 새던 문제를 안정적으로 차단.
  // 시간 경과(또는 치료소)로 회복되면 다시 사냥 가능. 일괄사냥의 death-stop 가드와 같은 의도.
  if (!canHuntWithHp(startPlayerHp, player.maxHp)) {
    if (usedPreBattleHpCharge) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        hp: startPlayerHp,
        hpRegenSince: now,
      });
      await upsertSave(tx, userId, "inventory.v2", {
        ...invSave,
        hpCharges,
        mpCharges,
      });
    }
    return {
      ok: false as const,
      status: 409,
      body: {
        ok: false as const,
        error: "hp_zero" as const,
        stamina: applyRegen(stamina, now, staminaMax),
      },
    };
  }

  // v2Skills 는 위(derive 직전)에서 이미 lock-read·parse 했다. cast hook 이 그대로 사용.
  const battleResult = resolveBattle(
    playerForBattle,
    enemyMonster,
    playerName,
    {
      pickAction: (state) =>
        pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      depth, // ATB 몬스터 SPD 깊이 보정(레거시 무시)
    },
  );

  const won = battleResult.outcome === "win";
  const curLevel = Math.max(1, charSave.level ?? 1);
  // 신참 보너스 판정용 누적 전투 전적 — adventure-log.v2 의 monster kills 합 + 패배수.
  // v2 는 재전직이 레벨을 1 로 리셋하므로 레벨이 아닌 전적으로 신참을 가린다(베테랑이
  // 재전직할 때마다 보너스가 잘못 되살아나는 것 방지). read-only 스냅샷(게이트용)이라
  // 비잠금 — 권위적 kill 증가는 아래 lock 구간(adventure-log.v2)에서 한다.
  const logVal = await readSave<unknown>(tx, userId, "adventure-log.v2", null);
  const battleCount = battleCountOf(logVal);
  // EXP = monster.exp → 신참 보너스(전적 ≤ 3만 ×2, EXP 전용) → 전역 배율(staging 기본
  // 2.2/IS_STAGING, 라이브 1.0). 라이브 battleClaim 과 같은 순서(newbie 먼저, 그 다음 배율).
  const baseRewards = computeBattleRewards({
    won,
    enemyMonster,
    battleCount,
    mapExpMult,
    mapGoldMult,
  });
  const expGained = applyGuildCombatRewardBonus(
    baseRewards.expGained,
    guildCombatSupply.expPct,
  );
  const goldGross = applyGuildCombatRewardBonus(
    baseRewards.goldGross,
    guildCombatSupply.goldPct,
  );
  // 드랍 굴림 — 승리 시 재료/강화석/소환서/재련석/정착지 재료 + 정규/유니크 장비를 한 번에
  //   굴린다(순수 RNG 헬퍼·huntDrops). 영속(materials merge·equipment.v2 기록)은 아래 라우트가.
  const { drops, droppedEquipment, droppedUnique, nextOwned } = rollHuntDrops({
    won,
    dropFloor,
    depth,
    ownedEquip,
    mapDropMult,
    mapUniqueMult,
    mapStoneMult,
  });
  const nextMaterials = mergeDrops(charSave.materials, drops);
  // equipment.v2 한 번에 기록 — owned(+드랍 개체). 굴림은 개체에 포함. 조기 lock 한 걸 한 번에 기록.
  await upsertSave(tx, userId, "equipment.v2", {
    owned: nextOwned,
    equipped: equippedEquip,
  });

  // 타일 전쟁(flag) — 마커(charSave.tilePos)가 길드 점령 정착지 위면 사냥세를 그 타일 금고로
  //   돌린다(점령자 개인 X·영토 우선). 서버 권위(클라 신뢰 X)·비잠금 read(treasury 키=타일 id
  //   안정·증분 원자적 → FOR UPDATE 불요로 락 순서 보존). off → 블록 스킵(byte-identical).
  if (V2_TILE_WARFARE) {
    const tp = charSave.tilePos as
      | { col?: unknown; row?: unknown }
      | null
      | undefined;
    const tcol = Number(tp?.col);
    const trow = Number(tp?.row);
    if (Number.isInteger(tcol) && Number.isInteger(trow)) {
      const tId = tileOutpostId(tcol, trow);
      const [tileOcc] = await tx
        .select({
          occupiedByGuildId: outpostOccupations.occupiedByGuildId,
          taxRate: outpostOccupations.taxRate,
        })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, tId))
        .limit(1);
      if (tileOcc && tileOcc.occupiedByGuildId != null) {
        tileTaxOutpostId = tId;
        taxOwnerId = null;
        npcTaxOutpostId = null;
        taxRate = Math.max(0, Math.min(1, Number(tileOcc.taxRate) || 0));
      }
    }
  }

  // 세금 계산 — 위에서 결정한 taxOwnerId/npcTaxOutpostId/tileTaxOutpostId/taxRate 사용.
  // outpost FOR UPDATE 로 정책/세율 스냅샷 — 점령자가 hunt 도중 정책을 바꿔도
  // 이 hunt 는 진입 시점 값으로 처리, 다음 hunt 부터 변경 반영. 교역로 ×1.15 곱은 huntTax 내부.
  const goldTaxed = computeGoldTax({
    taxOwnerId,
    npcTaxOutpostId,
    tileTaxOutpostId,
    taxRate,
    won,
    goldGross,
  });
  const goldNet = goldGross - goldTaxed;

  // 코어루프 패배 페널티 — 마지막 패배 이후 번 골드(atRiskGold)를 승리마다 누적, 패배 시 그
  //   절반(보유 한도 클램프)을 소실하고 0 리셋. 원금이 아닌 최근 승리분만 대상 → 전멸 없음.
  //   off = lossTax 0·atRiskGold 미기록(byte-identical). 소실 골드는 어디에도 입금하지 않는다.
  const { lossTax, nextAtRisk } = computeLossTax({
    won,
    goldNet,
    atRiskGoldRaw: charSave.atRiskGold,
    goldRaw: charSave.gold,
  });

  // 유효 레벨 캡 — 코어루프 on 은 단일 만렙, off 는 현 직군 차수 캡. none = 만렙(4차 캡 100).
  // PR-perf: 차수(player.classTier)는 위 derive 가 같은 tx 에서 읽은 proficiency 에서 산출한
  //   값(prof.groups[현직군].tier ?? 1)이라, 캡 산출용 proficiency 재select(판당 1회) 불필요.
  //   (none 은 derive classTier=1 로 떨어지므로 분기 유지 — 권위 cumLevel 쓰기는 아래 락.)
  const capGroup = tier1ClassOf(parseV2Class(charSave.class));
  // 코어루프 on = 단일 캡(V2_LEVEL_CAP 100)·차수 무관. off = 기존 차수 캡(none 은 4차 캡으로 미상한).
  const levelCap =
    capGroup === "none"
      ? effectiveLevelCap(4)
      : effectiveLevelCap(player.classTier);

  const curExp = Math.max(0, charSave.exp ?? 0);
  const expResult = applyExpGain(curLevel, curExp, expGained, levelCap);

  const newGold = Math.max(0, (charSave.gold ?? 0) + goldNet - lossTax);

  // 사냥 후 hp/mp — finalState 시작. 충전식 모델 (1g=1충전, 1000 cap):
  // inventory.v2.{hpCharges, mpCharges} 보유량 만큼 부족분 자동 회복. 옛 POTIONS
  // 카탈로그 (heal_s/m/l 등) 폐기 후 단순 카운터.
  let afterHp = Math.max(0, battleResult.finalState.playerHp);
  // MP 실자원화 — 전투 후 잔여 MP 를 mpCharges 로 충당(HP 와 대칭). 충전약이 남아 있으면
  // 사실상 매 전투 풀충전처럼 보이고, 떨어지면 MP 가 줄어 마법 위력이 빠진다.
  const maxMp = player.player.maxMp ?? 0;
  let afterMp = Math.max(
    0,
    Math.min(maxMp, battleResult.finalState.playerMp),
  );

  // 충전식 회복약 소모 — 전투 후 HP/MP 부족분을 보유 충전량으로 채운다(순수 헬퍼·huntRewards).
  ({ afterHp, afterMp, hpCharges, mpCharges } = applyChargeRestore({
    afterHp,
    afterMp,
    maxHp: player.maxHp,
    maxMp,
    hpCharges,
    mpCharges,
  }));
  await upsertSave(tx, userId, "inventory.v2", {
    ...invSave,
    hpCharges,
    mpCharges,
  });

  // 침입자 트래킹 — 사냥 성공 시 lastHuntedOutpost 갱신 (outpost 사냥에 한해).
  // 패배해도 거점에서 사냥 시도는 한 셈이라 트래킹. 미점령 거점도 트래킹 X 의미 없으므로
  // outpostId 가 있을 때만.
  const nextLastHunted: LastHuntedOutpost | undefined = outpostId
    ? { outpostId, at: now }
    : undefined;

  // ejectedFrom 은 직전 사냥 응답 1회용 — 이 응답에 surface 후 키 자체 제거.
  // (undefined 박는 대신 destructure 로 명시적 제거 — JSON 직렬화 동작 의존 제거)
  const ejectedNotice: EjectedFrom | null = parseEjectedFrom(
    charSave.ejectedFrom,
  );
  const { ejectedFrom: _dropEjected, ...charSaveWithoutEject } = charSave;
  void _dropEjected;

  // === 레어맵 갱신 — 입장 중이면 판수 차감(승패 무관), 아니면 신규 드랍 롤(순수 헬퍼·huntRareMaps). ===
  // ⚠️ 반드시 next 빌드 전에 적용 — character.v2 저장(아래 upsertSave)에 rareMaps 가
  //   포함되므로. 과거엔 이 블록이 save 뒤에 있어 판수 차감·신규 드랍이 영속되지 않았다.
  const rareMapUpdate = updateRareMaps({
    activeRareMap,
    rareMaps,
    won,
    depth,
    now,
  });
  rareMaps = rareMapUpdate.rareMaps;
  const rareMapDrop = rareMapUpdate.rareMapDrop;
  const rareMapRunsLeft = rareMapUpdate.rareMapRunsLeft;

  const next = {
    ...charSaveWithoutEject,
    stamina: afterStamina,
    hp: afterHp,
    mp: afterMp,
    hpRegenSince: now,
    level: expResult.level,
    exp: expResult.exp,
    gold: newGold,
    materials: nextMaterials,
    rareMaps,
    // 프론티어 수동 푸시 — 최고도달+1 깊이를 이기면 해금(+1). 패배·기존깊이면 유지. MAX 캡으로
    //   정규화(레거시 무한기 >42 저장값도 현재 콘텐츠 끝 42 로 수렴 → 새 테마 추가 시 그 지점부터 재공략).
    frontierDepth: Math.min(
      MAX_FRONTIER_DEPTH,
      won && depth > frontierDepth ? depth : frontierDepth,
    ),
    // outpost 사냥 → 트래킹 업데이트. 미점령 거점 또는 outpostId 없는 hunt 면 기존값 유지.
    ...(nextLastHunted ? { lastHuntedOutpost: nextLastHunted } : {}),
    // 사냥 쿨다운 시각 — 코어루프면 기록(off 면 키 불변). 토벌은 자기 영지 방어라
    //   이 값을 보지 않는다. 오프라인 정산은 per-battle 기록 생략(정산 루프가 마지막에
    //   lastBattleAt=realNow 한 번).
    ...(V2_CORE_LOOP_V2 && !ctx.offline ? { lastBattleAt: now } : {}),
    // 코어루프 패배 페널티 카운터 — 승리 누적/패배 리셋(off 면 키 불변). 스태미나 모드에도 유지.
    ...(V2_CORE_LOOP_V2 ? { atRiskGold: nextAtRisk } : {}),
    // 오프라인 정산 farm 깊이 — 쿨다운 모드의 정상 사냥(레어맵 아님)만 기록(스태미나 모드는 오프라인 폐지).
    ...(HUNT_COOLDOWN_MODE && !ctx.offline && !rareMapIid
      ? { lastHuntDepth: depth }
      : {}),
  };
  await upsertSave(tx, userId, "character.v2", next);

  // 전투수 랭킹용 몬스터 킬 카운터 — huntKillLog(콜로케이트) 로 추출.
  // lock 순서: character.v2 다음 → proficiency.v2 앞(일관 순서, 데드락 회피)은 이 위치가 보장.
  if (won) {
    await recordMonsterKill(tx, userId, enemyName, now);
  }

  // PR-prof — 승리 시 직업군 숙련도 적립 + 레벨업 시 랜덤 스탯 성장(앵커 가중, cap 까지).
  // 산출은 huntProficiency(콜로케이트 순수 헬퍼), 쓰기만 여기서. lock 순서: character.v2 다음에
  // proficiency.v2. PR-perf — upfront lock-read 한 proficiencyRaw 재사용(같은 tx 스냅샷).
  const {
    nextProficiency,
    proficiencyGained,
    masteryGained,
    masteryAfter,
    spMilestonesGained,
    statGains,
  } = applyHuntProficiency({
    won,
    depth,
    charSave,
    proficiencyRaw,
    equippedSkills: v2Skills.equipped,
    proficiencyChancePct: guildCombatSupply.proficiencyChancePct,
    levelsGained: expResult.levelsGained,
    levelAfter: expResult.level,
    levelCap,
  });
  if (nextProficiency) {
    await upsertSave(tx, userId, "proficiency.v2", nextProficiency);
  }
  // 레벨업 HP/MP 성장량 — 결과 카드 표시용(레벨당 고정분 + 오른 VIT·INT). 파생식과 동일 계수.
  const { hp: hpGain, mp: mpGain } =
    expResult.levelsGained > 0
      ? v2LevelGrowthHpMp({
          levelsGained: expResult.levelsGained,
          vitGained: statGains.vit ?? 0,
          intGained: statGains.int ?? 0,
        })
      : { hp: 0, mp: 0 };

  // 보물 탐사 — 사냥 승리 시 낮은 확률로 지도 조각 드랍(트리클). 굴림은 100% 서버.
  // 드랍 났을 때만 키를 잠근다 — 락 순서상 가장 마지막. 조각 소비(발굴)는 PR-3.
  const fragmentDrop = won
    ? rollFragmentDrop(Math.random, HUNT_FRAGMENT_DROP_CHANCE)
    : 0;
  let fragmentsTotal = 0;
  if (fragmentDrop > 0) {
    const frags = parseTreasureFragments(
      await lockSaveForUpdate(tx, userId, TREASURE_FRAGMENTS_KEY, {}),
    );
    const nextFrags = addFragments(frags, fragmentDrop);
    await upsertSave(tx, userId, TREASURE_FRAGMENTS_KEY, nextFrags);
    fragmentsTotal = nextFrags.fragments;
  }

  // 세금 transfer. 정착지 전쟁(flag) on = 점령지 세금도 거점 금고에 누적(영주 수확·약탈 대상화);
  //   off = 점령자 개인 골드 직행(현행·byte-identical). 큐/락 순서 불변(ownerSave 는 위에서 lock 유지).
  if (goldTaxed > 0 && taxOwnerId) {
    if (V2_SETTLEMENT_WARFARE && outpostId) {
      await creditOutpostTreasury(tx, outpostId, goldTaxed, now);
    } else if (ownerSave) {
      await upsertSave(tx, taxOwnerId, "character.v2", {
        ...ownerSave,
        gold: Math.max(0, (ownerSave.gold ?? 0) + goldTaxed),
      });
    }
  }
  // NPC 세금 — 미점령 거점 금고에 누적. 추후 점령 전쟁 보상으로 사용.
  if (goldTaxed > 0 && npcTaxOutpostId) {
    await creditOutpostTreasury(tx, npcTaxOutpostId, goldTaxed, now);
  }
  // 타일 전쟁 — 길드 점령 정착지 금고에 누적(영주 수확·약탈 대상). flag off → tileTaxOutpostId null.
  if (goldTaxed > 0 && tileTaxOutpostId) {
    await creditOutpostTreasury(tx, tileTaxOutpostId, goldTaxed, now);
  }
  // 코어루프 패배 페널티는 순수 소실이다. 보유 골드에서 이미 차감됐고, 세금처럼 금고에 쌓지 않는다.

  return {
    ok: true as const,
    status: 200,
    body: {
      ok: true as const,
      stamina: afterStamina,
      result: {
        floor: depth, // 깊이(클라 호환 키)
        maxDepth: Math.min(
          MAX_FRONTIER_DEPTH,
          won && depth > frontierDepth ? depth : frontierDepth,
        ), // 최고 도달(MAX 캡으로 정규화)
        enemyName,
        won,
        expGained,
        proficiencyGained, // 숙달 포인트 획득(승리·수행 프로필 보유 시 깊이별 +2~3).
        masteryGained, // 직업 숙련도 획득(승리·직업 보유 시 +1).
        masteryAfter, // 상시 카드 readout — 사냥 후 현재 직업 숙련도(none=null).
        goldGained: goldNet, // 사냥자 실 수령 (세금 차감 후)
        goldAfter: newGold, // 사냥 후 최종 보유 골드 — 클라 공용 상태 즉시 동기화용.
        goldGross,
        goldTaxed,
        // 코어루프 패배 페널티 — flag on 일 때만 노출(off 면 키 없음 = 응답 byte-identical).
        //   lossTax = 이번 판 소실액(0=승리), atRiskGold = 마지막 패배 이후 누적 승리분.
        ...(V2_CORE_LOOP_V2
          ? { lossTax, atRiskGold: nextAtRisk, spMilestonesGained }
          : {}),
        levelsGained: expResult.levelsGained,
        statGains, // 레벨업 랜덤 성장으로 오른 1차 스탯 ({} = 레벨업 없음).
        hpGain, // 레벨업으로 오른 maxHp (레벨 고정분 + VIT).
        mpGain, // 레벨업으로 오른 maxMp (레벨 고정분 + INT).
        turns: battleResult.turns,
        hpBefore: startPlayerHp,
        hpAfter: afterHp,
        maxHp: player.maxHp,
        mpAfter: afterMp,
        maxMp,
        // 레어맵 — 이번 사냥에서 새 지도 발견(kind id) / 입장 중이면 남은 판수.
        rareMapDrop,
        rareMapRunsLeft,
        // PR-1 속성 상성 — 결과 카드에 "유리/불리" 표기.
        playerElement,
        monsterElement,
        elementMatchup: playerElemMatchup,
        // 충전식 회복약 잔량 — HP/MP 모두 전투 후 부족분 자동 소모 반영.
        hpCharges,
        mpCharges,
        drops,
        droppedEquipment,
        // 보물 탐사 — 이번 사냥 지도 조각 드랍 수 + 누적(0 = 안 떨어짐).
        fragmentDrop,
        fragmentsTotal,
        droppedUnique,
        ejected: ejectedNotice,
        // BattleScene replay 용 — BattleScene 이 실제로 보는 필드만 추출
        // (enemy.{name,hp,image}, playerMaxHp, log). 클라가 buildBattleStateFromReplay
        // 로 BattleState 형태로 재구성. log 는 마지막 200 cap.
        replay: fullReplay
          ? toReplayPayload(battleResult.finalState, 200, { depth })
          : toReplayPayloadLite(battleResult.finalState, { depth }),
        // replay UI 의 시작 HP — 사전 회복 적용 후 사냥 진입 시점.
        startPlayerHp,
        // 이 사냥의 시작 EXP/maxExp — replay UI 의 EXP 바 표시용
        // (사냥 후 변동은 결과 카드로 분리).
        expForBar: curExp,
        maxExpForBar: requiredExpToNextNullable(curLevel) ?? curExp,
        // 사냥 후 EXP/maxExp — 일괄(5/10회) 사냥 합산 결과 아래 캐릭터 정보 카드가
        // 현재 진행도(다음 레벨까지)를 정확히 보일 때 사용. 레벨업이 섞여도 맞도록
        // 서버의 applyExpGain 결과(expResult)를 그대로 노출.
        expAfter: expResult.exp,
        maxExpAfter:
          requiredExpToNextNullable(expResult.level) ?? expResult.exp,
      },
    },
  };
} // ← runOneHunt 끝

// 세금 수취자 표시 라벨 — 점령 길드명 > 솔로 점령자 닉네임 > 미점령(NPC) "거점 금고".
// runOneHunt 의 세금 owner 결정(§4)과 같은 분기를 표기용으로만 따라간다.
async function resolveTaxOwnerLabel(outpostId: string): Promise<string> {
  const [occ] = await db
    .select({
      occupiedByUserId: outpostOccupations.occupiedByUserId,
      occupiedByGuildId: outpostOccupations.occupiedByGuildId,
    })
    .from(outpostOccupations)
    .where(eq(outpostOccupations.outpostId, outpostId))
    .limit(1);
  if (!occ?.occupiedByUserId) return "거점 금고";
  if (occ.occupiedByGuildId != null) {
    const [g] = await db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, occ.occupiedByGuildId))
      .limit(1);
    if (g?.name) return `${g.name} 길드`;
  }
  return resolveUserDisplayName(occ.occupiedByUserId);
}

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 명시적 string — runOneHunt(중첩 클로저)에서 narrowing 이 풀리지 않게.
  const userId: string = maybeUserId;
  const rateLimit = checkUserRateLimit({
    userId,
    action: "v2:dungeon:hunt",
    limit: 180,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return userRateLimitResponse(rateLimit.retryAfterSec);
  }

  let body: {
    floor?: unknown; // = 프론티어 깊이(depth). 클라 호환 위해 키 이름 유지.
    outpostId?: unknown;
    count?: unknown; // 일괄 사냥 횟수(없으면 1=단판).
    rareMap?: unknown; // 레어맵 입장 — 보유 지도 iid (소유/깊이/판수 검증은 save lock 후).
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // floor = 깊이(무한). 정수·≥1 만 조기 검증 — 최고도달+1 게이트는 save lock 후(아래).
  if (
    typeof body.floor !== "number" ||
    !Number.isInteger(body.floor) ||
    body.floor < 1
  ) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const depth = body.floor;
  const dropFloor = Math.min(depth, DROP_FLOOR_CAP) as DungeonFloorId;

  // outpostId 는 선택적. 있으면 점령자 lookup + 골드 세금 transfer.
  // 없으면(또는 모르는 id) 세금 없이 사냥자가 100% gold.
  let outpostId: string | null = null;
  if (typeof body.outpostId === "string" && body.outpostId.length > 0) {
    if (OUTPOSTS.some((o) => o.id === body.outpostId)) {
      outpostId = body.outpostId;
    }
  }

  // 일괄 사냥 횟수 — 1~MAX. 미전달/비정상이면 1(단판, 기존 동작).
  // 쿨다운 모드 — 일괄 폐지(V1식 한판한판·전투 쿨다운이 throttle). 누적 판수는 오프라인 정산이 담당.
  //   스태미나 모드/off — 일괄 허용(스태미나가 throttle).
  const count = HUNT_COOLDOWN_MODE
    ? 1
    : Math.max(
        1,
        Math.min(MAX_HUNT_BATCH, Math.floor(Number(body.count) || 1)),
      );

  const rareMapIid =
    typeof body.rareMap === "string" && body.rareMap.length > 0
      ? body.rareMap
      : null;

  const result = await db.transaction(async (tx) => {
    const ctx: RunOneHuntCtx = {
      tx,
      userId,
      depth,
      dropFloor,
      outpostId,
      rareMapIid,
    };

    // === 일괄(batch) 루프 ===
    // count===1 은 기존 단판 응답 그대로(full 리플레이 포함, 무변경).
    if (count === 1) {
      return await runOneHunt(true, ctx);
    }
    // count>1 — 한 트랜잭션에서 N회. 스태미나 부족·HP 부족·사망이면 중단(완료분은 커밋).
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalProficiency = 0;
    let totalGold = 0;
    let totalGoldGross = 0; // 세전 합산 — 결과 카드 세금 줄 표기용.
    let totalGoldTaxed = 0;
    let totalMastery = 0;
    let proficiencyAfter: number | null = null; // 상시 카드 readout — 가장 최근 사냥의 현재 숙련도.
    let levelsGained = 0;
    let spMilestonesGained = 0; // 코어루프 — 일괄 동안 새로 넘은 SP 마일스톤 합산(flag off=0).
    const statGains: Partial<Record<V2StatKey, number>> = {};
    let hpGained = 0; // 일괄 동안 레벨업으로 오른 maxHp 합산.
    let mpGained = 0; // 일괄 동안 레벨업으로 오른 maxMp 합산.
    const drops: DropResult = {};
    const droppedEquipments: V2EquipmentId[] = [];
    const droppedUniques: V2EquipmentId[] = [];
    const rareMapDrops: RareMapKindId[] = [];
    let rareMapRunsLeft: number | null = null;
    let stoppedReason:
      | "stamina"
      | "death"
      | "defeat"
      | "recovery"
      | "error"
      | null = null;
    let lastStamina: unknown = null;
    let finalHpAfter: number | null = null;
    let finalMaxHp: number | null = null;
    let finalMaxDepth: number | null = null;
    let expAfter: number | null = null;
    let maxExpAfter: number | null = null;
    // 일괄 결과 아래 캐릭터 정보 카드용 — 마지막 사냥 후 회복약 충전량 + MP 보유 여부.
    let hpCharges: number | null = null;
    let mpCharges: number | null = null;
    let playerMaxMp: number | null = null;
    let finalMpAfter: number | null = null;
    let finalGoldAfter: number | null = null;
    let ejected: EjectedFrom | null = null;
    const replays: Array<{
      index: number;
      enemyName: string;
      won: boolean;
      turns: number;
      replay: ReplayPayload;
      startPlayerHp: number;
      expForBar: number;
      maxExpForBar: number;
      hpCharges: number;
      mpCharges: number;
      elementMatchup: ElementMatchup;
    }> = [];

    for (let i = 0; i < count; i++) {
      const r = await runOneHunt(true, ctx);
      if (!r.ok) {
        // 첫 사냥부터 실패면 단판과 동일하게 에러 응답 그대로(409 스태미나/HP·403 정책 등).
        //   버튼이 스태미나/회복 상태에선 비활성이라 실사용상 드물다. 중간(완료>0) 실패는
        //   완료분 요약 + 라벨로 중단(스태미나 소진·저체력·기타).
        if (completed === 0) return r;
        const err = (r.body as { error?: string }).error;
        if (err === "out_of_stamina") stoppedReason = "stamina";
        else if (err === "hp_zero") stoppedReason = "recovery";
        else stoppedReason = "error";
        lastStamina = (r.body as { stamina?: unknown }).stamina ?? lastStamina;
        break;
      }
      const res = r.body.result;
      completed++;
      if (res.won) wins++;
      else losses++;
      totalExp += res.expGained;
      totalProficiency += res.proficiencyGained;
      totalMastery += res.masteryGained ?? 0;
      if (res.masteryAfter != null) proficiencyAfter = res.masteryAfter;
      totalGold += res.goldGained;
      totalGoldGross += res.goldGross ?? res.goldGained;
      totalGoldTaxed += res.goldTaxed ?? 0;
      levelsGained += res.levelsGained;
      spMilestonesGained += res.spMilestonesGained ?? 0;
      for (const [k, n] of Object.entries(res.statGains)) {
        const key = k as V2StatKey;
        statGains[key] = (statGains[key] ?? 0) + (n ?? 0);
      }
      hpGained += res.hpGain ?? 0;
      mpGained += res.mpGain ?? 0;
      for (const [id, n] of Object.entries(res.drops)) {
        const key = id as keyof DropResult;
        drops[key] = (drops[key] ?? 0) + (n ?? 0);
      }
      if (res.droppedEquipment) droppedEquipments.push(res.droppedEquipment);
      if (res.droppedUnique) droppedUniques.push(res.droppedUnique);
      if (res.rareMapDrop) rareMapDrops.push(res.rareMapDrop);
      rareMapRunsLeft = res.rareMapRunsLeft ?? rareMapRunsLeft;
      if (res.ejected && !ejected) ejected = res.ejected;
      replays.push({
        index: completed,
        enemyName: res.enemyName,
        won: res.won,
        turns: res.turns,
        replay: res.replay,
        startPlayerHp: res.startPlayerHp,
        expForBar: res.expForBar,
        maxExpForBar: res.maxExpForBar,
        hpCharges: res.hpCharges,
        mpCharges: res.mpCharges,
        elementMatchup: res.elementMatchup,
      });
      lastStamina = r.body.stamina;
      finalHpAfter = res.hpAfter;
      finalMpAfter = res.mpAfter ?? finalMpAfter;
      finalGoldAfter = res.goldAfter ?? finalGoldAfter;
      if (res.maxMp != null) playerMaxMp = res.maxMp;
      finalMaxHp = res.maxHp;
      finalMaxDepth = res.maxDepth;
      expAfter = res.expAfter;
      maxExpAfter = res.maxExpAfter;
      hpCharges = res.hpCharges ?? hpCharges;
      mpCharges = res.mpCharges ?? mpCharges;
      playerMaxMp = res.replay?.playerMaxMp ?? playerMaxMp;
      // 레어맵 판수 소진 — 다음 사냥이 rare_map_invalid 로 막히므로 여기서 깔끔히 중단.
      if (rareMapIid && (res.rareMapRunsLeft ?? 0) <= 0) {
        break;
      }
      // 사망/저체력이면 다음 사냥이 서버에서 막히므로 즉시 중단(라벨 구분: 사망 vs 회복필요).
      if (res.hpAfter <= 0) {
        stoppedReason = "death";
        break;
      }
      // 패배 시 중단 — 녹아웃(hpAfter<=0)은 위 사망으로 잡히고, 여기선 살아남았지만 진 경우
      //   (ATB 틱 상한 초과 = 못 잡는 적). 보상 0 사냥을 반복하지 않게 즉시 멈춘다.
      if (!res.won) {
        stoppedReason = "defeat";
        break;
      }
      if (!canHuntWithHp(res.hpAfter, res.maxHp)) {
        stoppedReason = "recovery";
        break;
      }
    }

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        stamina: lastStamina,
        batch: {
          attempted: count,
          completed,
          wins,
          losses,
          totalExp,
          totalProficiency,
          totalMastery,
          proficiencyAfter,
          totalGold,
          totalGoldGross,
          totalGoldTaxed,
          levelsGained,
          ...(V2_CORE_LOOP_V2 ? { spMilestonesGained } : {}),
          statGains,
          hpGained,
          mpGained,
          drops,
          droppedEquipments,
          droppedUniques,
          rareMapDrops,
          rareMapRunsLeft,
          stoppedReason,
          finalHpAfter,
          finalMaxHp,
          finalMpAfter,
          finalGoldAfter,
          finalMaxDepth,
          expAfter,
          maxExpAfter,
          hpCharges,
          mpCharges,
          playerMaxMp,
          replays,
          ejected,
        },
      },
    };
  });

  // 전체 소식 — 유니크 장비 드랍 broadcast. tx 커밋 후 side-effect 로 호출(중첩 트랜잭션
  // 회피 — guild-lodge 데드락 교훈). insertFeedEntry 가 opt-out/디바운스/실패삼킴을 자체
  // 처리하므로 응답엔 영향 없음. droppedUnique 는 승리 성공 응답 body 에만 존재.
  const resultBody = result.body as {
    result?: {
      droppedUnique?: V2EquipmentId | null;
      rareMapDrop?: RareMapKindId | null;
      goldTaxed?: number;
      taxOwnerLabel?: string;
    };
    batch?: {
      droppedUniques?: V2EquipmentId[];
      rareMapDrops?: RareMapKindId[];
      totalGoldTaxed?: number;
      taxOwnerLabel?: string;
    };
  };
  const uniqueIds = resultBody.batch
    ? (resultBody.batch.droppedUniques ?? [])
    : resultBody.result?.droppedUnique
      ? [resultBody.result.droppedUnique]
      : [];
  for (const itemId of uniqueIds) {
    await insertFeedEntry(userId, "unique_drop", { itemId });
  }
  // 레어맵 발견 — 유니크보다 희귀한 사건이라 동급으로 전체 소식에. (디바운스/opt-out 은
  // insertFeedEntry 가 자체 처리 — 일괄에서 2장 떠도 60s 디바운스로 1건만 나간다.)
  const rareMapKinds = resultBody.batch
    ? (resultBody.batch.rareMapDrops ?? [])
    : resultBody.result?.rareMapDrop
      ? [resultBody.result.rareMapDrop]
      : [];
  for (const kind of rareMapKinds) {
    await insertFeedEntry(userId, "rare_map_drop", { kind });
  }

  // 세금 수취자 라벨 — 결과에 세금이 있을 때만 1회 해석해 응답에 붙인다(일괄도 거점은
  // 요청 내내 동일하므로 1회면 충분). tx 밖 비잠금 read 라 직후 점령 변동과 어긋날 수
  // 있으나 표기 전용이라 허용. 실패해도 사냥 응답엔 영향 없어야 하므로 삼킨다.
  const taxedTotal = resultBody.batch
    ? (resultBody.batch.totalGoldTaxed ?? 0)
    : (resultBody.result?.goldTaxed ?? 0);
  if (outpostId && taxedTotal > 0) {
    try {
      const label = await resolveTaxOwnerLabel(outpostId);
      if (resultBody.batch) resultBody.batch.taxOwnerLabel = label;
      else if (resultBody.result) resultBody.result.taxOwnerLabel = label;
    } catch (err) {
      console.warn("[hunt] tax owner label resolve failed", err);
    }
  }

  return Response.json(result.body, { status: result.status });
}
