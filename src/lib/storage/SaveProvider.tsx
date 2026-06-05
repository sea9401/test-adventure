"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { signOut } from "next-auth/react";
import {
  attachUnloadFlush,
  createRemoteSave,
  type RemoteSave,
} from "./remote";
import { MultiTabOverlay } from "./MultiTabGuard";
import { SYNCED_KEYS, type SyncedKey } from "./synced-keys";
import { getOrCreateDeviceSessionId } from "./deviceSession";

// 옛 localStorage→서버 마이그레이션 마커 — 더 이상 사용하지 않지만 정의는 남겨 두어
// 이전 코드가 박은 흔적을 정리하는 데 활용한다 (bootstrap 에서 keys 함께 제거).
const MIGRATION_MARKER_KEY = "migrated.v2";

type SaveData = Partial<Record<SyncedKey, unknown>>;

type ProviderState =
  | { status: "loading" }
  | { status: "ready"; data: SaveData; remote: RemoteSave }
  | { status: "error"; err: string }
  | { status: "session-expired" }
  | { status: "session-invalidated" };

const SaveCtx = createContext<{
  initial: SaveData;
  remote: RemoteSave;
} | null>(null);

// 디바이스 단위 영속 세션 ID. 같은 디바이스에선 reload / 새 탭 / 컴퓨터 재시작에도
// 디바이스 세션 ID 로직은 deviceSession.ts 로 분리 — 자동 사냥 등 다른 변경성 엔드포인트도
// 같은 토큰을 헤더로 동봉해야 단일 세션 보호망에 들어가서.

