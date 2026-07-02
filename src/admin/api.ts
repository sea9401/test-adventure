// 관리자 API 공용 호출기 — 탭마다 복붙되던 fetch → json → ok 검사 → throw 패턴의
// 단일 지점 (게시판 bulletin/api.ts 선례). 토스트·결과 문구는 호출자 소관으로 남긴다.

/** GET — HTTP 오류를 `HTTP {status}` Error 로 승격하고 json 을 T 로 반환. */
export async function adminGet<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/**
 * {ok, error} envelope POST — HTTP 오류 또는 `ok !== true` 면 서버 error 코드를
 * message 로 throw. 성공 시 envelope 본문 전체를 T 로 반환.
 */
export async function adminPost<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & T)
    | null;
  if (!r.ok || j?.ok !== true) {
    throw new Error(j?.error ?? `HTTP ${r.status}`);
  }
  return j;
}
