import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  guildJoinRequests,
  guildLeaveCooldown,
  guildMembers,
  guilds,
  outpostVillages,
  presence,
  savesKv,
  v2GuildResources,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { guildMemberCap } from "@/adventure/data/guild";
import {
  SETTLEMENT_BUILDING_IDS,
  tierMeetsNation,
  isSettlementBuildingId,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  type SettlementBuildingId,
  type VillageTier,
} from "@/adventure/data/v2/settlement";
import {
  parseV2Class,
  jobDisplayName,
  V2_CLASS_DEFS,
} from "@/adventure/data/v2/classes";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";
import {
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import { parseGuildWorkshopStats } from "@/adventure/data/v2/guildWorkshop";

// GET /api/v2/me/guild/info — 길드 정보 + 멤버 list (V2GuildHome).
//
// 응답:
//   guild: { id, name, masterId, createdAt, fameTotal, description }
//   members: [{ userId, role, joinedAt, name, level, job, lastSeenAt, honorEarned }]
//   isMaster: 뷰어가 마스터인지
//   pendingRequests: [{ requestId, userId, name, level, requestedAt }] — 마스터일 때만, 아니면 []
//
// 길드 미가입 → guild=null, members=[], isMaster=false, pendingRequests=[].

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 1) 사용자가 어느 길드 멤버인지.
  const memRow = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!memRow) {
    // 무소속 — 재가입 쿨다운(탈퇴/추방 후)을 가입 패널에 표시하려 함께 반환.
    // 활성(미래)이면 ISO 문자열, 만료/없음이면 null.
    const cd = (
      await db
        .select({ cooldownUntil: guildLeaveCooldown.cooldownUntil })
        .from(guildLeaveCooldown)
        .where(eq(guildLeaveCooldown.userId, userId))
        .limit(1)
    )[0];
    return Response.json({
      ok: true,
      guild: null,
      members: [],
      isMaster: false,
      pendingRequests: [],
      leaveCooldownUntil:
        cd && cd.cooldownUntil.getTime() > Date.now()
          ? cd.cooldownUntil.toISOString()
          : null,
    });
  }
  const guildId = memRow.guildId;

  // 2) 길드 메타.
  const guildRow = (
    await db
      .select({
        id: guilds.id,
        name: guilds.name,
        masterId: guilds.masterId,
        createdAt: guilds.createdAt,
        fameTotal: guilds.fameTotal,
        fameAvailable: guilds.fameAvailable,
        description: guilds.description,
        emblem: guilds.emblem,
        color: guilds.color,
        nationName: guilds.nationName,
        nationDeclaredAt: guilds.nationDeclaredAt,
      })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1)
  )[0];
  if (!guildRow) {
    return Response.json({
      ok: true,
      guild: null,
      members: [],
      isMaster: false,
      pendingRequests: [],
    });
  }
  const isMaster = guildRow.masterId === userId;

  // 3) 멤버 row (userId·role·joinedAt).
  const memberRows = await db
    .select({
      userId: guildMembers.userId,
      role: guildMembers.role,
      joinedAt: guildMembers.joinedAt,
    })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  // 관리 직책(관리자) — 길드 관리탭 접근 권한(마스터와 동급, 임명/해임 빼고).
  const viewerRole = memberRows.find((m) => m.userId === userId)?.role;
  const isManager = viewerRole === "manager";

  // 3-b) 대기 중인 가입 신청 — 관리 권한(마스터/관리자)만 본다(수락/거절 권한과 동일).
  const pendingRows = isMaster || isManager
    ? await db
        .select({
          requestId: guildJoinRequests.id,
          userId: guildJoinRequests.userId,
          createdAt: guildJoinRequests.createdAt,
        })
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.guildId, guildId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .orderBy(asc(guildJoinRequests.createdAt))
    : [];

  // 4) 멤버·신청자 이름·레벨 — character.v2 + character-profile.v2 batch (한 번에).
  const memberIds = memberRows.map((m) => m.userId);
  const lookupIds = Array.from(
    new Set([...memberIds, ...pendingRows.map((r) => r.userId)]),
  );
  const [profileRows, charRows, craftingRows] = await Promise.all([
    lookupIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, lookupIds),
              eq(savesKv.key, "character-profile.v2"),
            ),
          ),
    lookupIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, lookupIds),
              eq(savesKv.key, "character.v2"),
            ),
          ),
    memberIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, memberIds),
              eq(savesKv.key, "crafting.v2"),
            ),
          ),
  ]);
  const nameByUser = new Map<string, string>();
  for (const r of profileRows) {
    const v = (r.value ?? null) as { name?: string } | null;
    const n = v?.name?.trim();
    if (n) nameByUser.set(r.userId, n);
  }
  const levelByUser = new Map<string, number>();
  // 직업 표시명 — character.v2 의 class+specChoice 로 파생. /me/state classDisplayName 과 동일 규칙:
  //   코어루프 on → jobDisplayName(견습 병사 등), off → 직군 표시명(전사 등). 캐릭터 카드와 일치.
  const jobByUser = new Map<string, string>();
  // 누적 명성(honorEarned) — 정착지 전쟁 명성 획득 누계(소비와 무관). 길드원 리스트 표기용.
  const honorEarnedByUser = new Map<string, number>();
  for (const r of charRows) {
    const v = (r.value ?? null) as {
      level?: number;
      class?: unknown;
      specChoice?: unknown;
      honor?: unknown;
      honorEarned?: unknown;
    } | null;
    if (typeof v?.level === "number") levelByUser.set(r.userId, v.level);
    const cls = parseV2Class(v?.class);
    const spec = typeof v?.specChoice === "string" ? v.specChoice : null;
    const job = V2_CORE_LOOP_V2
      ? jobDisplayName(cls, spec)
      : cls === "none"
        ? "모험가"
        : (V2_CLASS_DEFS[cls]?.name ?? "모험가");
    jobByUser.set(r.userId, job);
    honorEarnedByUser.set(
      r.userId,
      parseHonorEarned(v?.honorEarned, parseHonor(v?.honor)),
    );
  }
  const artisanByUser = new Map<
    string,
    {
      blacksmith: {
        level: number;
        xp: number;
        crafts: number;
        xpIntoLevel: number;
        xpForNext: number;
        totalCrafts: number;
        qualityCrafts: number;
      };
    }
  >();
  for (const r of craftingRows) {
    const v = (r.value ?? null) as {
      artisan?: unknown;
      workshopStats?: unknown;
    } | null;
    const artisan = parseArtisanState(v?.artisan);
    const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
    const workshopStats = parseGuildWorkshopStats(v?.workshopStats);
    artisanByUser.set(r.userId, {
      blacksmith: {
        level: artisanLevel(blacksmith),
        xp: blacksmith.xp,
        crafts: blacksmith.crafts,
        xpIntoLevel: artisanXpIntoLevel(blacksmith),
        xpForNext: artisanXpForNextLevel(blacksmith),
        totalCrafts: workshopStats.totalCrafts,
        qualityCrafts: workshopStats.qualityCrafts,
      },
    });
  }

  // 최근 접속 — presence.lastSeenAt(30초 하트비트). 한 번도 접속 없으면 키 없음 → null.
  const presenceRows =
    memberIds.length === 0
      ? []
      : await db
          .select({
            userId: presence.userId,
            lastSeenAt: presence.lastSeenAt,
          })
          .from(presence)
          .where(inArray(presence.userId, memberIds));
  const lastSeenByUser = new Map<string, Date>();
  for (const r of presenceRows) lastSeenByUser.set(r.userId, r.lastSeenAt);

  const members = memberRows.map((m) => ({
    userId: m.userId,
    role: m.role === "vice_master" ? "manager" : m.role,
    joinedAt: m.joinedAt,
    name: nameByUser.get(m.userId) ?? "모험가",
    level: levelByUser.get(m.userId) ?? 1,
    job: jobByUser.get(m.userId) ?? "모험가",
    lastSeenAt: lastSeenByUser.get(m.userId) ?? null,
    honorEarned: honorEarnedByUser.get(m.userId) ?? 0,
    artisan:
      artisanByUser.get(m.userId) ??
      {
        blacksmith: {
          level: 1,
          xp: 0,
          crafts: 0,
          xpIntoLevel: 0,
          xpForNext: artisanXpForNextLevel(undefined),
          totalCrafts: 0,
          qualityCrafts: 0,
        },
      },
  }));
  // master 먼저, 그 다음 joinedAt 오름차순.
  members.sort((a, b) => {
    if (a.role === "master" && b.role !== "master") return -1;
    if (a.role !== "master" && b.role === "master") return 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  const pendingRequests = pendingRows.map((r) => ({
    requestId: r.requestId,
    userId: r.userId,
    name: nameByUser.get(r.userId) ?? "모험가",
    level: levelByUser.get(r.userId) ?? 1,
    requestedAt: r.createdAt,
  }));

  // 국가 선포 — 길드 정원(국가 시 상향) + 선포 게이트 충족 여부(대도시 마을 보유).
  const memberCap = guildMemberCap(guildRow.nationName != null);
  let villageRows: Array<{ tier: string; buildings: unknown }> = [];
  try {
    villageRows = await db
      .select({ tier: outpostVillages.tier, buildings: outpostVillages.buildings })
      .from(outpostVillages)
      .where(eq(outpostVillages.guildId, guildId));
  } catch (err) {
    console.error("[guild.info] settlement building summary failed", err);
  }
  const hasMetropolis = villageRows.some((v) =>
    tierMeetsNation(v.tier as VillageTier),
  );
  const settlementBuildings = Object.fromEntries(
    SETTLEMENT_BUILDING_IDS.map((id) => [id, 0]),
  ) as Record<SettlementBuildingId, number>;
  const settlementBuildingLevels = Object.fromEntries(
    SETTLEMENT_BUILDING_IDS.map((id) => [id, 0]),
  ) as Record<SettlementBuildingId, number>;
  for (const village of villageRows) {
    if (typeof village.buildings !== "object" || village.buildings === null) {
      continue;
    }
    for (const rawBuilding of Object.values(village.buildings)) {
      const buildingId = settlementBuildingIdOf(rawBuilding);
      if (isSettlementBuildingId(buildingId)) {
        settlementBuildings[buildingId] += 1;
        settlementBuildingLevels[buildingId] = Math.max(
          settlementBuildingLevels[buildingId],
          settlementBuildingLevelOf(rawBuilding),
        );
      }
    }
  }
  const hasGuildSmithy = settlementBuildings.guild_smithy > 0;
  const hasTrainingGround = settlementBuildings.training_ground > 0;
  const hasMapWorkshop = settlementBuildings.map_workshop > 0;
  // 마스터만, 미선포 상태에서, 대도시 보유 시 선포 버튼 노출.
  const canDeclareNation =
    isMaster && guildRow.nationName == null && hasMetropolis;

  // 길드 자금 — 길드 공용 골드 풀(v2_guild_resources.gold). 거점 점령/수리 재원·금고 입금 누적.
  const resRow = (
    await db
      .select({ gold: v2GuildResources.gold })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  const guildGold = Math.max(0, resRow?.gold ?? 0);

  // 이미 쓰인 색(다른 활성 길드) — 관리탭 색 picker 에서 비활성. 내 색은 제외(선택 가능).
  const takenColorRows = await db
    .select({ color: guilds.color })
    .from(guilds)
    .where(
      and(
        isNotNull(guilds.color),
        isNull(guilds.disbandedAt),
        ne(guilds.id, guildId),
      ),
    );
  const takenColors = takenColorRows
    .map((r) => r.color)
    .filter((c): c is string => c != null);

  return Response.json({
    ok: true,
    guild: guildRow,
    members,
    isMaster,
    isManager,
    pendingRequests,
    memberCap,
    hasMetropolis,
    canDeclareNation,
    settlementBuildings,
    settlementBuildingLevels,
    hasGuildSmithy,
    hasTrainingGround,
    hasMapWorkshop,
    guildGold,
    takenColors,
  });
}