export function SaveProvider({
  children,
  starters,
}: {
  children: React.ReactNode;
  // 서버에 해당 키가 없을 때 부트스트랩에서 시드. 신규 유저의 클라 default 가 서버에
  // 박히지 않는 문제(useRemotePatch 의 first-mount skip) 차단용. localStorage 마이그레이션
  // 값이 있으면 그쪽이 우선 — starter 는 진짜 둘 다 비었을 때만.
  starters?: Partial<Record<SyncedKey, unknown>>;
}) {
  const [state, setState] = useState<ProviderState>({ status: "loading" });
  const remoteRef = useRef<RemoteSave | null>(null);
  // 부트스트랩 effect 는 한 번만 실행 (deps []) — starters 도 mount 시점 값만 보면 충분.
  // useRef 의 initial argument 가 그 스냅샷 역할 (이후 prop 변경은 무시).
  const startersAtMountRef = useRef(starters);

  useEffect(() => {
    const sessionId = getOrCreateDeviceSessionId();
    const remote = createRemoteSave({ sessionId });
    remoteRef.current = remote;
    const detach = attachUnloadFlush(remote);

    let cancelled = false;
    (async () => {
      try {
        // 1) 이 디바이스를 활성 세션으로 claim. 다른 디바이스의 다음 호출은 410.
        //    실패해도 (네트워크 등) 진행 — 첫 GET 도 헤더는 보내니 다른 디바이스가
        //    먼저 claim 한 상태면 그 GET 이 410 으로 바로 처리됨.
        try {
          await fetch("/api/session/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
        } catch {}
        if (cancelled) return;

        const { data: serverData, versions } = await remote.loadAll();
        if (cancelled) return;
        remote.seedVersions(versions);

        // 부트스트랩 시드 — 서버에 없는 키에 starter defaults 만 박는다.
        // 옛 localStorage→서버 마이그레이션 로직은 2026-05-16 Neon→RDS 컷오버 이후
        // 제거 — 빈 DB 에 잔존 localStorage 가 다시 push 되어 유저별 형평성이 깨지는
        // 문제 방지. 동시에 디바이스에 남아 있는 옛 synced 키도 정리 (가벼운 cleanup
        // — 다른 코드 경로가 직접 읽지는 않지만 잠재적 누수 차단).
        if (typeof window !== "undefined") {
          for (const key of SYNCED_KEYS) {
            try {
              localStorage.removeItem(key);
            } catch {}
          }
          try {
            localStorage.removeItem(MIGRATION_MARKER_KEY);
          } catch {}
        }

        let final: SaveData = serverData;
        const toSeed: SaveData = {};

        // starter — 서버에 없는 키만. 신규 유저의 클라 default (character.v2 의 gold 10 등)
        // 가 useRemotePatch 의 first-mount skip 으로 영영 안 박히던 문제 차단용.
        // 매 마운트 idempotent — 서버에 이미 있으면 skip.
        const starterMap = startersAtMountRef.current ?? {};
        for (const [key, value] of Object.entries(starterMap)) {
          const k = key as SyncedKey;
          if (serverData[k] !== undefined) continue;
          toSeed[k] = value;
        }

        if (Object.keys(toSeed).length > 0) {
          for (const [k, v] of Object.entries(toSeed)) {
            remote.patch(k as SyncedKey, v);
          }
          try {
            await remote.flush();
            final = { ...serverData, ...toSeed };
          } catch {
            // 부분 실패 — 미전송 키는 이후 사용자 액션 시 자연스레 재시도된다.
          }
        }

        setState({ status: "ready", data: final, remote });
      } catch (e) {
        if (cancelled) return;
        // 401(만료/무효 로그인) · 410(다른 디바이스 claim) 은 reload 로는 못 푼다 —
        // 인증 쿠키가 그대로라 같은 응답이 무한 반복된다("계속 접속 안 됨"). 전용
        // 화면으로 보내 재로그인(=쿠키 교체)을 유도. loadAll 이 throw 전에 remote
        // status 를 세팅하므로 메시지 문자열 매칭 대신 그걸로 분기한다.
        const kind = remote.status().kind;
        if (kind === "session-expired") {
          setState({ status: "session-expired" });
          return;
        }
        if (kind === "session-invalidated") {
          setState({ status: "session-invalidated" });
          return;
        }
        setState({
          status: "error",
          err: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    // 낙관적 동시성 충돌 — 다른 탭/기기가 server 를 갱신해 이 탭의 expectedVersion 이
    // 어긋남. 메모리 state 를 신뢰할 수 없으니 reload 로 fresh server 데이터 다시 로드.
    //
    // 일관성 우선 — reload 전에 살아남은 키를 flushSync 하지 *않는다*. 예전엔 충돌 안 난
    // 키들을 keepalive 로 발사했지만, 그러면 "살아남은 키 = 이 디바이스 값 / 폐기된 키 =
    // 서버 값" 으로 한 캐릭터 상태가 두 디바이스 값으로 찢어진다 (예: 인벤토리엔 새 드롭이
    // 있는데 그걸 산 골드는 옛날값으로 롤백). 그냥 reload → loadAll() 로 모든 키를 서버
    // 기준 + 각 hook 의 localStorage-merge 경로로 일괄 채택하는 게 coherent. 손실은 "마지막
    // 성공 sync 이후 이 디바이스가 한 것" 으로 한정 — 이게 멀티 디바이스 충돌의 정확한 의미론.
    //
    // session-invalidated — 다른 디바이스가 새 세션 claim 함. 이 디바이스의 PATCH 는
    // 이제 항상 410. Clerk signOut + 안내 화면. flushSync 안 함 (어차피 410).
    const unsubscribe = remote.subscribe((s) => {
      if (s.kind === "stale" && typeof window !== "undefined") {
        // droppedKeys 가 있으면 (409 한도 초과로 폐기된 변경) 어떤 데이터가
        // 영향받았는지 사용자에게 알린다.
        const dropped = s.droppedKeys ?? [];
        const message =
          dropped.length > 0
            ? `다른 기기/탭의 진행과 충돌해 서버 기준으로 다시 불러왔습니다. 이 기기의 최근 변경 일부(${dropped.join(", ")})는 반영되지 않았을 수 있습니다.`
            : "다른 기기/탭에서 갱신을 감지해 새로 불러왔습니다.";
        try {
          localStorage.setItem("pending-reload-toast.v1", message);
        } catch {}
        window.location.reload();
      }
      if (s.kind === "session-expired") {
        // 플레이 중 PATCH 가 401 — 로그인 세션이 만료/무효해졌다. reload 로는 못 푸니
        // 전용 화면에서 재로그인 유도. 못 보낸 큐는 remote 가 보존(재로그인 후 재시도).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ status: "session-expired" });
      }
      if (s.kind === "session-invalidated") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ status: "session-invalidated" });
      }
    });

    return () => {
      cancelled = true;
      detach?.();
      unsubscribe();
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          데이터 불러오는 중...
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="max-w-sm text-center">
          <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            데이터를 불러오지 못했습니다
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {state.err}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (state.status === "session-expired") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="max-w-sm text-center">
          <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            로그인 세션이 만료됐습니다
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            로그인 정보가 만료됐거나 더 이상 유효하지 않습니다. 다시 로그인하면 이어서
            플레이할 수 있습니다.
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut({ redirectTo: "/sign-in" });
            } catch {}
            window.location.href = "/sign-in";
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          다시 로그인
        </button>
      </div>
    );
  }

  if (state.status === "session-invalidated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="max-w-sm text-center">
          <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            다른 디바이스에서 로그인됐습니다
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            동시 접속을 막기 위해 이 세션은 종료됩니다. 이 디바이스에서 계속 플레이하려면
            로그아웃 후 다시 로그인하세요.
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut({ redirectTo: "/sign-in" });
            } catch {}
            window.location.href = "/sign-in";
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <SaveCtx.Provider value={{ initial: state.data, remote: state.remote }}>
      {children}
      <MultiTabOverlay />
    </SaveCtx.Provider>
  );
}

// hook — Context 에서 특정 키의 초기값 꺼내옴. 마운트 시 한 번만 의미가 있음.
export function useSavedValue<T = unknown>(key: SyncedKey): T | undefined {
  const ctx = useContext(SaveCtx);
  if (!ctx) {
    throw new Error("useSavedValue must be used inside <SaveProvider>");
  }
  return ctx.initial[key] as T | undefined;
}

// hook — 변경 사항을 서버로 보낼 때 사용.
export function useRemoteSave(): RemoteSave {
  const ctx = useContext(SaveCtx);
  if (!ctx) {
    throw new Error("useRemoteSave must be used inside <SaveProvider>");
  }
  return ctx.remote;
}
