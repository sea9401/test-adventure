// 재배포로 구버전 탭이 깨질 때 자가 복구하는 공유 로직.
//
// 이 게임은 자동사냥 등으로 탭을 오래 켜두는데, main 머지마다 도는 자동 배포가 buildId·청크
// 해시·서버액션 ID 를 바꾸면 열려 있던 탭이 다음 동작에서 깨진다 (ChunkLoadError 로 청크
// 로드 실패, 또는 "Failed to find Server Action" 으로 액션 ID 불일치). 그런 에러를 만나면
// 새 빌드를 받기 위해 새로고침하는 게 정답 — 페이지는 이미 깨진 상태라 잃을 게 없다.
//
// 주의: prod 빌드는 React 가 잡은 에러 메시지를 redact 하므로 "Failed to find Server Action"
// 문자열은 클라에서 신뢰할 수 없다. ChunkLoadError 는 클라가 던져 name 이 보존된다.
// 그래서 stale 탭 자체를 막는 1차 방어는 VersionCheck 의 능동 새로고침(탭 숨김 시)이고,
// 이쪽은 그래도 깨진 경우의 반응형 백스톱이다.

export const STALE_BUILD_ERROR_RE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Failed to find Server Action/i;

export function isStaleBuildError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "ChunkLoadError") return true;
  const msg = typeof err === "string" ? err : (e.message ?? "");
  return STALE_BUILD_ERROR_RE.test(msg);
}

const RELOAD_GUARD_KEY = "stale-build-reload-at";
// 새로고침해도 같은 에러가 또 나면(진짜 깨진 배포 — stale 가 아님) 무한 reload 루프를 돈다.
// 최근에 한 번 새로고침했으면 다시 안 한다.
const RELOAD_COOLDOWN_MS = 30_000;

// 새 빌드를 받기 위해 1회 새로고침. 루프 가드에 걸려 건너뛰면 false 반환.
export function reloadForStaleBuild(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage 불가(프라이빗 모드 등) — 가드 없이도 1회 reload 가 낫다.
  }
  window.location.reload();
  return true;
}
