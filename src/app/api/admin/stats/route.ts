import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/server/isAdmin";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  calcSpBudget,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  cumLevelForJob,
  jobIdFromLegacy,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  groupCumLevel,
  parseProficiencyForChar,
  totalCumLevel,
  usablePoints,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  spCostOf,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import { parseTreasureCodex } from "@/adventure/v2/treasureCodex";
import { codexSpBonusFromRaw } from "@/lib/server/codexSpBonus";

export type AdminStatsRow = {
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  level: number | null;
  exp: number | null;
  gold: number | null;
  classId: string | null;
  jobId: string | null;
  jobName: string | null;
  jobTier: number | null;
  frontierDepth: number;
  reincarnations: number;
  totalMastery: number;
  currentMastery: number;
  proficiencyPoints: number;
  spBudget: number;
  spUsed: number;
  skillsLearned: number;
  skillsEquipped: number;
  equipmentOwned: number;
  equipmentEquipped: number;
  maxEnhanceLevel: number;
  fishCaught: number;
  fishSpecies: number;
  antiquesFound: number;
  battleCount: number;
};

// GET /api/admin/stats
// 모든 유저의 현재 v2 코어루프 진척을 한 번에. character/proficiency/skills/equipment/codex 를
// 읽어 프론티어·직업 숙련도·SP·생활 진행을 derive 한다.
// 캐릭터 미생성 유저도 포함 (level NULL) — 가입만 하고 안 들어온 케이스 식별용.
export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.email,
      u.created_at AS created_at,
      p.name AS name,
      p.last_seen_at AS last_seen_at,
      (c.value->>'level')::int AS level,
      -- exp/gold/fame 는 누적값이라 int4 범위(~21억)를 넘을 수 있다(예: gold 1000억+).
      -- int 캐스팅은 "integer out of range" 로 쿼리 전체를 500 시키므로 bigint 로 받는다.
      (c.value->>'exp')::bigint AS exp,
      (c.value->>'gold')::bigint AS gold,
      c.value AS character,
      eq.value AS equipment,
      pr.value AS proficiency,
      sk.value AS skills,
      fc.value AS fishing_codex,
      tc.value AS treasure_codex,
      ec.value AS equipment_codex,
      (
        COALESCE((
          SELECT SUM((m.value->>'kills')::bigint)
          FROM jsonb_each(l.value->'monsters') AS m
          WHERE (m.value->>'kills') IS NOT NULL
        ), 0)
        + COALESCE((l.value->>'battleLosses')::bigint, 0)
      ) AS battle_count
    FROM users u
    LEFT JOIN presence p ON p.user_id = u.id
    LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN saves_kv l ON l.user_id = u.id AND l.key = 'adventure-log.v2'
    LEFT JOIN saves_kv eq ON eq.user_id = u.id AND eq.key = 'equipment.v2'
    LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
    LEFT JOIN saves_kv sk ON sk.user_id = u.id AND sk.key = 'skills.v2'
    LEFT JOIN saves_kv fc ON fc.user_id = u.id AND fc.key = 'fishing-codex.v1'
    LEFT JOIN saves_kv tc ON tc.user_id = u.id AND tc.key = 'treasure-codex.v1'
    LEFT JOIN saves_kv ec ON ec.user_id = u.id AND ec.key = 'equipment-codex.v1'
    ORDER BY u.created_at DESC
    LIMIT 500
  `);

  // drizzle-orm execute 는 { rows: ... } 반환. 컬럼 snake_case → camelCase.
  const rows = (result.rows as Record<string, unknown>[]).map((r) => {
    const character =
      r.character && typeof r.character === "object"
        ? (r.character as Record<string, unknown>)
        : {};
    const classId = r.character == null ? null : parseV2Class(character.class);
    const specChoice =
      typeof character.specChoice === "string" ? character.specChoice : null;
    const jobId = classId ? jobIdFromLegacy(classId, specChoice) : null;
    const job = jobId ? V2_JOB_CATALOG[jobId] : undefined;
    const prof = parseProficiencyForChar(r.proficiency, character);
    const currentMastery =
      job && classId
        ? cumLevelForJob(prof, job)
        : classId
          ? groupCumLevel(prof, classId)
          : 0;
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
      Number(character.spCapBonus) || 0,
      collectionSp,
    );
    const equipment = parseEquipmentSave(r.equipment);
    const fishCodex = parseFishCodex(r.fishing_codex);
    const treasureCodex = parseTreasureCodex(r.treasure_codex);
    return {
      userId: String(r.user_id),
      email: r.email == null ? null : String(r.email),
      name: r.name == null ? null : String(r.name),
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
      lastSeenAt:
        r.last_seen_at instanceof Date
          ? r.last_seen_at.toISOString()
          : r.last_seen_at == null
            ? null
            : String(r.last_seen_at),
      level: r.level == null ? null : Number(r.level),
      exp: r.exp == null ? null : Number(r.exp),
      gold: r.gold == null ? null : Number(r.gold),
      classId,
      jobId,
      jobName: job?.name ?? jobId,
      jobTier: job?.tier ?? null,
      frontierDepth: Math.max(0, Math.floor(Number(character.frontierDepth) || 0)),
      reincarnations: prof.reincarnations ?? 0,
      totalMastery: totalCumLevel(prof),
      currentMastery,
      proficiencyPoints: usablePoints(prof),
      spBudget,
      spUsed,
      skillsLearned: skills.learned.length,
      skillsEquipped: skills.equipped.length,
      equipmentOwned: equipment.owned.length,
      equipmentEquipped: Object.values(equipment.equipped).filter(Boolean).length,
      maxEnhanceLevel: equipment.owned.reduce(
        (max, it) => Math.max(max, it.enhance?.level ?? 0),
        0,
      ),
      fishCaught: Object.values(fishCodex.fish).reduce(
        (sum, f) => sum + f.totalCaught,
        0,
      ),
      fishSpecies: Object.keys(fishCodex.fish).length,
      antiquesFound: Object.keys(treasureCodex.antiques).length,
      battleCount: Number(r.battle_count ?? 0),
    };
  }) satisfies AdminStatsRow[];

  return Response.json(rows);
}
