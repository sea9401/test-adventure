import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guilds, guildMembers, savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { grantTitleIfMissing, ownedTitleIdsOf } from "@/lib/server/grantTitle";
import {
  INSOMNIA_TITLE_ID,
  isInsomniaTitleWindow,
} from "@/lib/server/insomniaTitle";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { reconcileV2EquippedSkills } from "@/lib/server/v2Skills";
import { ensureV2Character } from "@/lib/server/v2Character";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { parseV2Class, jobDisplayName } from "@/adventure/data/v2/classes";
import {
  V2_CORE_LOOP_V2,
  V2_FREEFORM_TILES,
  HUNT_COOLDOWN_MODE,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  EQUIPMENT_CODEX_KEY,
  equipmentCodexSummary,
} from "@/adventure/data/v2/equipmentCodex";
import {
  CATALOG_USES_QUEST_CONDITION,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import { loadCompletedQuestIds } from "@/lib/server/v2QuestContext";
import { parseV2Element } from "@/adventure/data/v2/elements";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import { parseTreasureFragments } from "@/adventure/v2/treasureFragments";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import {
  isIntruderActive,
  parseLastHuntedOutpost,
} from "@/adventure/data/v2/intruderTracking";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { requiredExpToNext } from "@/lib/leveling";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
} from "@/adventure/v2/stamina";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import { seededDiscovery } from "@/adventure/data/v2/outpostGraph";
import {
  battleCountOf,
  combatStatsSection,
  elementalSkillsSection,
  fishingCodexSection,
  frontierDepthOf,
  huntGateSections,
  jobsV2Section,
  loadoutSection,
  materialCodexSection,
  proficiencySection,
  spFruitSection,
  tilePosOf,
  treasureCodexSection,
} from "./stateSections";
import {
  loadCurrentOutpost,
  loadFreeformTileSettlements,
} from "./stateOutpost";

// GET /api/v2/me/state — V2GameFlow 의 mount fetch (캐릭+자원+currentOutpost).
//
// 캐릭터(레벨/EXP/HP/스태미너/골드) + 길드(id/name) + 자원풀 한 번에.
// HP·stamina 는 시간 회복 적용한 현재값으로 surface (다음 사냥 진입 시 동기화).
// 응답 섹션 계산은 stateSections(순수)·stateOutpost(DB 조회)로 분리 — 여기는
// 인증/부수효과(reconcile·칭호 지급)와 응답 조립만 담당한다.

const STATE_SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "skills.v2",
  "proficiency.v2",
  "fishing-codex.v1",
  "treasure-codex.v1",
  "treasure-fragments.v1",
  "adventure-log.v2",
  STAMINA_POTIONS_KEY,
  "inventory.v2",
  EQUIPMENT_CODEX_KEY,
] as const;

type StateSaveKey = (typeof STATE_SAVE_KEYS)[number];

