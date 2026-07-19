// POST /api/profile/avatar — 폐기(410, 2026-06-12).
// 게임 중 초상화(외형) 변경 기능은 폐기됐다. 이 라우트는 v2 클라 호출처가 없던
// 휴면 무게이트 경로라 우회 차단 차원에서 닫아 둔다(재도입 시 git 히스토리 참조).
export async function POST() {
  return Response.json({ ok: false, error: "gone" }, { status: 410 });
}
