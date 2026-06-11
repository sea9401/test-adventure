"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePresenceHeartbeat } from "@/lib/usePresenceHeartbeat";
import type { HpBarState } from "@/adventure/v2/HpBar";
import { initialStamina, type StaminaState } from "@/adventure/v2/stamina";
import {
  OUTPOST_BY_ID,
  OUTPOSTS,
  START_OUTPOST_ID,
} from "@/adventure/data/v2/outposts";
import {
  shortestOutpostPath,
  seededDiscovery,
} from "@/adventure/data/v2/outpostGraph";
import { parseV2Class, V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import {
  parseV2Element,
  V2_ELEMENT_LABEL,
} from "@/adventure/data/v2/elements";
import { tierLevelCap } from "@/adventure/data/v2/proficiency";
import type { Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 신규/미방문 플레이어의 기본 현재 거점 — 인접 게이트의 부트스트랩 기준점.
const START_OUTPOST = OUTPOSTS.find((o) => o.id === START_OUTPOST_ID)!;

// 다중 홉 자동 이동에서 한 칸 진입 사이의 간격(ms) — 마커가 길을 "걸어가는" 느낌.
const TRAVEL_HOP_MS = 160;
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// 거점 금고 잔액 — occupations GET 동봉(gold>0 만).
export type TreasuryEntry = { outpostId: string; gold: number };

export type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
  // 거점 공성(성벽 HP) — 재생 반영 현재값. protectedUntil = 함락 후 보호막 만료 시각.
  fortHp: number;
  fortMaxHp: number;
  protectedUntil: string;
};

type GameStateValue = {
  // 신원/캐릭터
  viewerUserId: string | null;
  viewerGuildId: number | null;
  viewerName: string;
  accountName: string | null;
  viewerGender: Gender;
  viewerLevel: number;
  viewerLevelCap: number | null;
  viewerClass: string;
  viewerElement: string;
  playerSubtitle: string;
  // 세계 위치 + 자원
  currentOutpost: { id: string; name: string } | null;
  setCurrentOutpost: React.Dispatch<
    React.SetStateAction<{ id: string; name: string } | null>
  >;
  stamina: StaminaState;
  setStamina: React.Dispatch<React.SetStateAction<StaminaState>>;
  hp: HpBarState | null;
  setHp: React.Dispatch<React.SetStateAction<HpBarState | null>>;
  discoveredIds: Set<string>;
  setDiscoveredIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  occupations: Occupation[];
  // 금고 쌓인 거점(주로 미점령·NPC 세금) — 지도/거점 화면의 점령 유인 표시.
  treasuries: TreasuryEntry[];
  refreshOccupations: () => Promise<void>;
  refreshGuildId: () => Promise<void>;
  refreshGameState: () => Promise<void>;
  // 무한 프론티어 — 최고 도달 깊이(기본 2). 사냥터 목록·층 뷰에 전달.
  frontierDepth: number;
  setFrontierDepth: React.Dispatch<React.SetStateAction<number>>;
  // 네비게이션 부수효과 (거점 진입/이동 — visit-outpost POST + 라우팅)
  // opts.from — 거점 화면 뒤로가기 행선지 컨텍스트 (war=전쟁 허브, adventure=모험 홈,
  // 생략=길드 탭). /outpost/[id] 가 ?from= 으로 읽는다.
  enterOutpost: (outpost: Outpost, opts?: { from?: "war" | "adventure" }) => void;
  travelTo: (target: Outpost) => void;
};

const GameStateCtx = createContext<GameStateValue | null>(null);

export function useGameState(): GameStateValue {
  const ctx = useContext(GameStateCtx);
  if (!ctx) {
    throw new Error("useGameState must be used inside <GameStateProvider>");
  }
  return ctx;
}

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // enterOutpost 실패 롤백이 "사용자가 아직 그 거점 화면에 머무는가"를 판정하는 데 쓰는
  // pathname 거울(비동기 visit POST 완료 시점). 느린 POST 중 다른 화면으로 옮겼으면 안 끌어온다.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [treasuries, setTreasuries] = useState<TreasuryEntry[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  const [viewerName, setViewerName] = useState<string>("모험가");
  // 회원 탈퇴 확인 문구용 권위 닉네임(users.gameName). 보통 null → 모달 "탈퇴" 폴백.
  const [accountName, setAccountName] = useState<string | null>(null);
  const [viewerGender, setViewerGender] = useState<Gender>("male1");
  // 전투 장면 부제(레벨·직업·속성) 표기용 — me/state 에서 초기화.
  const [viewerLevel, setViewerLevel] = useState<number>(1);
  const [viewerLevelCap, setViewerLevelCap] = useState<number | null>(null);
  const [viewerClass, setViewerClass] = useState<string>("none");
  const [viewerElement, setViewerElement] = useState<string>("neutral");
  // 기본값 = 시작 거점(중앙 자유 도시). me/state 로드 시 저장된 현재 거점이 있으면 덮어쓴다.
  // null 로 두지 않아 인접 이동 게이트가 첫 화면부터 일관되게 동작한다.
  const [currentOutpost, setCurrentOutpost] = useState<
    { id: string; name: string } | null
  >(() => ({ id: START_OUTPOST.id, name: START_OUTPOST.name }));
  // 전역 stamina — me/state mount fetch 에서 초기화. 던전 hunt 응답 시 갱신.
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  // 발견(안개) — 공개된 거점 id 집합. me/state 에서 초기화, 이동 응답마다 확장.
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(
    () => new Set(seededDiscovery()),
  );
  // 무한 프론티어 최고 도달 깊이 — me/state 에서 초기화(기본 2), 도전 성공 시 갱신.
  const [frontierDepth, setFrontierDepth] = useState<number>(2);
  // 전역 HP — me/state mount fetch 에서 초기화, 사냥/전투 응답마다 갱신.
  const [hp, setHp] = useState<HpBarState | null>(null);

  // 접속자 등록 — 30초마다 POST /api/presence (서버가 이름/직업/칭호를 권위 해석, 클라값 무시).
  // ChatPanel 의 "접속 N명" 목록이 이걸로 채워진다. + 응답 buildVersion 불일치 시 옛 탭 자동 새로고침.
  usePresenceHeartbeat({ name: viewerName, className: viewerClass, title: null });

  const refreshOccupations = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/outpost/occupations");
      if (res.ok) {
        const json = (await res.json()) as {
          occupations: Occupation[];
          treasuries?: TreasuryEntry[];
        };
        setOccupations(json.occupations);
        setTreasuries(json.treasuries ?? []);
      }
    } catch {}
  }, []);

  // 소속 길드 id 갱신 — mount + 길드 변경(창단 등) 시. 무소속이면 null.
  const refreshGuildId = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/guild");
      if (res.ok) {
        const j = (await res.json()) as { guildId?: number | null } | null;
        setViewerGuildId(typeof j?.guildId === "number" ? j.guildId : null);
      }
    } catch {}
  }, []);

  const refreshGameState = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      if (res.ok) {
        const j = (await res.json()) as {
          character?: {
            name?: string;
            gender?: string;
            level?: number;
            class?: string;
            element?: string;
            hp?: number;
            maxHp?: number;
            stamina?: { current: number; lastUpdatedAt: number };
          };
          currentOutpost?: { id: string; name: string } | null;
          discoveredOutpostIds?: string[];
          accountName?: string | null;
          frontierDepth?: number;
          proficiency?: {
            groups?: Record<string, { tier?: number }>;
            current?: { group?: string };
          };
        } | null;
        if (j?.character?.name) setViewerName(j.character.name);
        setAccountName(j?.accountName ?? null);
        if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
        if (typeof j?.character?.level === "number")
          setViewerLevel(j.character.level);
        if (j?.character?.class) setViewerClass(j.character.class);
        if (j?.character?.element) setViewerElement(j.character.element);
        const currentGroup = j?.proficiency?.current?.group ?? "none";
        const currentTier =
          currentGroup === "none"
            ? null
            : (j?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
        setViewerLevelCap(
          currentTier == null ? null : tierLevelCap(currentTier),
        );
        if (j?.character?.stamina) {
          setStamina({
            current: j.character.stamina.current,
            lastUpdatedAt: j.character.stamina.lastUpdatedAt,
          });
        }
        if (
          typeof j?.character?.hp === "number" &&
          typeof j?.character?.maxHp === "number"
        ) {
          setHp({
            hp: j.character.hp,
            maxHp: j.character.maxHp,
            anchorMs: Date.now(),
          });
        }
        if (j?.currentOutpost) setCurrentOutpost(j.currentOutpost);
        if (j?.discoveredOutpostIds && j.discoveredOutpostIds.length > 0) {
          setDiscoveredIds(new Set(j.discoveredOutpostIds));
        }
        if (typeof j?.frontierDepth === "number") {
          setFrontierDepth(Math.max(2, j.frontierDepth));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState 라 cascading render 가 아니지만 린트는 호출 그래프만
    // 보고 발화(ServerFeedView 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOccupations();
    refreshGuildId();
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const j = (await res.json()) as { user?: { id?: string } } | null;
          if (j?.user?.id) setViewerUserId(j.user.id);
        }
      } catch {}
    })();
    void refreshGameState();
  }, [refreshOccupations, refreshGuildId, refreshGameState]);

  // 이동 요청 직렬화 — 직전 visit 이 끝나기 전 두 번째 이동을 막는다. 낙관적 위치와
  // 서버에 저장된 위치가 어긋나 두 번째 이동이 400 나는 레이스를 차단.
  const visitInFlightRef = useRef(false);

  // visit-outpost 응답의 stamina + discoveredOutpostIds 를 전역 상태에 반영.
  const applyVisitResult = useCallback((json: unknown) => {
    const j = json as {
      stamina?: { current?: number; lastUpdatedAt?: number };
      discoveredOutpostIds?: string[];
    } | null;
    if (
      j?.stamina &&
      typeof j.stamina.current === "number" &&
      typeof j.stamina.lastUpdatedAt === "number"
    ) {
      setStamina({
        current: j.stamina.current,
        lastUpdatedAt: j.stamina.lastUpdatedAt,
      });
    }
    if (j?.discoveredOutpostIds && j.discoveredOutpostIds.length > 0) {
      setDiscoveredIds(new Set(j.discoveredOutpostIds));
    }
  }, []);

  // 거점 진입 — 낙관적으로 위치를 바꾸고 거점 화면(`/outpost/[id]`)으로 라우팅한 뒤
  // visit-outpost 를 POST. 실패하면 위치를 되돌리고 직전 화면으로 router.back().
  // (방금 push 한 엔트리가 history 직전에 존재하므로 back 이 안전한 유일한 자리.)
  const enterOutpost = useCallback(
    (outpost: Outpost, opts?: { from?: "war" | "adventure" }) => {
      if (visitInFlightRef.current) return;
      const prevOutpost = currentOutpost;
      visitInFlightRef.current = true;
      setCurrentOutpost({ id: outpost.id, name: outpost.name });
      router.push(
        `/outpost/${outpost.id}${opts?.from ? `?from=${opts.from}` : ""}`,
      );
      void (async () => {
        let ok = false;
        try {
          const res = await fetch("/api/v2/me/visit-outpost", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ outpostId: outpost.id }),
          });
          ok = res.ok;
          const j = await res.json().catch(() => null);
          // 성공·거부 무관하게 응답에 담긴 stamina(거부 시)·discovered(성공 시)를 반영.
          applyVisitResult(j);
        } catch {
          ok = false; // 네트워크 오류도 실패로 — 아래에서 롤백.
        } finally {
          visitInFlightRef.current = false;
        }
        if (!ok) {
          // 서버 거부(인접 위반 등) 또는 네트워크 오류 → 이동 직전의 위치로 롤백.
          setCurrentOutpost(prevOutpost);
          // 화면 롤백은 사용자가 아직 그 거점 화면에 머물 때만. POST 가 느린 사이 다른
          // 탭으로 옮겼다면 router.back() 이 방금 push 한 entry 가 아닌 엉뚱한 곳으로
          // 가므로 건드리지 않는다(위치만 조용히 되돌림). 머물러 있으면 직전(=push 직전의
          // 지도/모험 화면)으로 back.
          if (pathnameRef.current === `/outpost/${outpost.id}`) {
            router.back();
          }
        }
      })();
    },
    [currentOutpost, router, applyVisitResult],
  );

  // 다중 홉 자동 이동 — 현재 거점에서 목적지까지 최단 경로를 따라 한 칸씩 순차 진입한다.
  // 워프가 아니라 길을 "걸어가는" 것: 홉마다 currentOutpost(마커)만 갱신하고 지도에 머문다.
  // 거점 화면은 열지 않는다(연속 이동 편의 — 한 칸씩 옮길 때 매번 지도 다시 안 켜도 됨).
  // 거점 진입은 모험 탭 「거점 진입」 또는 지도에서 현재 거점 「둘러보기」로.
  const travelTo = useCallback(
    (target: Outpost) => {
      if (visitInFlightRef.current) return;
      const startId = currentOutpost?.id ?? START_OUTPOST_ID;
      if (startId === target.id) return; // 이미 그 거점 — 이동 없음.
      // 발견된 거점만 거쳐가는 최단 경로(안개 게이트). 목적지가 미발견이면 경로 없음.
      const path = shortestOutpostPath(startId, target.id, discoveredIds);
      if (!path || path.length < 2) return; // 미발견/미연결(방어).
      visitInFlightRef.current = true;
      void (async () => {
        try {
          for (let i = 1; i < path.length; i += 1) {
            const stepId = path[i];
            const res = await fetch("/api/v2/me/visit-outpost", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ outpostId: stepId }),
            });
            const j = await res.json().catch(() => null);
            applyVisitResult(j);
            // 막히면(인접 위반·스태미나 부족·네트워크) 도달한 지점에서 멈춘다(부분 이동 유효).
            if (!res.ok) break;
            const o = OUTPOST_BY_ID.get(stepId);
            if (o) setCurrentOutpost({ id: o.id, name: o.name });
            if (i < path.length - 1) await delay(TRAVEL_HOP_MS);
          }
        } catch {
          // 네트워크 오류 — 도달한 지점에서 멈춘다.
        } finally {
          visitInFlightRef.current = false;
        }
        // 거점 화면으로 이동하지 않는다 — 마커만 옮기고 지도에 머문다.
      })();
    },
    [currentOutpost, discoveredIds, applyVisitResult],
  );

  // 전투 장면 플레이어 부제 — "Lv.42 · 견습 검사 · 무속성". 레벨·직업·속성 간단 표기.
  const playerLevelText = viewerLevelCap
    ? `Lv ${viewerLevel} / ${viewerLevelCap}`
    : `Lv.${viewerLevel}`;
  const playerSubtitle = `${playerLevelText} · ${
    V2_CLASS_DEFS[parseV2Class(viewerClass)].name
  } · ${V2_ELEMENT_LABEL[parseV2Element(viewerElement)]}`;

  const value: GameStateValue = {
    viewerUserId,
    viewerGuildId,
    viewerName,
    accountName,
    viewerGender,
    viewerLevel,
    viewerLevelCap,
    viewerClass,
    viewerElement,
    playerSubtitle,
    currentOutpost,
    setCurrentOutpost,
    stamina,
    setStamina,
    hp,
    setHp,
    discoveredIds,
    setDiscoveredIds,
    occupations,
    treasuries,
    refreshOccupations,
    refreshGuildId,
    refreshGameState,
    frontierDepth,
    setFrontierDepth,
    enterOutpost,
    travelTo,
  };

  return (
    <GameStateCtx.Provider value={value}>{children}</GameStateCtx.Provider>
  );
}
