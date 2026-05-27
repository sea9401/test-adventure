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
// 최근에 한 번 새로고침했으면 다시 안 한다. 옛 30s 였으나 staging 사용자가
// "다시 시도/새로고침 버튼 누르는 동안 cooldown 걸려 자동 reload 무효화" 사고로
// 10s 로 완화 (2026-05-28). 진짜 깨진 빌드면 10s 안에 재발생해 동일 가드 작동.
const RELOAD_COOLDOWN_MS = 10_000;

// sessionStorage 차단 환경 (프라이빗 모드 일부) 백업 — in-memory timestamp 도 같이
// 본다. 둘 중 가장 최근 reload 시점이 cooldown 기준.
let inMemoryLastReload = 0;

// 새 빌드를 받기 위해 1회 새로고침. 루프 가드에 걸려 건너뛰면 false 반환.
// console.warn 로그 — 자동 reload 가 작동했는지 / cooldown 가드에 걸렸는지 추적용.
export function reloadForStaleBuild(): boolean {
  if (typeof window === "undefined") return false;
  let lastReloadAt = inMemoryLastReload;
  try {
    const stored = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
    if (stored > lastReloadAt) lastReloadAt = stored;
  } catch {
    // sessionStorage 차단 — in-memory 값만 사용.
  }
  if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) {
    console.warn("[staleBuild] reload skipped — cooldown active");
    return false;
  }
  const now = Date.now();
  inMemoryLastReload = now;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {}
  console.warn("[staleBuild] auto-reloading for new build");
  window.location.reload();
  return true;
}

// 전역 에러/promise rejection 핸들러 등록. idempotent — 여러 곳에서 호출해도 1회만
// 설치된다. 1차 진입점은 instrumentation-client.ts (하이드레이션 전), 2차는 root
// layout 의 StaleBuildAutoReload 컴포넌트 (instrumentation-client 가 staging build
// 에 누락된 경우 백업).
//
// HMR/Next dev 에서 module 재로딩 시 module-level let 은 reset 되므로 globalThis
// sentinel 사용 — 한 페이지 세션 안에서 1회만 등록.
const STALE_BUILD_INSTALLED_KEY = "__staleBuildListenersInstalled";
type GlobalWithSentinel = typeof globalThis & {
  [STALE_BUILD_INSTALLED_KEY]?: boolean;
};

export function installStaleBuildAutoReload(): void {
  if (typeof window === "undefined") return;
  const g = globalThis as GlobalWithSentinel;
  if (g[STALE_BUILD_INSTALLED_KEY]) return;
  g[STALE_BUILD_INSTALLED_KEY] = true;
  window.addEventListener("error", (event) => {
    if (isStaleBuildError(event.error ?? event.message)) reloadForStaleBuild();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleBuildError(event.reason)) reloadForStaleBuild();
  });
}