async function readStateSaveRows(userId: string) {
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), inArray(savesKv.key, [...STATE_SAVE_KEYS])),
    );
  return new Map(rows.map((row) => [row.key as StateSaveKey, row.value]));
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // reconcileV2EquippedSkills 는 idempotent — 코어루프에서는 수동 SP 로드아웃을 보존하고
  // 학습분/SP예산 기준으로만 정리한다. learned 불변.
  // 길드는 더 이상 자동 생성 X — null 이면 무소속.
  const guildId = await db.transaction(async (tx) => {
    const gid = await getGuildId(tx, userId);
    await reconcileV2EquippedSkills(tx, userId);
    await ensureV2Character(tx, userId);
    return gid;
  });

  const [stateSaves, guildRow, resources] = await Promise.all([
    readStateSaveRows(userId),
    guildId == null
      ? Promise.resolve(undefined)
      : db
          // 길드 이름 + 내 직책 한 번에 — 정착지 관리 탭 게이트(마스터/부마스터)용.
          .select({
            name: guilds.name,
            masterId: guilds.masterId,
            role: guildMembers.role,
          })
          .from(guilds)
          .leftJoin(
            guildMembers,
            and(
              eq(guildMembers.guildId, guilds.id),
              eq(guildMembers.userId, userId),
            ),
          )
          .where(eq(guilds.id, guildId))
          .limit(1)
          .then((rows) => rows[0]),
    guildId == null
      ? Promise.resolve(null)
      : db.transaction(async (tx) => readGuildResources(tx, guildId)),
  ]);

  const saveRow = (key: StateSaveKey): { value: unknown } | undefined =>
    stateSaves.has(key) ? { value: stateSaves.get(key) } : undefined;
  const charRow = saveRow("character.v2");
  const profileRow = saveRow("character-profile.v2");
  const skillsRow = saveRow("skills.v2");
  const proficiencyRow = saveRow("proficiency.v2");
  const fishingCodexRow = saveRow("fishing-codex.v1");
  const treasureCodexRow = saveRow("treasure-codex.v1");
  const treasureFragmentsRow = saveRow("treasure-fragments.v1");
  const adventureLogRow = saveRow("adventure-log.v2");
  const staminaPotionsRow = saveRow(STAMINA_POTIONS_KEY);
  const inventoryRow = saveRow("inventory.v2");
  const equipmentCodexRow = saveRow(EQUIPMENT_CODEX_KEY);
  const combat = derivePlayerCombatV2FromSaves({
    character: charRow?.value as SavedCharacterV2 | undefined,
    equipmentSave: stateSaves.get("equipment.v2"),
    proficiencyRaw: proficiencyRow?.value,
    skillsRaw: skillsRow?.value,
  });

  // 전투 횟수(전적) — 랭킹 battleCount 와 동일 정의(stateSections.battleCountOf).
  const battleCount = battleCountOf(adventureLogRow?.value);

  const charSave = (charRow?.value ?? {}) as {
    level?: number;
    exp?: number;
    hp?: number;
    hpRegenSince?: number;
    stamina?: unknown;
    gold?: number;
    materials?: unknown;
    lastVisitedOutpost?: { outpostId?: string; at?: number };
    discoveredOutpostIds?: string[];
    tilePos?: { col?: number; row?: number; at?: number };
    frontierDepth?: unknown;
    lastHuntedOutpost?: unknown;
    equippedTitleId?: unknown;
    spFruitUsed?: unknown;
  };

  // 칭호 — 보유(adventure-log.v2.titles)·장착(character.v2.equippedTitleId). 모험의 서
  // "칭호" 탭이 소비. 보유 목록만 노출하므로 옛 V1 칭호(v2 에선 미획득)는 포함되지 않는다.
  let ownedTitleIds = ownedTitleIdsOf(adventureLogRow?.value);
  if (
    !ownedTitleIds.includes(INSOMNIA_TITLE_ID) &&
    isInsomniaTitleWindow(new Date())
  ) {
    const granted = await grantTitleIfMissing(
      userId,
      INSOMNIA_TITLE_ID,
      Date.now(),
    );
    if (granted) ownedTitleIds = [...ownedTitleIds, INSOMNIA_TITLE_ID];
  }
  const equippedTitleId =
    typeof charSave.equippedTitleId === "string" &&
    ownedTitleIds.includes(charSave.equippedTitleId)
      ? charSave.equippedTitleId
      : null;

  // 현 거점 카드 — character.v2.lastVisitedOutpost → 점령/영주/금고 동봉(stateOutpost).
  const currentOutpost = await loadCurrentOutpost(
    charSave.lastVisitedOutpost?.outpostId,
  );
  const profile = (profileRow?.value ?? null) as {
    name?: string;
    gender?: string;
  } | null;
  const name = profile?.name?.trim() || "모험가";
  const gender =
    typeof profile?.gender === "string" && profile.gender.length > 0
      ? profile.gender
      : "male1";
  const guildName = guildRow?.name ?? null;
  const maxHp = combat?.maxHp ?? 100;
  const maxMp = combat?.player.maxMp ?? 0;

  const now = Date.now();
  // per-user 스태미나 최대치 — 기본 + 한계의 비약(비밀 상점) 보너스.
  const staminaMax =
    MAX_STAMINA +
    staminaCapBonusOf((charSave as { staminaCapBonus?: unknown }).staminaCapBonus);
  const stamina = applyRegen(
    parseStaminaFromSave(charSave.stamina, now),
    now,
    staminaMax,
  );

  const hpStored = Math.max(0, combat?.player.hp ?? maxHp);
  const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
  const hpRegen = applyHpRegen(hpStored, maxHp, hpRegenSince, now);

  const level = Math.max(1, charSave.level ?? 1);
  const exp = Math.max(0, charSave.exp ?? 0);
  const expToNext = requiredExpToNext(level);
  const inventorySave = (inventoryRow?.value ?? {}) as {
    hpCharges?: number;
    mpCharges?: number;
  };
  const hpCharges = Math.max(
    0,
    Math.min(MAX_CHARGE, inventorySave.hpCharges ?? 0),
  );
  const mpCharges = Math.max(
    0,
    Math.min(MAX_CHARGE, inventorySave.mpCharges ?? 0),
  );

  // V2CharacterScreen 의 StatsPanel 표시용. combat 미생성(캐릭 없음) 시 null.
  const stats = combat
    ? {
        base: combat.baseAllocatedStats,
        total: combat.totalStats,
      }
    : null;
  const combatStats = combatStatsSection(combat, maxHp, maxMp);

  // 회원 탈퇴 확인용 권위 닉네임(users.gameName). v2 는 이 컬럼을 안 채워 보통 null →
  // DeleteAccountModal 이 "탈퇴" 폴백을 쓰고 /api/account/delete 도 같은 폴백을 기대 → 일치.
  const [userRow] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // 침입 상태 — 다른 길드 점령 거점에서 사냥한 TTL 내 기록(intruderTracking 과 동일 판정).
  // OutpostView 가 "이 거점에 침입 중 (토벌 가능)" 배너에 사용. 없으면 null.
  const lastHunted = parseLastHuntedOutpost(charSave.lastHuntedOutpost);
  const intrusion =
    lastHunted && isIntruderActive(lastHunted, lastHunted.outpostId, now)
      ? { outpostId: lastHunted.outpostId, at: lastHunted.at }
      : null;

  const cls = parseV2Class((charSave as { class?: unknown }).class);
  // 직업 시스템 v2(직업 숙련도 해금) — 카탈로그 기반 전직 목록(전직 UI). 코어루프 on 일 때만.
  // questCompleted 조건을 쓰는 직업이 있을 때만 가이드 퀘스트 완료셋 로드(현 카탈로그=무쿼리).
  const jobUnlockCtx: JobUnlockContext | undefined =
    V2_CORE_LOOP_V2 && CATALOG_USES_QUEST_CONDITION
      ? { completedQuestIds: await loadCompletedQuestIds(db, userId) }
      : undefined;
  const jobsV2 = jobsV2Section({
    charSave,
    proficiencyRaw: proficiencyRow?.value,
    skillsRaw: skillsRow?.value,
    jobUnlockCtx,
  });
  // 직업 표시명 — 캐릭터 카드/전투 부제가 쓴다(jobDisplayName: 직업 시스템이면 견습 병사·방패병
  //   등, 아니면 옛 직군명). core-loop off 면 null(레거시 화면이 자체 처리).
  const classDisplaySpec =
    typeof (charSave as { specChoice?: unknown }).specChoice === "string"
      ? ((charSave as { specChoice?: string }).specChoice ?? null)
      : null;
  const classDisplayName = V2_CORE_LOOP_V2
    ? jobDisplayName(cls, classDisplaySpec)
    : null;
  // 코어루프 사냥 게이트 — 쿨다운/오프라인 사냥 세션(스태미나 모드면 null·stateSections).
  const { combatCooldown, offlinePending, offlineHunt } = huntGateSections(
    charSave,
    now,
  );

  // 자유 타일 지도 개척 정착지 — 코어루프 on 일 때만 전부 조회(보드 ≤81칸·작음). off=빈 배열.
  const freeformTileSettlements = V2_FREEFORM_TILES
    ? await loadFreeformTileSettlements()
    : [];
  const equipmentCodex = equipmentCodexSummary(equipmentCodexRow?.value);

  return Response.json({
    ok: true,
    accountName: userRow?.gameName?.trim() || null,
    intrusion,
    // 직업 시스템 v2(cumLevel 점진 공개 전직 목록) — 코어루프 off 면 null.
    jobsV2,
    // 코어루프 활성(은행/골드 모델·직업 시스템 등) — 사냥 throttle 과 독립. 클라는 이 값으로
    //   coreLoopOn 을 판정(combatCooldown 유무로 추론 금지 — 스태미나 모드면 쿨다운이 null 이라).
    coreLoopOn: V2_CORE_LOOP_V2,
    // 사냥이 스태미나 모드인가(코어루프 on + 스태미나 다이얼) — 클라가 스태미나 바/UI 표시 판정.
    huntStaminaMode: V2_CORE_LOOP_V2 && !HUNT_COOLDOWN_MODE,
    // 사냥 쿨다운 — 쿨다운 모드만 객체, 스태미나 모드/off 면 null(스태미나 판정).
    combatCooldown,
    // 코어루프 오프라인 정산 대기 판수 — flag off 면 null.
    offlinePending,
    // 코어루프 오프라인 사냥 세션 상태(시작/끝 시각) — flag off 면 null.
    offlineHunt,
    character: {
      name,
      gender,
      level,
      exp,
      expToNext,
      hpCharges,
      mpCharges,
      hp: hpRegen.hp,
      maxHp,
      // v2 마법 풀 — derive 가 character.v2.mp 시드, 미지정이면 maxMp 풀충. INT 0 이면 둘 다 0.
      mp: combat?.player.mp ?? maxMp,
      maxMp,
      stamina: {
        current: stamina.current,
        max: staminaMax,
        lastUpdatedAt: stamina.lastUpdatedAt,
      },
      // 보유 스태미나 포션 수(퀘 마일스톤 보상·보관형 소비템) — StaminaBar 사용 버튼용.
      staminaPotions: staminaPotionCount(staminaPotionsRow?.value),
      gold: Math.max(0, charSave.gold ?? 0),
      // 은행 — 입금된 골드(토벌 압류에서 안전). 보유 골드(gold)와 별개.
      bankedGold: Math.max(0, (charSave as { bankedGold?: number }).bankedGold ?? 0),
      // 코어루프 위험 골드 — 마지막 패배 이후 번 골드(패배 시 절반 압류 대상). off 면 null.
      atRiskGold: V2_CORE_LOOP_V2
        ? Math.max(0, Number((charSave as { atRiskGold?: number }).atRiskGold) || 0)
        : null,
      // PR-1 전투 재설계 — 직업·속성 (캐릭터 화면 헤더 + 피커).
      class: cls,
      // 코어루프 on 이면 none→"모험가" 표기. off 면 기존 직군명.
      classDisplayName,
      // 코어루프 직업 트리 — 현재 계파(재전직 화면 "현재" 표시용). off 면 null.
      spec: V2_CORE_LOOP_V2 ? classDisplaySpec : null,
      element: parseV2Element((charSave as { element?: unknown }).element),
    },
    stats,
    combat: combatStats,
    // 누적 전투 횟수(전적) — 내 정보 기본 정보 카드 표기용.
    battleCount,
    // 길드 — id/name + 내 직책(role)·마스터 여부. 정착지 관리 탭(마스터/부마스터)·기타 권한 UI 용.
    guild:
      guildId == null
        ? null
        : {
            id: guildId,
            name: guildName ?? "—",
            role: guildRow?.role ?? null,
            isMaster: guildRow?.masterId === userId,
          },
    resources,
    currentOutpost,
    // 자유 타일 지도(V2_FREEFORM_TILES) 마커 좌표. 없으면 null → 클라가 현재 거점 칸에서 파생.
    tilePos: tilePosOf(charSave.tilePos),
    // 자유 타일 지도 개척 정착지(Phase 3) — 코어루프 on 일 때만 조회(off=빈 배열·prod 무비용).
    tileSettlements: freeformTileSettlements,
    // 발견(안개) — 방문/인접으로 공개된 거점 id 목록. 없으면(신규) 시작 거점+인접 시드.
    discoveredOutpostIds:
      charSave.discoveredOutpostIds && charSave.discoveredOutpostIds.length > 0
        ? charSave.discoveredOutpostIds
        : seededDiscovery(),
    skills: parseV2SkillsState(skillsRow?.value),
    // P4 — 시그니처 직업 패시브 은퇴(전문화 패시브로 대체). 호환 위해 빈 배열 유지.
    signatures: [] as never[],
    // 학습 가능 스킬 풀 — 현 직업(jobId)의 시그니처 킷 + 학습/장착여부(학습 패널용).
    elementalSkills: elementalSkillsSection(charSave, skillsRow?.value),
    // SP 로드아웃(코어루프 전용) — flag off 면 키 없음(응답 byte-identical).
    ...(V2_CORE_LOOP_V2
      ? {
          loadout: loadoutSection({
            charSave,
            proficiencyRaw: proficiencyRow?.value,
            skillsRaw: skillsRow?.value,
            fishingCodexRaw: fishingCodexRow?.value,
            treasureCodexRaw: treasureCodexRow?.value,
            equipmentCodexSpBonus: equipmentCodex.spBonus,
          }),
        }
      : {}),
    // SP 열매(협동 보스 드랍 소모품) 사용 현황 — 인벤 소모품 탭 표시용.
    spFruit: spFruitSection(charSave.spFruitUsed),
    equipmentCodex,
    // 모험의 서(재료 도감) 진척 — 3·4차 전직 게이트 + 코덱스 UI 표시용.
    codex: materialCodexSection(charSave.materials),
    // 어보(낚시 도감) 진척 — V2CodexView 어보 탭 표시용. 종별 개인 최대어 동봉.
    fishingCodex: fishingCodexSection(
      fishingCodexRow?.value,
      treasureCodexRow?.value,
    ),
    // 유물 도감 진척 — V2CodexView 유물 탭 표시용. 종별 개인 최고 보존상태 동봉.
    treasureCodex: treasureCodexSection(
      fishingCodexRow?.value,
      treasureCodexRow?.value,
    ),
    // 지도 조각 보유 수 — 발굴 감정소 진입 표시용.
    treasureFragments: parseTreasureFragments(treasureFragmentsRow?.value).fragments,
    // 칭호 — 모험의 서 "칭호" 탭이 보유 목록 표시 + 장착 토글에 사용.
    titles: { ownedTitleIds, equippedTitleId },
    // 프론티어 최고 도달 깊이 — MAX 캡으로 정규화(stateSections.frontierDepthOf).
    frontierDepth: frontierDepthOf(charSave.frontierDepth),
    // 직업 숙련도(직업 마스터리) — 총/직업 + 현 직업군 사용가능. 수행·전직·표시용.
    proficiency: proficiencySection(proficiencyRow?.value, charSave),
  });
}
