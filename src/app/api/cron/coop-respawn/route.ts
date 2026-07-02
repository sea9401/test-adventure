import { COOP_BOSSES } from "@/adventure/coop/data";
import { respawnCoopRegion } from "@/lib/server/coopRespawn";
import { requireCronAuth } from "@/lib/server/cronAuth";

// 매분 실행 — 모든 region 에 대해 만료/처치 정리 + nextSpawnAt 도달한 곳 spawn.
//
// 실제 정리/spawn 로직은 respawnCoopRegion 헬퍼 (lib/server/coopRespawn.ts) 에서
// 처리 — 같은 함수가 GET /api/coop/[region] 에서도 호출돼 self-healing. 두 경로
// 모두 partial uniqueIndex 가 동시성 막아줌.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  let expired = 0;
  let spawned = 0;
  for (const regionId of Object.keys(COOP_BOSSES)) {
    const r = await respawnCoopRegion(regionId);
    if (r.expiredId) expired += 1;
    if (r.spawnedId) spawned += 1;
  }

  return Response.json({ ok: true, expired, spawned });
}
