import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin, getAdminEmailsList } from "@/lib/server/isAdmin";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { artisanLevel, parseArtisanState } from "@/adventure/data/v2/artisan";
import { calcSpBudget } from "@/adventure/data/v2/coreLoopConfig";
import {
  cumLevelForJob,
  jobUnlockSpBonus,
  jobIdFromLegacy,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  groupCumLevel,
  parseProficiencyForChar,
  totalCumLevel,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  spCostOf,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import { parseTreasureCodex } from "@/adventure/v2/treasureCodex";
import { codexSpBonusFromRaw } from "@/lib/server/codexSpBonus";
import {
  parseGuildWorkshopCraftRecords,
  parseGuildWorkshopMaterialInventory,
} from "@/adventure/data/v2/guildWorkshop";
import { GUILD_WORKSHOP_MATERIAL_IDS } from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  parseGuildWorkshopDeliveryState,
  todayDeliveryKey,
} from "@/adventure/data/v2/guildWorkshopDelivery";
import {
  aggregateBalanceTelemetry,
  type TelemetryUser,
} from "./aggregate";

// GET /api/admin/balance-telemetry — 읽기 전용 밸런스 텔레메트리(Phase 1).
//   기존 saves_kv(character/equipment/proficiency/skills.v2)만 집계 — 이벤트 로깅·핫패스 변경 없음.
//   관리자(테스트) 계정 제외. 최근 밸런스 변경(난이도 곡선·아이템 정리·DEX 독주·SPI 부활) 검증용.
//   집계 로직은 ./aggregate(순수·테스트) 로 분리 — 여기선 DB read + per-user derive 만.

function parseActiveHours(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(24 * 30, Math.max(1 / 60, n));
}

