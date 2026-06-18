import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { resetUserCharacterData } from "@/lib/server/resetCharacterData";

// POST /api/v2/dev/reset-me — 본인 데이터 wipe (staging dev 도구).
//
// 초기화 로직은 resetUserCharacterData(본인/관리자 공용 — admin reset-character 와 동일).
// 정리 범위·의도는 그 헬퍼 주석 참고(savesKv 전 키 + 1인 길드 해체/거점 해제, 계정 유지).
// 다음 mount 시 자동 캐릭 생성 흐름이 다시 돌아 깨끗한 새 캐릭 시작(무소속).
//
// 본문: { confirm: "RESET_MY_DATA" } — 우발적 호출 방지용 토큰.
// 라이브 prod 에선 IS_STAGING 게이트(staging 외 → 404).
export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.confirm !== "RESET_MY_DATA") {
    return Response.json(
      { ok: false, error: "missing_confirm" },
      { status: 400 },
    );
  }

  const result = await db.transaction((tx) =>
    resetUserCharacterData(tx, userId),
  );

  return Response.json({ ok: true, ...result });
}
