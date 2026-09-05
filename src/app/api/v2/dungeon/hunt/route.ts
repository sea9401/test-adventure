import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordGrowthLeapStaminaSpendInTx } from "@/lib/server/growthLeapProgress";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { battleCountOf } from "@/lib/server/battleCount";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { readGuildCombatSupplyBonuses } from "@/lib/server/guildCombatSupply";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { applyExpGain, requiredExpToNext } from "@/lib/leveling";
import {
  applyPctBonus,
  bonusDelta,
  readActiveHotTime,
} from "@/lib/server/opsSettings";

// BattleScene replay UI 의 EXP 바 max — 이미 만렙이면 분모로 쓸 값 없음.
// EXP 바 안 보이게 0 으로 fallback (현재 exp 와 동일 → pct 0).
function requiredExpToNextNullable(level: number): number | null {
  return requiredExpToNext(level);
}
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  enemiesForDepth,
  isHuntStageDepth,
  latestUnlockedHuntStageDepth,
  nextHuntStageDepth,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import { scaleMonsterForHunt } from "@/adventure/data/v2/monsterScale";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { applyGuildCombatRewardBonus } from "@/adventure/data/v2/guildCombatSupply";
import {
  RARE_MAP_KINDS,
  parseRareMaps,
  type RareMapInstance,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import { GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH } from "@/adventure/data/v2/guildExploration";
import {
  HUNT_COST,
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  tryConsume,
} from "@/adventure/v2/stamina";
import {
  V2_CORE_LOOP_V2,
  V2_UNEXPLORED,
  HUNT_COOLDOWN_MODE,
  HUNT_COOLDOWN_MS,
  V2_EQUIPMENT_LIBERATION,
  combatCooldownRemainingMs,
} from "@/adventure/data/v2/coreLoopConfig";
import { parseUnexploredSave } from "@/adventure/data/v2/unexploredState";
import {
  EXPLORATION_XP_PER_HUNT_WIN,
  grantExplorationXp,
} from "@/adventure/data/v2/unexploredProgression";
import {
  EMPTY_LIBERATION_HUNT_SNAPSHOT,
  deriveLiberationHuntSnapshot,
  type LiberationHuntSnapshot,
} from "@/adventure/data/v2/equipmentLiberationEffects";
import {
  applyHpRegen,
  canHuntWithHp,
  parseHpRegenSince,
} from "@/adventure/v2/hpRegen";
import { mergeDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
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
import { deferLongBattleReplays } from "@/lib/server/battleReplayStore";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  parseEjectedFrom,
  type EjectedFrom,
  type LastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import type { DungeonEnemy, DungeonFloorId } from "@/adventure/data/v2/types";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  enforceUserAndIpRateLimit,
} from "@/lib/server/userRateLimit";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
} from "@/lib/server/codexMasteryGameplay";
import { referralHuntTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import { rollHuntDropsRepeated } from "./huntDrops";
import {
  buildUnexploredRewardPlan,
  rollUnexploredHuntRewards,
  UNEXPLORED_REGULAR_EQUIPMENT_DROP_MULTIPLIER,
  type UnexploredHuntRewardResult,
} from "@/adventure/data/v2/unexploredHuntRewards";
import {
  applyUnexploredHuntProgress,
  mintUnexploredRewardEquipment,
  prepareUnexploredHunt,
  type PreparedUnexploredHunt,
} from "@/lib/server/unexploredHunt";
import { computeLossTax } from "./huntTax";
import {
  applyLiberationPostHuntRestore,
  applyChargeRestore,
  computeBattleRewards,
  multiplyHuntReward,
  potionTargetAmount,
  rareMapRewardRolls,
} from "./huntRewards";
import { updateRareMaps } from "./huntRareMaps";
import {
  applyHuntAdventureProgress,
  recordMonsterKill,
  type AdventureLogSave,
} from "./huntKillLog";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { applyHuntProficiency } from "./huntProficiency";
import { normalizedHuntLocationIds } from "./huntLocations";
import { broadcastHuntUniqueDrops, huntEquipmentCodexEvents } from "./huntResultEffects";
import { activeCookingBuff } from "@/adventure/v2/cooking/food";
import {
  getAutoHuntStopReason,
  type AutoHuntStopReason,
} from "@/adventure/v2/autoHuntStopPolicy";
import {
  authoritativeCatalogOutpostId,
  authoritativeTileOutpostId,
  type HuntCharacterSave as CharSave,
} from "./huntCharacter";
import {
  HUNT_DROP_FLOOR_CAP,
  parseHuntRequestIntent,
} from "./huntRequestIntent";
import {
  flushHuntSaves,
  preloadHuntSaves,
  type HuntBatchState,
  type HuntInventorySave as InventorySave,
  type HuntOccupationRow as OccupationRow,
  type HuntTransaction as HuntTx,
} from "./huntBatchState";

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
// 온라인 자동 사냥은 1.5초 간격(분당 약 40회)으로 요청한다. 네트워크 지연 뒤 재시도나
// 수동 입력이 섞여도 정상 루프가 끊기지 않도록 전투 API 운영 권장 범위의 상한을 사용한다.
// IP 제한은 이동통신사 CGNAT·PC방처럼 다수가 한 공인 IP를 공유하는 환경을 고려해
// 사용자 제한의 30배로 두되, 계정별 제한과 아래 in-flight 게이트는 그대로 적용한다.
const HUNT_USER_RATE_LIMIT_PER_MINUTE = 180;
const HUNT_IP_RATE_LIMIT_PER_MINUTE =
  HUNT_USER_RATE_LIMIT_PER_MINUTE * 30;

// 같은 사용자의 사냥 요청이 이미 처리 중이면 DB 트랜잭션에 진입시키지 않는다. character.v2
// FOR UPDATE도 보상 중복은 막지만, 순간적인 병렬 요청은 커넥션/트랜잭션 대기열을 만들 수 있어
// 단일 프로세스인 현재 운영 환경에서는 이 가벼운 선행 게이트로 먼저 잘라낸다. 다중 인스턴스로
// 확장할 때는 같은 인터페이스를 Redis 기반 분산 잠금으로 교체해야 한다.
const huntInFlightUsers = new Set<string>();

function huntInFlightResponse() {
  return Response.json(
    { ok: false, error: "request_in_flight", retryAfterSec: 1 },
    { status: 429, headers: { "Retry-After": "1" } },
  );
}

// 통합 테스트 격리용. 실제 요청에서는 POST의 finally가 항상 해제한다.
export function resetHuntInFlightForTests() {
  huntInFlightUsers.clear();
}

function pickRandomEnemy(
  enemies: readonly DungeonEnemy[],
): DungeonEnemy | null {
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

export type RunOneHuntCtx = {
  tx: HuntTx;
  userId: string;
  depth: number;
  dropFloor: DungeonFloorId;
  // 온라인 요청에서는 character.v2에서 미리 읽은 서버 권위 위치. 클라이언트 body 값이 아니다.
  // null = 아직 방문 거점 없음. 오프라인 정산은 기존 의미를 보존해 null을 넘긴다.
  outpostId: string | null;
  // undefined = 오프라인 정산의 기존 경로(잠근 character.tilePos에서 뒤늦게 판정).
  // 온라인은 null|string을 반드시 넘기고 character lock 뒤 동일 위치인지 재검증한다.
  tileOutpostId?: string | null;
  // 레어맵 입장 — 보유 지도 iid. 검증(소유·깊이 일치·잔여 판수)은 save lock 후.
  rareMapIid: string | null;
  mode?: "normal" | "unexplored";
  // 전투 전·후 HP 충전약이 채울 목표 체력 비율. 미지정은 기존 동작인 100%.
  hpPotionTargetPct?: number;
  // 전투 후 MP 충전약이 채울 목표 마나 비율. 미지정은 기존 동작인 100%.
  mpPotionTargetPct?: number;
  // 오프라인 정산 모드 — 전투 쿨다운 게이트·per-battle lastBattleAt 기록을 건너뛴다(정산
  //   루프가 마지막에 한 번 lastBattleAt=realNow 기록). 패배 페널티/HP/포션/레벨업은 그대로 적용.
  offline?: boolean;
  // 시각 주입(오프라인) — 판별 HP 회복 시각을 lastBattleAt+i×쿨다운 으로 시뮬(5초 간격 회복).
  //   미지정 = Date.now()(온라인).
  nowOverride?: number;
  // 온라인 일괄 사냥 전용. 첫 판이 잡은 row lock과 최신 save 상태를 같은 tx의 다음 판에서 재사용한다.
  batchState?: HuntBatchState;
  // 온라인 일괄·오프라인 정산 전용. 판별 이벤트를 모아 같은 tx에서 한 번에 기록한다.
  // 미지정인 단판은 해당 판이 끝날 때 즉시 기록한다.
  codexMasteryEvents?: CodexMasteryGameplayEvent[];
  // 사냥/정산 시작 장비로 만든 불변 효과. 오프라인 반복은 최초 한 번 만든 값을 전달한다.
  liberationSnapshot?: LiberationHuntSnapshot;
};

// 한 번의 사냥 — 기존 단판 로직 그대로(트랜잭션 클로저 tx 사용). 일괄 모드는 이 함수를
//   루프로 N회 호출하며 첫 판이 잠근 save의 최신 상태를 batchState로 다음 판에 이월한다.
//   fullReplay=true 면 BattleScene 용 log 를 보존한다. 온라인 단판/5·10·50회 사냥은 기록 확인이
//   필요하므로 full, 오프라인 정산은 결과 집계만 쓰므로 lite 로 둔다.
export async function runOneHunt(fullReplay: boolean, ctx: RunOneHuntCtx) {
  const {
    tx,
    userId,
    depth: requestedDepth,
    dropFloor: requestedDropFloor,
    outpostId,
    tileOutpostId: lockedTileOutpostId,
    rareMapIid,
  } = ctx;
  const unexploredMode = ctx.mode === "unexplored";
  let depth = requestedDepth;
  const dropFloor = unexploredMode
    ? HUNT_DROP_FLOOR_CAP
    : requestedDropFloor;
  // === 1. outpost 점령 조회 (FOR SHARE) ===
  // v2 의 lock 순서 통일: outpost FOR SHARE → getGuildId → character.v2.
  // FOR SHARE 로 정책 게이트를 일관된 스냅샷에서 평가한다. 점령자가 hunt 도중 정책을
  // 바꿔도 이 hunt 는 진입 시점 정책으로 일관. 공유 잠금은 사냥끼리는
  // 서로 막지 않아 같은 거점의 모든 이용자가 하나씩 직렬 처리되던 병목을 제거한다.
  const occupationById =
    ctx.batchState?.occupationById ?? new Map<string, OccupationRow>();
  const locationIds = normalizedHuntLocationIds(
    unexploredMode ? null : outpostId,
    unexploredMode ? null : (lockedTileOutpostId ?? null),
  );
  // 후보가 둘(카탈로그 거점+자유 타일)이어도 id 정렬 순으로 잠가 동시 사냥 간 교착을 막는다.
  if (!ctx.batchState?.occupationById && locationIds.length > 0) {
    const rows = await tx
      .select({
        outpostId: outpostOccupations.outpostId,
        occupiedByGuildId: outpostOccupations.occupiedByGuildId,
        policy: outpostOccupations.policy,
      })
      .from(outpostOccupations)
      .where(inArray(outpostOccupations.outpostId, locationIds))
      .orderBy(outpostOccupations.outpostId)
      .for("share");
    for (const row of rows) {
      occupationById.set(row.outpostId, row);
    }
    if (ctx.batchState) ctx.batchState.occupationById = occupationById;
  }
  // 자유 타일은 길드 점령행이 실제로 있을 때만 카탈로그 거점보다 우선한다.
  // 빈 칸/개인 개척지는 현재 카탈로그 거점의 입장 정책을 따른다.
  const lockedTileOccupation = lockedTileOutpostId
    ? (occupationById.get(lockedTileOutpostId) ?? null)
    : null;
  const useLockedTileOccupation =
    lockedTileOccupation?.occupiedByGuildId != null;
  const occRow = useLockedTileOccupation
    ? lockedTileOccupation
    : outpostId
      ? (occupationById.get(outpostId) ?? null)
      : null;

  // === 2. 사냥자 길드 확인 (정책 게이트 판정용) ===
  const viewerGuildId =
    ctx.batchState?.viewerGuildId !== undefined
      ? ctx.batchState.viewerGuildId
      : await getGuildId(tx, userId);
  const guildCombatSupply =
    ctx.batchState?.guildCombatSupply ??
    (await readGuildCombatSupplyBonuses(
      tx, viewerGuildId, new Date(ctx.nowOverride ?? Date.now()),
    ));
  if (ctx.batchState) {
    ctx.batchState.viewerGuildId = viewerGuildId;
    ctx.batchState.guildCombatSupply = guildCombatSupply;
  }

  // === 3. 정책 게이트 — 거부 시 즉시 403, stamina 차감/character.v2 lock 전. ===
  if (!unexploredMode && occRow) {
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

  // === 4. character.v2 lock ===
  const charSave =
    ctx.batchState?.charSave ??
    (await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {}));
  if (ctx.batchState) ctx.batchState.charSave = charSave;

  // 위치를 미리 읽은 뒤 outpost 행을 먼저 잠그는 동안 이동 요청이 끼어들 수 있다.
  // character 행 잠금까지 얻은 시점에 같은 위치인지 재검증해, 다른 거점의 입장 정책으로
  // 사냥이 커밋되는 TOCTOU를 차단한다. undefined는 내부 오프라인 정산의 기존 경로다.
  if (!unexploredMode && lockedTileOutpostId !== undefined) {
    const currentOutpostId = authoritativeCatalogOutpostId(charSave);
    const currentTileOutpostId = authoritativeTileOutpostId(charSave);
    if (
      currentOutpostId !== outpostId ||
      currentTileOutpostId !== lockedTileOutpostId
    ) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "location_changed" as const,
        },
      };
    }
  }

  if (ctx.batchState) {
    await preloadHuntSaves(tx, userId, ctx.batchState);
  }

  let unexploredHunt: PreparedUnexploredHunt | null = null;
  if (unexploredMode) {
    const prepared = prepareUnexploredHunt(charSave, Math.random);
    if (!prepared.ok) {
      return {
        ok: false as const,
        status: 409,
        body: { ok: false as const, error: prepared.error },
      };
    }
    unexploredHunt = prepared;
    depth = prepared.difficulty;
  }

  // equipment.v2 조기 잠금 (드랍/굴림 한 번에 기록). lock 순서 char→equipment.
  const equipmentSave =
    ctx.batchState?.equipmentSave ??
    (await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    ));
  if (ctx.batchState) ctx.batchState.equipmentSave = equipmentSave;
  const { owned: ownedEquip, equipped: equippedEquip } =
    parseEquipmentSave(equipmentSave);
  const liberationSnapshot =
    ctx.liberationSnapshot ??
    ctx.batchState?.liberationSnapshot ??
    (V2_EQUIPMENT_LIBERATION
      ? deriveLiberationHuntSnapshot(equipmentSave)
      : EMPTY_LIBERATION_HUNT_SNAPSHOT);
  if (ctx.batchState && !ctx.batchState.liberationSnapshot) {
    ctx.batchState.liberationSnapshot = liberationSnapshot;
  }

  // 프론티어 단계 게이트(수동 푸시) — 일반 사냥은 테마당 입구·심부·최심부의 대표 깊이
  // (2·4·6)만 허용한다. 희귀 지도는 레거시 깊이를 보존하므로 이 제한을 건너뛴다.
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(charSave.frontierDepth) || 2),
  );
  if (!unexploredMode && !rareMapIid && !isHuntStageDepth(depth)) {
    return {
      ok: false as const,
      status: 400,
      body: {
        ok: false as const,
        error: "hunt_stage_only" as const,
        maxDepth: Math.min(frontierDepth, MAX_FRONTIER_DEPTH),
      },
    };
  }
  // 프론티어 끝 게이트 — 마지막 테마(MAX_FRONTIER_DEPTH) 너머는 콘텐츠 없음(새 테마 추가 전까지).
  if (!unexploredMode && depth > MAX_FRONTIER_DEPTH) {
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
  // 일반 사냥은 정복한 대표 단계 또는 바로 다음 대표 단계만 허용한다. 희귀 지도는 기존
  // 최고도달+1 규칙을 유지하고, 아래 소유·깊이 일치 검증까지 통과해야 한다.
  const nextStageDepth = nextHuntStageDepth(frontierDepth);
  const depthLocked = rareMapIid
    ? depth > frontierDepth + 1
    : depth > frontierDepth && depth !== nextStageDepth;
  if (!unexploredMode && depthLocked) {
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
    // utility 계열(비밀 상점/개명)은 사냥 입장 불가 — 전용 화면에서 사용.
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
  const staminaConfig = staminaConfigForCharacter(charSave, now);
  const staminaMax = staminaConfig.max;
  // 쿨다운 모드 — 스태미나 폐지·전투 쿨다운(마지막 전투 후 HUNT_COOLDOWN_MS 경과해야 다음 판).
  //   V1식 한판한판 throttle. 그 외(스태미나 모드·코어루프 off) — 스태미나 차감. afterStamina 는
  //   쿨다운 모드일 때 회복만(스태미나 미사용이라 표시·한계의 비약 보존용).
  let afterStamina = applyRegen(
    stamina,
    now,
    staminaMax,
    staminaConfig.regenBonusPct,
  );
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
    const after = tryConsume(
      stamina,
      HUNT_COST,
      now,
      staminaMax,
      staminaConfig.regenBonusPct,
    );
    if (!after) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          stamina: applyRegen(
            stamina,
            now,
            staminaMax,
            staminaConfig.regenBonusPct,
          ),
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
    cache: ctx.batchState?.actor,
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
  const { player, skills: v2Skills, proficiencyRaw } = preparedActor;

  // 적 선택만 모드화한다. 일반 사냥은 기존 깊이 카탈로그와 스케일을 그대로 쓰고,
  // 미개척지는 잠긴 character.v2의 탐사 노드에서 이미 확정한 한 개체를 사용한다.
  let enemyKey: string;
  let enemyName: string;
  let enemyMonster: import("@/adventure/data/monsters/types").Monster;
  if (unexploredHunt) {
    enemyKey = unexploredHunt.runtime.monsterId;
    enemyName = unexploredHunt.runtime.monster.name;
    enemyMonster = unexploredHunt.runtime.monster;
  } else {
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
    enemyKey = enemy.key;
    enemyName = enemy.name;
    const scaledEnemy = scaleMonsterForHunt(baseMonster, depth);
    const seededMonsterSkills = [enemy.statusSkill, enemy.castSkill].filter(
      (skill): skill is NonNullable<typeof skill> => skill != null,
    );
    enemyMonster = {
      ...scaledEnemy,
      name: enemyName,
      image: enemy.image ?? baseMonster.image,
      element: "neutral",
      ...(seededMonsterSkills.length
        ? {
            v2Skills: {
              learned: seededMonsterSkills,
              equipped: seededMonsterSkills,
            },
          }
        : {}),
    };
  }
  // 전투 로그에 박을 캐릭 이름 — character-profile.v2 의 name. 없으면 "모험가".
  let playerName = ctx.batchState?.playerName;
  if (playerName === undefined) {
    const profile = await readSave<{ name?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    playerName = profile?.name?.trim() || "모험가";
    if (ctx.batchState) ctx.batchState.playerName = playerName;
  }

  // 사냥 전 hp 회복 — 마지막 사냥 이후 흐른 시간만큼 충전.
  const hpBefore = parseHpRegenSince(charSave.hpRegenSince, now);
  const regenResult = applyHpRegen(
    Math.max(0, charSave.hp ?? player.maxHp),
    player.maxHp,
    hpBefore,
    now,
  );

  const invSave =
    ctx.batchState?.inventorySave ??
    (await lockSaveForUpdate<InventorySave>(
      tx,
      userId,
      "inventory.v2",
      {},
    ));
  if (ctx.batchState) ctx.batchState.inventorySave = invSave;
  let hpCharges = Math.max(0, invSave.hpCharges ?? 0);
  let mpCharges = Math.max(0, invSave.mpCharges ?? 0);

  let startPlayerHp = regenResult.hp;
  let usedPreBattleHpCharge = false;
  if (!canHuntWithHp(startPlayerHp, player.maxHp) && hpCharges > 0) {
    const targetHp = potionTargetAmount(
      player.maxHp,
      ctx.hpPotionTargetPct,
    );
    const restore = Math.min(
      Math.max(0, targetHp - startPlayerHp),
      hpCharges,
    );
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
  };

  // 체력 부족(최대치 5% 미만) 상태에선 사냥 불가 — 스태미나 미소모 + hpRegenSince 미리셋으로
  // 회복 대기. 0 에서 시간 재생이 0→1 을 금방 넘겨 doomed 전투가 새던 문제를 안정적으로 차단.
  // 시간 경과(또는 치료소)로 회복되면 다시 사냥 가능. 일괄사냥의 death-stop 가드와 같은 의도.
  if (!canHuntWithHp(startPlayerHp, player.maxHp)) {
    if (usedPreBattleHpCharge) {
      const nextRecoveryCharacter: CharSave = {
        ...charSave,
        hp: startPlayerHp,
        hpRegenSince: now,
      };
      const nextInventory = {
        ...invSave,
        hpCharges,
        mpCharges,
      };
      if (ctx.batchState) {
        ctx.batchState.charSave = nextRecoveryCharacter;
        ctx.batchState.inventorySave = nextInventory;
        ctx.batchState.charSaveDirty = true;
        ctx.batchState.inventorySaveDirty = true;
      } else {
        await upsertSave(tx, userId, "character.v2", nextRecoveryCharacter);
        await upsertSave(tx, userId, "inventory.v2", nextInventory);
      }
    }
    return {
      ok: false as const,
      status: 409,
      body: {
        ok: false as const,
        error: "hp_zero" as const,
        stamina: applyRegen(
          stamina,
          now,
          staminaMax,
          staminaConfig.regenBonusPct,
        ),
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
  const timedOut = battleResult.endReason === "timeout";
  // 희귀 탐사는 실제 전투를 한 번만 해결하고, 승리 뒤 저장된 runsLeft만큼 기존 보상을
  // 독립 정산한다. 패배/일반 사냥은 항상 1회다.
  const rewardRolls = rareMapRewardRolls(activeRareMap, won);
  const curLevel = Math.max(1, charSave.level ?? 1);
  // 신참 보너스 판정용 누적 전투 전적 — adventure-log.v2 의 monster kills 합 + 패배수.
  // v2 는 재전직이 레벨을 1 로 리셋하므로 레벨이 아닌 전적으로 신참을 가린다(베테랑이
  // 재전직할 때마다 보너스가 잘못 되살아나는 것 방지). read-only 스냅샷(게이트용)이라
  // 비잠금 — 권위적 kill 증가는 아래 lock 구간(adventure-log.v2)에서 한다.
  const logVal = ctx.batchState
    ? (ctx.batchState.adventureLog ??=
        await lockSaveForUpdate<AdventureLogSave>(
          tx,
          userId,
          "adventure-log.v2",
          {},
        ))
    : await readSave<unknown>(tx, userId, "adventure-log.v2", null);
  const battleCount = battleCountOf(logVal);
  // EXP = monster.exp → 신참 보너스(전적 ≤ 3만 ×2, EXP 전용) → 전역 배율(staging 기본
  // 2.2/IS_STAGING, 라이브 1.0). 라이브 battleClaim 과 같은 순서(newbie 먼저, 그 다음 배율).
  const baseRewards = computeBattleRewards({
    won,
    enemyMonster,
    battleCount,
    mapExpMult,
    mapGoldMult,
    liberationExpPct: liberationSnapshot.effects.expPct,
    liberationGoldPct: liberationSnapshot.effects.goldPct,
  });
  const hotTime =
    ctx.batchState?.hotTime ?? (await readActiveHotTime(now, tx));
  if (ctx.batchState) ctx.batchState.hotTime = hotTime;
  const expAfterGuild = applyGuildCombatRewardBonus(
    baseRewards.expGained,
    guildCombatSupply.expPct,
  );
  const goldAfterGuild = applyGuildCombatRewardBonus(
    baseRewards.goldGross,
    guildCombatSupply.goldPct,
  );
  const expBeforeDining = hotTime.active
    ? applyPctBonus(expAfterGuild, hotTime.bonuses.expPct)
    : expAfterGuild;
  const foodBuff = activeCookingBuff(charSave.activeFoodBuff, now);
  const foodExpPct = foodBuff?.effect.huntExpPct ?? 0;
  const expAfterFood = foodBuff && foodExpPct > 0 ? applyPctBonus(expBeforeDining, foodExpPct) : expBeforeDining;
  let diningExpBonus = 0;
  for (let i = 0; i < rewardRolls; i += 1) {
    const diningExp = await consumeGuildDiningEffect(
      tx,
      userId,
      "hunt_exp",
      expAfterFood,
      new Date(now),
      ctx.batchState?.dining,
    );
    diningExpBonus += diningExp.bonus;
  }
  const expGained =
    multiplyHuntReward(expAfterFood, rewardRolls) + diningExpBonus;
  const goldBeforeFood = hotTime.active ? applyPctBonus(goldAfterGuild, hotTime.bonuses.goldPct) : goldAfterGuild;
  const foodGoldPct = foodBuff?.effect.huntGoldPct ?? 0;
  const goldGrossPerRoll = foodBuff && foodGoldPct > 0 ? applyPctBonus(goldBeforeFood, foodGoldPct) : goldBeforeFood;
  let goldGross = multiplyHuntReward(goldGrossPerRoll, rewardRolls);
  const hotTimeExpBonus = multiplyHuntReward(
    bonusDelta(expAfterGuild, expBeforeDining),
    rewardRolls,
  );
  const foodExpBonus = multiplyHuntReward(
    bonusDelta(expBeforeDining, expAfterFood),
    rewardRolls,
  );
  const hotTimeGoldBonus = multiplyHuntReward(
    bonusDelta(goldAfterGuild, goldBeforeFood),
    rewardRolls,
  );
  const foodGoldBonus = multiplyHuntReward(
    bonusDelta(goldBeforeFood, goldGrossPerRoll),
    rewardRolls,
  );
  // 드랍 굴림 — 승리 시 재료/강화석/소환서/재련석/정착지 재료 + 정규/유니크 장비를 한 번에
  //   굴린다(순수 RNG 헬퍼·huntDrops). 영속(materials merge·equipment.v2 기록)은 아래 라우트가.
  const commonDropResult = rollHuntDropsRepeated({
    won,
    dropFloor,
    depth: unexploredHunt ? MAX_FRONTIER_DEPTH : depth,
    monsterKey: enemyKey,
    ownedEquip,
    mapDropMult,
    mapUniqueMult,
    mapStoneMult,
    regularEquipmentChanceMult: unexploredHunt
      ? UNEXPLORED_REGULAR_EQUIPMENT_DROP_MULTIPLIER
      : 1,
    liberationHuntEffects: liberationSnapshot.effects,
    rewardRolls,
  });
  let drops = commonDropResult.drops;
  let droppedEquipments = commonDropResult.droppedEquipments;
  let droppedUniques = commonDropResult.droppedUniques;
  let nextOwned = commonDropResult.nextOwned;
  let unexploredRewards: UnexploredHuntRewardResult | null = null;
  let unexploredQualityBonusPct = 0;
  if (won && unexploredHunt) {
    const rewardPlan = buildUnexploredRewardPlan(
      unexploredHunt.runtime,
      unexploredHunt.effects,
    );
    unexploredQualityBonusPct = rewardPlan.commonBonusPct.quality;
    unexploredRewards = rollUnexploredHuntRewards(rewardPlan, Math.random, {
      common: {
        gold: goldGross,
        drops,
        droppedEquipments,
        droppedUniques,
      },
      existingTraces: unexploredHunt.save.traces,
    });
    goldGross = unexploredRewards.gold;
    drops = unexploredRewards.drops;
    droppedEquipments = unexploredRewards.droppedEquipments;
    droppedUniques = unexploredRewards.droppedUniques;
    // 공용 굴림이 만든 미저장 개체 대신 최종 보상 ID만 새로 발급한다. 감산형 노드로
    // 제거된 장비는 저장되지 않고, 추가 굴림 복사본은 서로 다른 iid/옵션을 갖는다.
    nextOwned = [
      ...ownedEquip,
      ...[...droppedEquipments, ...droppedUniques].map((id) =>
        mintUnexploredRewardEquipment(
          id,
          unexploredQualityBonusPct,
          Math.random,
        ),
      ),
    ];
  }
  // 구버전 단판 응답 소비자 호환. 압축 결과 전체는 아래 plural 필드로 함께 보낸다.
  const droppedEquipment = droppedEquipments[0] ?? null;
  const droppedUnique = droppedUniques[0] ?? null;
  const nextMaterials = mergeDrops(charSave.materials, drops);
  // equipment.v2 한 번에 기록 — owned(+드랍 개체). 굴림은 개체에 포함. 조기 lock 한 걸 한 번에 기록.
  const nextEquipment: EquipmentSave = {
    owned: nextOwned,
    equipped: equippedEquip,
  };
  if (ctx.batchState) {
    ctx.batchState.equipmentSave = nextEquipment;
    ctx.batchState.equipmentSaveDirty = true;
  } else {
    await upsertSave(tx, userId, "equipment.v2", nextEquipment);
  }

  // 영지 시스템 은퇴에 맞춰 거점·타일 점령 여부와 관계없이 사냥세를 부과하지 않는다.
  // 응답 필드는 구버전 클라이언트 호환을 위해 0으로 유지한다.
  const goldTaxed = 0;
  const goldNet = goldGross;

  // 코어루프 패배 페널티 — 마지막 패배 이후 번 골드(atRiskGold)를 승리마다 누적, 일반 패배 시 그
  //   절반(보유 한도 클램프)을 소실하고 0 리셋. 시간초과는 무승부성 패배라 소실·리셋하지 않는다.
  //   off = lossTax 0·atRiskGold 미기록(byte-identical). 소실 골드는 어디에도 입금하지 않는다.
  const { lossTax, nextAtRisk } = computeLossTax({
    won,
    timedOut,
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
  const explorationGrant =
    V2_UNEXPLORED && won && expResult.level >= 100
      ? unexploredHunt
        ? (() => {
            const progress = applyUnexploredHuntProgress({
              rawSave: charSave.unexplored,
              won,
              specialMonsterKilled:
                unexploredHunt.runtime.kind === "special",
              traces:
                unexploredRewards?.traces ?? unexploredHunt.save.traces,
            });
            return {
              save: progress.save,
              acceptedXp: progress.xpGained,
              pointsGained: progress.pointsGained,
            };
          })()
        : grantExplorationXp(
            parseUnexploredSave(charSave.unexplored),
            EXPLORATION_XP_PER_HUNT_WIN,
          )
      : null;

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

  ({ afterHp, afterMp } = applyLiberationPostHuntRestore({
    won,
    afterHp,
    afterMp,
    maxHp: player.maxHp,
    maxMp,
    hpPct: liberationSnapshot.postHuntHpRestorePct,
    mpPct: liberationSnapshot.postHuntMpRestorePct,
  }));

  // 충전식 회복약 소모 — 전투 후 HP/MP 부족분을 보유 충전량으로 채운다(순수 헬퍼·huntRewards).
  ({ afterHp, afterMp, hpCharges, mpCharges } = applyChargeRestore({
    afterHp,
    afterMp,
    maxHp: player.maxHp,
    maxMp,
    hpCharges,
    mpCharges,
    hpTargetPct: ctx.hpPotionTargetPct,
    mpTargetPct: ctx.mpPotionTargetPct,
  }));
  const nextInventory: InventorySave = {
    ...invSave,
    hpCharges,
    mpCharges,
  };
  if (ctx.batchState) {
    ctx.batchState.inventorySave = nextInventory;
    ctx.batchState.inventorySaveDirty = true;
  } else {
    await upsertSave(tx, userId, "inventory.v2", nextInventory);
  }

  // 침입자 트래킹 — 사냥 성공 시 lastHuntedOutpost 갱신 (outpost 사냥에 한해).
  // 패배해도 거점에서 사냥 시도는 한 셈이라 트래킹. 미점령 거점도 트래킹 X 의미 없으므로
  // outpostId 가 있을 때만.
  const nextLastHunted: LastHuntedOutpost | undefined = !unexploredMode && outpostId
    ? { outpostId, at: now }
    : undefined;

  // ejectedFrom 은 직전 사냥 응답 1회용 — 이 응답에 surface 후 키 자체 제거.
  // (undefined 박는 대신 destructure 로 명시적 제거 — JSON 직렬화 동작 의존 제거)
  const ejectedNotice: EjectedFrom | null = parseEjectedFrom(
    charSave.ejectedFrom,
  );
  const { ejectedFrom: _dropEjected, ...charSaveWithoutEject } = charSave;
  void _dropEjected;

  // === 레어맵 갱신 — 희귀 탐사 입장 중이면 소모, 아니면 승리 시 신규 드랍 롤. ===
  // 미개척지 발견 지도는 해당 난이도(95+)로 만들면 일반 희귀 탐사에 입장할 수 없으므로
  // 캐릭터가 정복한 일반 사냥 최고 대표 단계로 저장한다.
  // ⚠️ 반드시 next 빌드 전에 적용 — character.v2 저장(아래 upsertSave)에 rareMaps 가
  //   포함되므로. 과거엔 이 블록이 save 뒤에 있어 판수 차감·신규 드랍이 영속되지 않았다.
  const rareMapDiscoveryDepth = unexploredMode
    ? latestUnlockedHuntStageDepth(frontierDepth)
    : depth;
  const rareMapUpdate = updateRareMaps({
    activeRareMap,
    rareMaps,
    won,
    depth: rareMapDiscoveryDepth,
    now,
    rareMapDropChanceMult:
      1 + liberationSnapshot.effects.rareMapAndSummonScrollDropPct / 100,
  });
  rareMaps = rareMapUpdate.rareMaps;
  const rareMapDrop = rareMapUpdate.rareMapDrop;
  const rareMapDropInstance = rareMapUpdate.rareMapDropInstance;
  const rareMapRunsLeft = rareMapUpdate.rareMapRunsLeft;

  const next = {
    ...charSaveWithoutEject,
    stamina: afterStamina,
    hp: afterHp,
    mp: afterMp,
    hpRegenSince: now,
    level: expResult.level,
    exp: expResult.exp,
    ...(explorationGrant ? { unexplored: explorationGrant.save } : {}),
    gold: newGold,
    materials: nextMaterials,
    rareMaps,
    // 튜토리얼 — 인벤토리에서 장비를 직접 바꾼 뒤 온라인 사냥을 한 번 완료했는지 기록한다.
    // 오프라인 정산은 사용자가 전투 화면에서 조작한 것이 아니므로 첫 완료 신호로 세지 않는다.
    ...(!ctx.offline && charSave.hasManuallyEquippedGear === true
      ? { hasBattledAfterEquippingGear: true }
      : {}),
    // 프론티어 수동 푸시 — 최고도달+1 깊이를 이기면 해금(+1). 패배·기존깊이면 유지. MAX 캡으로
    //   정규화(레거시 무한기 >42 저장값도 현재 콘텐츠 끝 42 로 수렴 → 새 테마 추가 시 그 지점부터 재공략).
    frontierDepth: unexploredMode
      ? Math.min(frontierDepth, MAX_FRONTIER_DEPTH)
      : Math.min(
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
    ...(HUNT_COOLDOWN_MODE && !ctx.offline && !rareMapIid && !unexploredMode
      ? { lastHuntDepth: depth }
      : {}),
  };
  if (ctx.batchState) {
    ctx.batchState.charSave = next;
    ctx.batchState.charSaveDirty = true;
  } else {
    await upsertSave(tx, userId, "character.v2", next);
  }

  // 홍보 보상은 가입이 아니라 서버 권위 프론티어 진행으로만 지급한다. 프론티어가
  // 갱신될 때 확인하고, conversion row lock으로 일괄 사냥/중복 요청도 멱등 처리한다.
  let referralRewardEarned = false;
  if (won && next.frontierDepth > frontierDepth) {
    const referralReward = await rewardReferralTutorialTasks(
      tx,
      userId,
      playerName,
      referralHuntTaskIds(next.frontierDepth),
    );
    referralRewardEarned = referralReward.staminaPotions > 0;
  }

  // 전투수 랭킹용 몬스터 킬 카운터 — huntKillLog(콜로케이트) 로 추출.
  // lock 순서: character.v2 다음 → proficiency.v2 앞(일관 순서, 데드락 회피)은 이 위치가 보장.
  if (won) {
    const uniqueEquipment = droppedUniques.length > 0
      ? {
          equipmentOwnedAfter: nextOwned,
          equipmentCodexRaw: ctx.batchState
            ? (ctx.batchState.equipmentCodexRaw ??=
                await readSave(tx, userId, EQUIPMENT_CODEX_KEY, {}))
            : await readSave(tx, userId, EQUIPMENT_CODEX_KEY, {}),
          acquiredIds: droppedUniques,
        }
      : undefined;
    if (ctx.batchState) {
      ctx.batchState.adventureLog = applyHuntAdventureProgress(
        ctx.batchState.adventureLog ?? {},
        enemyName,
        now,
        uniqueEquipment,
      );
      ctx.batchState.adventureLogDirty = true;
    } else {
      await recordMonsterKill(tx, userId, enemyName, now, uniqueEquipment);
    }
  }

  // PR-prof — 승리 시 직업군 숙련도 적립 + 레벨업 시 랜덤 스탯 성장(앵커 가중, cap 까지).
  // 산출은 huntProficiency(콜로케이트 순수 헬퍼), 쓰기만 여기서. lock 순서: character.v2 다음에
  // proficiency.v2. PR-perf — upfront lock-read 한 proficiencyRaw 재사용(같은 tx 스냅샷).
  const {
    nextProficiency,
    proficiencyGained,
    proficiencyPointsAfter,
    masteryGained,
    masteryJobId,
    masteryAfter,
    spMilestonesGained,
    statGains,
    hpGain,
    mpGain,
  } = applyHuntProficiency({
    won,
    depth,
    charSave,
    proficiencyRaw,
    equippedSkills: v2Skills.equipped,
    proficiencyChancePct: guildCombatSupply.proficiencyChancePct,
    levelsGained: expResult.levelsGained,
    rewardWins: rewardRolls,
    liberationGrowth: V2_EQUIPMENT_LIBERATION
      ? { growth: liberationSnapshot.growth }
      : undefined,
  });
  if (nextProficiency) {
    if (ctx.batchState) {
      ctx.batchState.actor.proficiencyRaw = nextProficiency;
      ctx.batchState.proficiencyDirty = true;
    } else {
      await upsertSave(tx, userId, "proficiency.v2", nextProficiency);
    }
  }
  const codexMasteryEvents: CodexMasteryGameplayEvent[] = [];
  // 미개척지 몬스터는 아직 공개된 v1 모험의 서 카탈로그 대상이 아니다.
  // 미등록 entry를 전송하면 숙련도 기록이 사냥 트랜잭션 전체를 중단한다.
  if (won && !unexploredMode) {
    codexMasteryEvents.push({
      category: "monster",
      entryId: enemyKey,
      amount: 1,
      source: "hunt.victory",
    });
  }
  codexMasteryEvents.push(...huntEquipmentCodexEvents(droppedEquipments, droppedUniques));
  if (masteryJobId && masteryGained > 0) {
    codexMasteryEvents.push({
      category: "job",
      entryId: masteryJobId,
      amount: masteryGained,
      source: "job.victory",
    });
  }
  if (codexMasteryEvents.length > 0) {
    if (ctx.codexMasteryEvents) {
      ctx.codexMasteryEvents.push(...codexMasteryEvents);
    } else {
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        codexMasteryEvents,
        new Date(now),
      );
    }
  }

  // 코어루프 패배 페널티는 순수 소실이다. 보유 골드에서 이미 차감됐고, 세금처럼 금고에 쌓지 않는다.
  if (
    won &&
    !unexploredMode &&
    !ctx.offline &&
    !ctx.batchState?.deferGuildExploration
  ) {
    await incrementGuildExplorationProgressForUser(
      tx,
      userId,
      "huntWins",
      1,
      new Date(now),
    );
    if (depth >= GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH) {
      await incrementGuildExplorationProgressForUser(
        tx,
        userId,
        "deepHuntWins",
        1,
        new Date(now),
      );
    }
  }

  return {
    ok: true as const,
    status: 200,
    body: {
      ok: true as const,
      stamina: afterStamina,
      result: {
        floor: depth, // 깊이(클라 호환 키)
        maxDepth: unexploredMode
          ? Math.min(frontierDepth, MAX_FRONTIER_DEPTH)
          : Math.min(
              MAX_FRONTIER_DEPTH,
              won && depth > frontierDepth ? depth : frontierDepth,
            ), // 최고 도달(MAX 캡으로 정규화)
        enemyName,
        won,
        referralRewardEarned,
        timedOut,
        expGained,
        proficiencyGained, // 숙달 포인트 획득(승리·수행 프로필 보유 시 깊이별 +2~5).
        proficiencyPointsAfter, // 사냥 후 사용 가능한 숙달 포인트 잔액.
        masteryGained, // 직업 숙련도 획득(승리·직업 보유 시 +1).
        masteryAfter, // 상시 카드 readout — 사냥 후 현재 직업 숙련도(none=null).
        goldGained: goldNet, // 사냥자 실 수령 (사냥세 없음).
        goldAfter: newGold, // 사냥 후 최종 보유 골드 — 클라 공용 상태 즉시 동기화용.
        goldGross,
        hotTime:
          hotTime.active && (hotTimeExpBonus > 0 || hotTimeGoldBonus > 0)
            ? {
                title: hotTime.title,
                expBonus: hotTimeExpBonus,
                goldBonus: hotTimeGoldBonus,
                expPct: hotTime.bonuses.expPct,
                goldPct: hotTime.bonuses.goldPct,
              }
            : null,
        foodExpBuff:
          foodBuff && foodExpBonus > 0
            ? { name: foodBuff.recipeName, expPct: foodExpPct, expBonus: foodExpBonus }
            : null,
        foodGoldBuff:
          foodBuff && foodGoldBonus > 0
            ? { name: foodBuff.recipeName, goldPct: foodGoldPct, goldBonus: foodGoldBonus }
            : null,
        goldTaxed,
        // 코어루프 패배 페널티 — flag on 일 때만 노출(off 면 키 없음 = 응답 byte-identical).
        //   lossTax = 이번 판 소실액(0=승리), atRiskGold = 마지막 패배 이후 누적 승리분.
        ...(V2_CORE_LOOP_V2
          ? { lossTax, atRiskGold: nextAtRisk, spMilestonesGained }
          : {}),
        levelsGained: expResult.levelsGained,
        ...(explorationGrant
          ? {
              exploration: {
                xpGained: explorationGrant.acceptedXp,
                xpAfter: explorationGrant.save.explorationXp,
                xpPoints: explorationGrant.save.xpPoints,
                pointsGained: explorationGrant.pointsGained,
              },
            }
          : {}),
        statGains, // 레벨업 랜덤 성장으로 오른 1차 스탯 ({} = 레벨업 없음).
        hpGain, // 레벨업으로 오른 maxHp (레벨 고정분 + VIT).
        mpGain, // 레벨업으로 오른 maxMp (레벨 고정분 + INT).
        turns: battleResult.turns,
        hpBefore: startPlayerHp,
        hpAfter: afterHp,
        maxHp: player.maxHp,
        mpAfter: afterMp,
        maxMp,
        // 레어맵 — 이번 사냥에서 새 지도 발견(kind id + 바로가기용 인스턴스) / 입장 중이면 남은 판수.
        rareMapDrop,
        rareMapDropInstance,
        rareMapRunsLeft,
        rewardRolls,
        // 충전식 회복약 잔량 — HP/MP 모두 전투 후 부족분 자동 소모 반영.
        hpCharges,
        mpCharges,
        drops,
        droppedEquipment,
        droppedUnique,
        droppedEquipments,
        droppedUniques,
        ...(unexploredHunt
          ? {
              unexploredSummary: {
                difficulty: unexploredHunt.difficulty,
                encounterShares: unexploredHunt.encounterShares,
                rewardPct: unexploredHunt.effects.rewardPct,
                rareCopyChancePct:
                  unexploredHunt.effects.rareCopyChancePct,
                traceEnabled: unexploredHunt.effects.traceEnabled,
                traceExtraChancePct:
                  unexploredHunt.effects.traceExtraChancePct,
                monsterKind: unexploredHunt.runtime.kind,
                poolId: unexploredHunt.runtime.poolId,
                grants: unexploredRewards?.grants ?? [],
              },
            }
          : {}),
        ejected: ejectedNotice,
        // BattleScene replay 용 — BattleScene 이 실제로 보는 필드만 추출
        // (enemy.{name,hp,image}, playerMaxHp, log). 클라가 buildBattleStateFromReplay
        // 로 BattleState 형태로 재구성. 온라인 전투는 전체 로그를 보존하고, 일괄 사냥의
        // 긴 로그만 트랜잭션 커밋 후 replayId 참조로 치환한다.
        replay: fullReplay
          ? toReplayPayload(battleResult.finalState, { depth })
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
        levelAfter: expResult.level,
        maxExpAfter:
          requiredExpToNextNullable(expResult.level) ?? expResult.exp,
      },
    },
  };
} // ← runOneHunt 끝

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 명시적 string — runOneHunt(중첩 클로저)에서 narrowing 이 풀리지 않게.
  const userId: string = maybeUserId;
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:dungeon:hunt",
    userLimit: HUNT_USER_RATE_LIMIT_PER_MINUTE,
    ipLimit: HUNT_IP_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (huntInFlightUsers.has(userId)) return huntInFlightResponse();
  huntInFlightUsers.add(userId);
  try {
    return await handleHunt(req, userId);
  } finally {
    huntInFlightUsers.delete(userId);
  }
}

async function handleHunt(req: Request, userId: string) {
  const parsed = await parseHuntRequestIntent(req, userId);
  if (!parsed.ok) return parsed.response;
  const {
    mode,
    depth,
    dropFloor,
    count,
    outpostId,
    lockedTileOutpostId,
    rareMapIid,
    autoStopConfig,
  } = parsed.intent;

  const result = await db.transaction(async (tx) => {
    const ctx: RunOneHuntCtx = {
      tx,
      userId,
      depth,
      dropFloor,
      outpostId,
      tileOutpostId: lockedTileOutpostId,
      rareMapIid,
      mode,
      hpPotionTargetPct: autoStopConfig.hpPotionTargetPct,
      mpPotionTargetPct: autoStopConfig.mpPotionTargetPct,
    };

    // 단판도 같은 request-scoped save 상태를 사용해 여러 save 잠금·최종 쓰기를 한 쿼리로
    // 합친다. 응답 모양과 길드 탐사 반영 시점은 기존 단판 경로를 그대로 유지한다.
    if (count === 1) {
      const singleState: HuntBatchState = { actor: {}, dining: {} };
      const single = await runOneHunt(true, {
        ...ctx,
        batchState: singleState,
      });
      await flushHuntSaves(tx, userId, singleState);
      if (single.ok && !HUNT_COOLDOWN_MODE) {
        await recordGrowthLeapStaminaSpendInTx(tx, userId, HUNT_COST);
      }
      return single;
    }
    // === 일괄(batch) 루프 ===
    const batchState: HuntBatchState = {
      actor: {},
      dining: {},
      deferGuildExploration: true,
    };
    const codexMasteryEvents: CodexMasteryGameplayEvent[] = [];
    const batchCtx: RunOneHuntCtx = {
      ...ctx,
      batchState,
      codexMasteryEvents,
    };
    // count>1 — 한 트랜잭션에서 N회. 스태미나 부족·HP 부족·사망이면 중단(완료분은 커밋).
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let referralRewardEarned = false;
    let totalExp = 0;
    let explorationXpGained = 0;
    let explorationPointsGained = 0;
    let explorationAfter: {
      xpAfter: number;
      xpPoints: number;
    } | null = null;
    let totalProficiency = 0;
    let totalGold = 0;
    let totalLossTax = 0;
    let totalGoldGross = 0; // 구버전 응답 호환용 총 골드 합산.
    let totalGoldTaxed = 0;
    let totalMastery = 0;
    let proficiencyAfter: number | null = null; // 상시 카드 readout — 가장 최근 사냥의 현재 숙련도.
    let proficiencyPointsAfter: number | null = null;
    let levelsGained = 0;
    let spMilestonesGained = 0; // 코어루프 — 일괄 동안 새로 넘은 SP 마일스톤 합산(flag off=0).
    const statGains: Partial<Record<V2StatKey, number>> = {};
    let hpGained = 0; // 일괄 동안 레벨업으로 오른 maxHp 합산.
    let mpGained = 0; // 일괄 동안 레벨업으로 오른 maxMp 합산.
    const drops: DropResult = {};
    const droppedEquipments: V2EquipmentId[] = [];
    const droppedUniques: V2EquipmentId[] = [];
    const rareMapDrops: RareMapKindId[] = [];
    const rareMapDropInstances: RareMapInstance[] = [];
    let rareMapRunsLeft: number | null = null;
    let stoppedReason:
      | "stamina"
      | "death"
      | "defeat"
      | "recovery"
      | "error"
      | AutoHuntStopReason
      | null = null;
    let lastStamina: unknown = null;
    let finalHpAfter: number | null = null;
    let finalMaxHp: number | null = null;
    let finalMaxDepth: number | null = null;
    let expAfter: number | null = null;
    let maxExpAfter: number | null = null;
    let finalLevelAfter: number | null = null;
    // 일괄 결과 아래 캐릭터 정보 카드용 — 마지막 사냥 후 회복약 충전량 + MP 보유 여부.
    let hpCharges: number | null = null;
    let mpCharges: number | null = null;
    let playerMaxMp: number | null = null;
    let finalMpAfter: number | null = null;
    let finalGoldAfter: number | null = null;
    let ejected: EjectedFrom | null = null;
    let unexploredSummary: Record<string, unknown> | null = null;
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
    }> = [];

    for (let i = 0; i < count; i++) {
      const r = await runOneHunt(true, batchCtx);
      if (!r.ok) {
        // 첫 사냥부터 실패면 단판과 동일하게 에러 응답 그대로(409 스태미나/HP·403 정책 등).
        //   버튼이 스태미나/회복 상태에선 비활성이라 실사용상 드물다. 중간(완료>0) 실패는
        //   완료분 요약 + 라벨로 중단(스태미나 소진·저체력·기타).
        if (completed === 0) {
          await flushHuntSaves(tx, userId, batchState);
          return r;
        }
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
      referralRewardEarned ||= res.referralRewardEarned;
      totalExp += res.expGained;
      if (res.exploration) {
        explorationXpGained += res.exploration.xpGained;
        explorationPointsGained += res.exploration.pointsGained;
        explorationAfter = {
          xpAfter: res.exploration.xpAfter,
          xpPoints: res.exploration.xpPoints,
        };
      }
      totalProficiency += res.proficiencyGained;
      totalMastery += res.masteryGained ?? 0;
      proficiencyPointsAfter = res.proficiencyPointsAfter;
      if (res.masteryAfter != null) proficiencyAfter = res.masteryAfter;
      totalGold += res.goldGained;
      totalLossTax += res.lossTax ?? 0;
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
      droppedEquipments.push(...res.droppedEquipments);
      droppedUniques.push(...res.droppedUniques);
      if (res.rareMapDrop) rareMapDrops.push(res.rareMapDrop);
      if (res.rareMapDropInstance) {
        rareMapDropInstances.push(res.rareMapDropInstance);
      }
      rareMapRunsLeft = res.rareMapRunsLeft ?? rareMapRunsLeft;
      if (res.ejected && !ejected) ejected = res.ejected;
      if ("unexploredSummary" in res && res.unexploredSummary) {
        unexploredSummary = res.unexploredSummary as unknown as Record<
          string,
          unknown
        >;
      }
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
      finalLevelAfter = res.levelAfter;
      hpCharges = res.hpCharges ?? hpCharges;
      mpCharges = res.mpCharges ?? mpCharges;
      playerMaxMp = res.replay?.playerMaxMp ?? playerMaxMp;
      const autoStopReason = getAutoHuntStopReason(autoStopConfig, {
        hpCharges: res.hpCharges,
        mpCharges: res.mpCharges,
        hasMp: (res.maxMp ?? 0) > 0,
        rareMapFound:
          !!res.rareMapDrop &&
          RARE_MAP_KINDS[res.rareMapDrop]?.category === "hunt",
        level: res.levelAfter,
      });
      if (autoStopReason) {
        stoppedReason = autoStopReason;
        break;
      }
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

    // 첫 판이 잡은 row lock을 유지한 채 판간 상태는 메모리로 이월하고, 최종 save만 한 번 쓴다.
    // 중간 실패로 루프가 멈춰도 완료된 판의 최신 상태가 여기서 함께 커밋된다.
    await flushHuntSaves(tx, userId, batchState);
    if (completed > 0 && !HUNT_COOLDOWN_MODE) {
      await recordGrowthLeapStaminaSpendInTx(
        tx,
        userId,
        HUNT_COST * completed,
      );
    }

    // 매 승리마다 같은 길드 멤버십·본부·주간 row를 다시 조회/잠그지 않고 합산 반영한다.
    // addGuildExplorationProgress의 계산은 count에 선형이므로 판별 결과는 기존과 같다.
    if (wins > 0 && mode === "normal") {
      const progressAt = new Date();
      await incrementGuildExplorationProgressForUser(
        tx,
        userId,
        "huntWins",
        wins,
        progressAt,
      );
      if (depth >= GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH) {
        await incrementGuildExplorationProgressForUser(
          tx,
          userId,
          "deepHuntWins",
          wins,
          progressAt,
        );
      }
    }

    if (codexMasteryEvents.length > 0) {
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        codexMasteryEvents,
        new Date(),
      );
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
          referralRewardEarned,
          totalExp,
          ...(explorationAfter
            ? {
                exploration: {
                  xpGained: explorationXpGained,
                  xpAfter: explorationAfter.xpAfter,
                  xpPoints: explorationAfter.xpPoints,
                  pointsGained: explorationPointsGained,
                },
              }
            : {}),
          totalProficiency,
          totalMastery,
          proficiencyAfter,
          proficiencyPointsAfter,
          totalGold,
          totalLossTax,
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
          rareMapDropInstances,
          rareMapRunsLeft,
          stoppedReason,
          finalHpAfter,
          finalMaxHp,
          finalMpAfter,
          finalGoldAfter,
          finalMaxDepth,
          expAfter,
          maxExpAfter,
          finalLevelAfter,
          hpCharges,
          mpCharges,
          playerMaxMp,
          replays,
          ejected,
          ...(unexploredSummary ? { unexploredSummary } : {}),
        },
      },
    };
  });

  if (result.status === 200 && "batch" in result.body) {
    const entries = result.body.batch.replays;
    const deferredPayloads = await deferLongBattleReplays(
      db,
      userId,
      entries.map((entry) => entry.replay),
    );
    result.body.batch.replays = entries.map((entry, index) => ({
      ...entry,
      replay: deferredPayloads[index] ?? entry.replay,
    }));
  }
  await broadcastHuntUniqueDrops(userId, result.body);
  return Response.json(result.body, { status: result.status });
}
