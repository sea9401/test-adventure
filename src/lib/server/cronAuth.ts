// 크론 전용 라우트 인증 — Authorization: Bearer <CRON_SECRET> 필수(EC2 crontab 이 헤더로 호출).
// 시크릿 미설정이면 전부 거부(fail-closed). 통과 시 null, 아니면 401 Response 를 돌려주므로
// 라우트는 `const unauthorized = requireCronAuth(req); if (unauthorized) return unauthorized;` 두 줄.
// env 는 호출 시점에 읽는다(빌드타임 고정 방지 — 기존 사다리들과 동일).
export function requireCronAuth(req: Request): Response | null {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
