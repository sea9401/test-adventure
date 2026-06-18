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
import {
  aggregateBalanceTelemetry,
  type TelemetryUser,
} from "./aggregate";

// GET /api/admin/balance-telemetry — 읽기 전용 밸런스 텔레메트리(Phase 1).
//   기존 saves_kv(character/equipment/proficiency/skills.v2)만 집계 — 이벤트 로깅·핫패스 변경 없음.
//   관리자(테스트) 계정 제외. 최근 밸런스 변경(난이도 곡선·아이템 정리·DEX 독주·SPI 부활) 검증용.
//   집계 로직은 ./aggregate(순수·테스트) 로 분리 — 여기선 DB read + per-user derive 만.

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const adminSet = new Set(getAdminEmailsList().map((e) => e.toLowerCase()));

  // 캐릭터(character.v2) 있는 유저의 4개 save 블롭 한 번에. 파생은 TS 에서(power/유효스탯).
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      LOWER(u.email) AS email,
      c.value AS character,
      e.value AS equipment,
      pr.value AS proficiency,
      s.value AS skills
    FROM users u
    JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN saves_kv e ON e.user_id = u.id AND e.key = 'equipment.v2'
    LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
    LEFT JOIN saves_kv s ON s.user_id = u.id AND s.key = 'skills.v2'
  `);

  type Row = {
    user_id: string;
    email: string | null;
    character: unknown;
    equipment: unknown;
    proficiency: unknown;
    skills: unknown;
  };
  const rows = result.rows as unknown as Row[];

  const users: TelemetryUser[] = [];
  let adminExcluded = 0;
  let deriveFailed = 0;

  for (const r of rows) {
    if (r.email && adminSet.has(r.email)) {
      adminExcluded++;
      continue;
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
    try {
      const { owned, equipped } = parseEquipmentSave(r.equipment);
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
      level: Math.max(1, Math.floor(Number(character.level ?? 1))),
      frontierDepth: Math.max(1, Math.floor(Number(charAny.frontierDepth) || 1)),
      gold: Math.max(0, Math.floor(Number(charAny.gold) || 0)),
      power,
      totalStats: derived.totalStats,
      classId: parseV2Class(character.class),
      classTier: derived.classTier,
      equippedIds,
    });
  }

  return Response.json(
    aggregateBalanceTelemetry(users, { adminExcluded, deriveFailed }),
  );
}
