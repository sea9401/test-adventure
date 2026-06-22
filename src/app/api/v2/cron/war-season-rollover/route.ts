import { runWarSeasonRollover } from "@/lib/server/war/season";

// POST /api/v2/cron/war-season-rollover — 주간 전쟁 시즌 롤오버.
// 일 15:03 UTC = 월 00:03 KST. (npc-attacks 가 매시 정각이라 :03 으로 분 단위 충돌 회피.)
//
// 실제 동작은 runWarSeasonRollover 헬퍼 (lib/server/war/season.ts) — 관리자 수동
// 트리거(/api/admin/season-ops)와 공유. 멱등·경계-인식형이라 지연·재실행에 내성.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const summary = await runWarSeasonRollover(new Date());

  return Response.json({ ok: true, ...summary });
}
