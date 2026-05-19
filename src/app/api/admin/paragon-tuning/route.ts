import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/server/isAdmin";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";

// GET /api/admin/paragon-tuning
// 100레벨 이상 유저의 전투 derived 값 분포를 측정해 파라곤 1pt 노브 (분노/수호/체력)
// 와 룬 합산 캡 도입 여부를 결정하기 위한 일회성 admin 측정 도구.
// 메모리 [[project-paragon-plan]] 의 "조정 필요한 다이얼" 3종 데이터 수집용.

type Row = {
  userId: string;
  level: number;
  atk: number;
  def: number;
  maxHp: number;
  critChancePct: number;
  critMult: number;
};

function pickStat(rows: Row[], key: keyof Omit<Row, "userId">): {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
} {
  if (rows.length === 0) {
    return { count: 0, min: 0, p25: 0, median: 0, p75: 0, max: 0, mean: 0 };
  }
  const vals = rows.map((r) => r[key]).sort((a, b) => a - b);
  const sum = vals.reduce((s, v) => s + v, 0);
  const pick = (q: number) =>
    vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
  return {
    count: vals.length,
    min: vals[0],
    p25: pick(0.25),
    median: pick(0.5),
    p75: pick(0.75),
    max: vals[vals.length - 1],
    mean: sum / vals.length,
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  // 1) 100+ 도달한 user id + level 한 번에. level 은 derive 결과에 없어서 같이 받음.
  const idRows = await db.execute(sql`
    SELECT
      user_id,
      COALESCE((value->>'level')::int, 0) AS level
    FROM saves_kv
    WHERE key = 'character.v2'
      AND COALESCE((value->>'level')::int, 0) >= 100
  `);
  const seeds = (idRows.rows as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    level: Number(r.level ?? 0),
  }));

  // 2) 각 유저별 derivePlayerCombatFromSaves 로 derived 전투 값 산출.
  // 표본이 작으니 직렬 await — 동시성 폭주 가드보다 단순함 우선.
  const rows: Row[] = [];
  for (const seed of seeds) {
    const combat = await derivePlayerCombatFromSaves(seed.userId);
    if (!combat) continue;
    rows.push({
      userId: seed.userId,
      level: seed.level,
      atk: combat.player.atk,
      def: combat.player.def,
      maxHp: combat.maxHp,
      critChancePct: combat.player.critChancePct ?? 0,
      critMult: combat.player.critMult ?? 0,
    });
  }

  // 3) 표본은 작을 가능성 높음 — raw rows 와 분포 통계 양쪽 다 응답.
  return Response.json({
    sampleSize: rows.length,
    rows,
    distribution: {
      level: pickStat(rows, "level"),
      atk: pickStat(rows, "atk"),
      def: pickStat(rows, "def"),
      maxHp: pickStat(rows, "maxHp"),
      critChancePct: pickStat(rows, "critChancePct"),
      critMult: pickStat(rows, "critMult"),
    },
  });
}
