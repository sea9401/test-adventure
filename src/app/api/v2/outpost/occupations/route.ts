import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";

// GET /api/v2/outpost/occupations — 모든 점령된 거점 상태 조회.
// 응답: { occupations: [{ outpostId, occupiedByUserId, occupiedByGuildId, occupiedAt, policy, taxRate }, ...] }
// row 없는 거점 = NPC 운영(비점령). 클라가 OUTPOSTS 데이터와 join 해서 표시.
//
// 인증 불필요 — 점령 상태는 공개 정보 (모든 유저가 지도에서 본다).

export async function GET() {
  const rows = await db
    .select()
    .from(outpostOccupations);
  return Response.json({
    occupations: rows.map((r) => ({
      outpostId: r.outpostId,
      occupiedByUserId: r.occupiedByUserId,
      occupiedByGuildId: r.occupiedByGuildId,
      occupiedAt: r.occupiedAt.toISOString(),
      policy: r.policy,
      taxRate: r.taxRate,
      nextAttackAt: r.nextAttackAt.toISOString(),
    })),
  });
}