function parseUserTokens(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

function rowMatchesToken(
  row: { user_id: string; email: string | null; game_name: string | null },
  token: string,
): boolean {
  const id = row.user_id.toLowerCase();
  const email = row.email?.toLowerCase() ?? "";
  const name = row.game_name?.toLowerCase() ?? "";
  return id === token || email === token || name === token;
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const url = new URL(req.url);
  const activeHours = parseActiveHours(url.searchParams.get("activeHours"));
  const userTokens = parseUserTokens(url.searchParams.get("users"));
  const activeSince =
    activeHours == null ? null : Date.now() - activeHours * 60 * 60 * 1000;

  const adminSet = new Set(getAdminEmailsList().map((e) => e.toLowerCase()));

  // 캐릭터(character.v2) 있는 유저의 4개 save 블롭 한 번에. 파생은 TS 에서(power/유효스탯).
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      LOWER(u.email) AS email,
      COALESCE(u.game_name, p.name) AS game_name,
      p.last_seen_at AS last_seen_at,
      c.value AS character,
      e.value AS equipment,
      pr.value AS proficiency,
      s.value AS skills,
      fc.value AS fishing_codex,
      tc.value AS treasure_codex,
      ec.value AS equipment_codex,
      cr.value AS crafting
    FROM users u
    JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN presence p ON p.user_id = u.id
    LEFT JOIN saves_kv e ON e.user_id = u.id AND e.key = 'equipment.v2'
    LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
    LEFT JOIN saves_kv s ON s.user_id = u.id AND s.key = 'skills.v2'
    LEFT JOIN saves_kv fc ON fc.user_id = u.id AND fc.key = 'fishing-codex.v1'
    LEFT JOIN saves_kv tc ON tc.user_id = u.id AND tc.key = 'treasure-codex.v1'
    LEFT JOIN saves_kv ec ON ec.user_id = u.id AND ec.key = 'equipment-codex.v1'
    LEFT JOIN saves_kv cr ON cr.user_id = u.id AND cr.key = 'crafting.v2'
  `);

  type Row = {
    user_id: string;
    email: string | null;
    game_name: string | null;
    last_seen_at: Date | string | null;
    character: unknown;
    equipment: unknown;
    proficiency: unknown;
    skills: unknown;
    fishing_codex: unknown;
    treasure_codex: unknown;
    equipment_codex: unknown;
    crafting: unknown;
  };
  const rows = result.rows as unknown as Row[];

  const users: TelemetryUser[] = [];
  let adminExcluded = 0;
  let deriveFailed = 0;
  const matchedTokens = new Set<string>();

  for (const r of rows) {
    if (r.email && adminSet.has(r.email)) {
      adminExcluded++;
      continue;
    }
    if (activeSince != null) {
      const lastSeenMs =
        r.last_seen_at == null ? NaN : new Date(r.last_seen_at).getTime();
      if (!Number.isFinite(lastSeenMs) || lastSeenMs < activeSince) continue;
    }
    if (userTokens.length > 0) {
      const hits = userTokens.filter((token) => rowMatchesToken(r, token));
      if (hits.length === 0) continue;
      for (const token of hits) matchedTokens.add(token);
    }
    const character = (r.character ?? undefined) as
      | SavedCharacterV2
      | undefined;
    if (!character) continue;

    let derived;
    try {
      derived = derivePlayerCombatV2FromSaves({
        character,
        equipmentSave: r.equipment,
        proficiencyRaw: r.proficiency,
        skillsRaw: r.skills,
      });
    } catch {
      deriveFailed++;
      continue;
    }
    if (!derived) {
      deriveFailed++;
      continue;
    }

    const charAny = r.character as Record<string, unknown>;
    const classId = parseV2Class(character.class);
    const specChoice =
      typeof charAny.specChoice === "string" ? charAny.specChoice : null;
    const jobId = jobIdFromLegacy(classId, specChoice);
    const job = V2_JOB_CATALOG[jobId];
    const prof = parseProficiencyForChar(r.proficiency, character);
    const currentMastery = job
      ? cumLevelForJob(prof, job)
      : groupCumLevel(prof, classId);
    const skills = parseV2SkillsState(r.skills);
    const spUsed = skills.equipped.reduce(
      (sum, id) => sum + spCostOf(V2_SKILLS[id]),
      0,
    );
    const collectionSp = codexSpBonusFromRaw(
      r.fishing_codex,
      r.treasure_codex,
      r.equipment_codex,
    ).total;
    const spBudget = calcSpBudget(
      prof.groups,
      Number(charAny.spCapBonus) || 0,
      collectionSp,
      jobUnlockSpBonus(prof),
    );
    const fishCodex = parseFishCodex(r.fishing_codex);
    const treasureCodex = parseTreasureCodex(r.treasure_codex);
    const crafting =
      r.crafting && typeof r.crafting === "object" && !Array.isArray(r.crafting)
        ? (r.crafting as Record<string, unknown>)
        : {};
    const artisan = parseArtisanState(crafting.artisan);
    const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
    const workshopRecords = parseGuildWorkshopCraftRecords(
      crafting.workshopRecords,
    );
    const workshopMaterials = parseGuildWorkshopMaterialInventory(
      charAny.materials,
    );
    const delivery = parseGuildWorkshopDeliveryState(
      crafting.delivery,
      todayDeliveryKey(),
    );
    const power = derivePowerScore({
      atk: derived.player.atk,
      magicAtk: derived.player.magicAtk ?? 0,
      def: derived.player.def,
      spd: derived.player.spd,
      maxHp: derived.maxHp,
      maxMp: derived.player.maxMp ?? 0,
    });

    // 장착 6슬롯의 장비 id(사용률).
    let equippedIds: string[] = [];
    let equipmentOwned = 0;
    let equipmentEquipped = 0;
    let maxEnhanceLevel = 0;
    try {
      const { owned, equipped } = parseEquipmentSave(r.equipment);
      equipmentOwned = owned.length;
      equipmentEquipped = Object.values(equipped).filter(Boolean).length;
      maxEnhanceLevel = owned.reduce(
        (max, it) => Math.max(max, it.enhance?.level ?? 0),
        0,
      );
      const byIid = new Map<string, string>(
        owned.map((o) => [o.iid, o.id as string]),
      );
      equippedIds = Object.values(equipped)
        .map((iid) => (iid ? byIid.get(iid as string) : undefined))
        .filter((id): id is string => Boolean(id));
    } catch {
      /* 장비 파싱 실패는 무시(사용률만 빠짐) */
    }

    users.push({
      userId: r.user_id,
      email: r.email,
      name: r.game_name,
      lastSeenAt:
        r.last_seen_at == null
          ? null
          : r.last_seen_at instanceof Date
            ? r.last_seen_at.toISOString()
            : String(r.last_seen_at),
      level: Math.max(1, Math.floor(Number(character.level ?? 1))),
      frontierDepth: Math.max(1, Math.floor(Number(charAny.frontierDepth) || 1)),
      gold: Math.max(0, Math.floor(Number(charAny.gold) || 0)),
      bankedGold: Math.max(0, Math.floor(Number(charAny.bankedGold) || 0)),
      power,
      totalStats: derived.totalStats,
      classId,
      classTier: derived.classTier,
      jobId,
      jobName: job?.name ?? jobId,
      jobTier: job?.tier ?? 0,
      totalMastery: totalCumLevel(prof),
      currentMastery,
      reincarnations: prof.reincarnations ?? 0,
      spBudget,
      spUsed,
      skillsLearned: skills.learned.length,
      skillsEquipped: skills.equipped.length,
      equipmentOwned,
      equipmentEquipped,
      maxEnhanceLevel,
      fishCaught: Object.values(fishCodex.fish).reduce(
        (sum, f) => sum + f.totalCaught,
        0,
      ),
      fishSpecies: Object.keys(fishCodex.fish).length,
      antiquesFound: Object.keys(treasureCodex.antiques).length,
      equippedIds,
      blacksmithLevel: artisanLevel(blacksmith),
      blacksmithXp: blacksmith.xp,
      workshopTotalCrafts: workshopRecords.totalCrafts,
      workshopQualityCrafts: workshopRecords.qualityCrafts,
      workshopMasterworkCrafts: workshopRecords.masterworkCrafts,
      workshopCraftOnlyCrafts: workshopRecords.craftOnlyCrafts,
      workshopHighestTier: workshopRecords.highestTier,
      workshopBestQualityLevel: workshopRecords.bestQualityLevel,
      workshopMaterials: Object.fromEntries(
        GUILD_WORKSHOP_MATERIAL_IDS.map((id) => [
          id,
          Math.max(0, Math.floor(Number(workshopMaterials[id]) || 0)),
        ]),
      ),
      deliveryClaimsToday: delivery.claimed.length,
    });
  }

  return Response.json(
    aggregateBalanceTelemetry(users, {
      adminExcluded,
      deriveFailed,
      filters: {
        activeHours,
        userTokens,
        unmatchedUserTokens: userTokens.filter((token) => !matchedTokens.has(token)),
      },
    }),
  );
}
