"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";
import {
  V2CharacterMenu,
  type CharacterAction,
} from "@/adventure/v2/V2CharacterMenu";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";
import { V2CodexView } from "@/adventure/v2/V2CodexView";
import { V2CultivationView } from "@/adventure/v2/V2CultivationView";
import { V2GuildHallView } from "@/adventure/v2/V2GuildHallView";
import { V2HealingView } from "@/adventure/v2/V2HealingView";
import { V2PlaceholderView } from "@/adventure/v2/V2PlaceholderView";
import { V2SkillLearnView } from "@/adventure/v2/V2SkillLearnView";
import { V2SparringView } from "@/adventure/v2/V2SparringView";
import { V2ShopView } from "@/adventure/v2/V2ShopView";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { TabBar } from "@/components/ui/TabBar";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";
import { V2ArenaView } from "@/adventure/v2/V2ArenaView";
import { V2BattleHome, type BattleAction } from "@/adventure/v2/V2BattleHome";
import { V2DungeonList } from "@/adventure/v2/V2DungeonList";
import { V2DungeonFloorView } from "@/adventure/v2/V2DungeonFloorView";
import { V2GuildHome } from "@/adventure/v2/V2GuildHome";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import type { HpBarState } from "@/adventure/v2/HpBar";
import { initialStamina, type StaminaState } from "@/adventure/v2/stamina";
import { OUTPOSTS, START_OUTPOST_ID } from "@/adventure/data/v2/outposts";
import {
  shortestOutpostPath,
  seededDiscovery,
} from "@/adventure/data/v2/outpostGraph";
import { parseV2Class, V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import {
  parseV2Element,
  V2_ELEMENT_LABEL,
} from "@/adventure/data/v2/elements";
import type {
  DungeonFloorId,
  Outpost,
  OutpostType,
} from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 현 위치 거점의 종류 → 탭 배경 이미지. id 로 type 을 역참조.
const OUTPOST_TYPE_BY_ID = new Map<string, OutpostType>(
  OUTPOSTS.map((o) => [o.id, o.type]),
);
// 신규/미방문 플레이어의 기본 현재 거점 — 인접 게이트의 부트스트랩 기준점.
const START_OUTPOST = OUTPOSTS.find((o) => o.id === START_OUTPOST_ID)!;
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o] as const));

// 다중 홉 자동 이동에서 한 칸 진입 사이의 간격(ms) — 마커가 길을 "걸어가는" 느낌.
const TRAVEL_HOP_MS = 160;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// 배경을 깔 탭 — 모험/마을/캐릭터. 전투·길드는 추후 별도 이미지 예정.
const BG_TABS = new Set<TabId>(["adventure", "town", "character"]);

// 현 위치 거점 종류별 배경. ui/{type}.webp 가 있으면 사용, 없으면(아직 미발주) village 로 폴백.
// 경로를 템플릿으로 둬서 check-images 누락 검사에 안 걸린다(파일 없어도 빌드 OK).
// 런타임에 404 면 onError 로 village 로 교체. type 이 바뀌면 부모가 key 로 remount → errored 리셋.
function OutpostBackground({ type }: { type: OutpostType }) {
  const [errored, setErrored] = useState(false);
  const src = errored ? "/images/ui/village.webp" : `/images/ui/${type}.webp`;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-zinc-50/85 dark:bg-zinc-950/80" />
    </div>
  );
}

// v2 게임 흐름 — 5탭(모험·전투·마을·캐릭터·길드) 기반 nav.
// 모험: placeholder
// 전투: sub-tab(던전·지도) — 던전 사냥 + 대륙 지도 + 거점 진입
// 마을: 마을 home(default)/수행(shrine)/치료소/상점/학습(training)/대장간
// 캐릭터: 메뉴(default)/내정보/인벤토리/스킬/장비 — 내정보 안의 슬롯 클릭으로 장비 진입
// 길드: 길드 home

type TabId = "adventure" | "battle" | "town" | "character" | "guild";

const TABS: { key: TabId; label: string }[] = [
  { key: "adventure", label: "모험" },
  { key: "battle", label: "전투" },
  { key: "town", label: "마을" },
  { key: "character", label: "캐릭터" },
  { key: "guild", label: "길드" },
];

export type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
};

type View =
  | { kind: "adventure" }
  | { kind: "arena" }
  | { kind: "battle" }
  | { kind: "dungeons" }
  | { kind: "battle-floor"; floorId: DungeonFloorId }
  | { kind: "town" }
  | { kind: "shrine" }
  | { kind: "healing" }
  | { kind: "shop" }
  | { kind: "training" }
  | { kind: "sparring" }
  | { kind: "smithy" }
  | { kind: "guild-hall" }
  | { kind: "character" }
  | { kind: "character-info" }
  | { kind: "inventory" }
  | { kind: "codex" }
  | { kind: "guild" }
  | { kind: "map" }
  | { kind: "outpost"; outpost: Outpost };

function tabOfView(view: View): TabId {
  switch (view.kind) {
    case "adventure":
      return "adventure";
    case "battle":
    case "dungeons":
    case "battle-floor":
    case "map":
    case "outpost":
    case "arena":
      return "battle";
    case "town":
    case "shrine":
    case "healing":
    case "shop":
    case "training":
    case "sparring":
    case "smithy":
    case "guild-hall":
      return "town";
    case "character":
    case "character-info":
    case "inventory":
    case "codex":
      return "character";
    case "guild":
      return "guild";
  }
}

function defaultViewOfTab(tab: TabId): View {
  switch (tab) {
    case "adventure":
      return { kind: "adventure" };
    case "battle":
      return { kind: "battle" };
    case "town":
      return { kind: "town" };
    case "character":
      return { kind: "character" };
    case "guild":
      return { kind: "guild" };
  }
}

export function V2GameFlow() {
  // 첫 시작 탭 — adventure (모험). 사용자가 진입 즉시 사냥/거점 흐름으로 안내.
  const [view, setView] = useState<View>(() => defaultViewOfTab("adventure"));
  // 최신 view 를 비동기(다중 홉 이동) 완료 시점에 읽기 위한 거울. 이동 중 사용자가
  // 다른 탭으로 옮겼으면 도착 시 거점 화면으로 강제 전환하지 않기 위함.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  const [viewerName, setViewerName] = useState<string>("모험가");
  const [viewerGender, setViewerGender] = useState<Gender>("male1");
  // 전투 장면 부제(레벨·직업·속성) 표기용 — me/state 에서 초기화.
  const [viewerLevel, setViewerLevel] = useState<number>(1);
  const [viewerClass, setViewerClass] = useState<string>("none");
  const [viewerElement, setViewerElement] = useState<string>("neutral");
  // 기본값 = 시작 거점(선더홀드). me/state 로드 시 저장된 현재 거점이 있으면 덮어쓴다.
  // null 로 두지 않아 인접 이동 게이트가 첫 화면부터 일관되게 동작한다.
  const [currentOutpost, setCurrentOutpost] = useState<
    { id: string; name: string } | null
  >(() => ({ id: START_OUTPOST.id, name: START_OUTPOST.name }));
  // 전역 stamina — me/state mount fetch 에서 초기화. 던전 hunt 응답 시 갱신.
  // nav 아래 sticky StaminaBar 가 표시 (모든 탭에서 동일).
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  // 발견(안개) — 공개된 거점 id 집합. me/state 에서 초기화, 이동 응답마다 확장.
  // 기본값 = 시작 거점+인접(로드 전에도 일관 동작).
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(
    () => new Set(seededDiscovery()),
  );
  // 전역 HP — me/state mount fetch 에서 초기화, 사냥/전투 응답마다 갱신.
  // null = 아직 미로딩. 로딩 후 사냥 게이트 동작 + 일괄 사냥 결과 밑 HP 바 표시 (서버가 최종 권위).
  const [hp, setHp] = useState<HpBarState | null>(null);

  const refreshOccupations = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/outpost/occupations");
      if (res.ok) {
        const json = (await res.json()) as { occupations: Occupation[] };
        setOccupations(json.occupations);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshOccupations();
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const j = (await res.json()) as { user?: { id?: string } } | null;
          if (j?.user?.id) setViewerUserId(j.user.id);
        }
      } catch {}
    })();
    (async () => {
      try {
        const res = await fetch("/api/v2/me/guild");
        if (res.ok) {
          const j = (await res.json()) as { guildId?: number | null } | null;
          // 무소속이면 null — 상태 그대로 두면 점령/거점 UI 가 적절히 비활성화.
          if (typeof j?.guildId === "number") setViewerGuildId(j.guildId);
        }
      } catch {}
    })();
    (async () => {
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
          } | null;
          if (j?.character?.name) setViewerName(j.character.name);
          if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
          if (typeof j?.character?.level === "number")
            setViewerLevel(j.character.level);
          if (j?.character?.class) setViewerClass(j.character.class);
          if (j?.character?.element) setViewerElement(j.character.element);
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
        }
      } catch {}
    })();
  }, [refreshOccupations]);

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

  const enterOutpost = useCallback(
    (outpost: Outpost) => {
      if (visitInFlightRef.current) return;
      const prevOutpost = currentOutpost;
      const prevView = view;
      visitInFlightRef.current = true;
      setCurrentOutpost({ id: outpost.id, name: outpost.name });
      setView({ kind: "outpost", outpost });
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
          // 서버 거부(인접 위반 등) 또는 네트워크 오류 → 이동 직전의 위치·화면으로 롤백.
          setCurrentOutpost(prevOutpost);
          setView(prevView);
        }
      })();
    },
    [currentOutpost, view, applyVisitResult],
  );

  // 다중 홉 자동 이동 — 현재 거점에서 목적지까지 최단 경로를 따라 한 칸씩 순차 진입한다.
  // 워프가 아니라 길을 "걸어가는" 것: 각 홉마다 서버가 인접을 검증하고(경로가 인접 엣지만
  // 따르므로 매번 통과), 마커가 한 칸씩 전진한 뒤 도착지 화면을 연다. 인접이면 1홉.
  const travelTo = useCallback(
    (target: Outpost) => {
      if (visitInFlightRef.current) return;
      const startId = currentOutpost?.id ?? START_OUTPOST_ID;
      if (startId === target.id) {
        setView({ kind: "outpost", outpost: target });
        return;
      }
      // 발견된 거점만 거쳐가는 최단 경로(안개 게이트). 목적지가 미발견이면 경로 없음.
      const path = shortestOutpostPath(startId, target.id, discoveredIds);
      if (!path || path.length < 2) return; // 미발견/미연결(방어).
      visitInFlightRef.current = true;
      void (async () => {
        let reachedId = startId;
        try {
          for (let i = 1; i < path.length; i += 1) {
            const stepId = path[i];
            const res = await fetch("/api/v2/me/visit-outpost", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ outpostId: stepId }),
            });
            const j = await res.json().catch(() => null);
            // 성공이면 stamina+discovered, 거부(out_of_stamina 등)면 갱신된 stamina 만이라도
            // 반영해 화면이 stale 하지 않게 한다.
            applyVisitResult(j);
            // 막히면(인접 위반·스태미나 부족·네트워크) 도달한 지점에서 멈춘다(부분 이동 유효).
            if (!res.ok) break;
            reachedId = stepId;
            const o = OUTPOST_BY_ID.get(stepId);
            if (o) setCurrentOutpost({ id: o.id, name: o.name });
            if (i < path.length - 1) await delay(TRAVEL_HOP_MS);
          }
        } catch {
          // 네트워크 오류 — 도달한 지점에서 멈춘다.
        } finally {
          visitInFlightRef.current = false;
        }
        // 한 칸이라도 이동했고, 사용자가 아직 지도를 보고 있으면 도달한 거점 화면을 연다.
        // (이동 중 다른 탭으로 옮겼으면 강제로 끌어오지 않는다.)
        const reached = OUTPOST_BY_ID.get(reachedId);
        if (reachedId !== startId && reached && viewRef.current.kind === "map") {
          setView({ kind: "outpost", outpost: reached });
        }
      })();
    },
    [currentOutpost, discoveredIds, applyVisitResult],
  );

  const handleTabSelect = (tab: TabId) => {
    setView(defaultViewOfTab(tab));
  };

  const handleTownAction = (action: TownAction) => {
    switch (action.kind) {
      case "open-shrine":
        setView({ kind: "shrine" });
        break;
      case "open-healing":
        setView({ kind: "healing" });
        break;
      case "open-shop":
        setView({ kind: "shop" });
        break;
      case "open-training":
        setView({ kind: "training" });
        break;
      case "open-smithy":
        setView({ kind: "smithy" });
        break;
      case "open-guild-hall":
        setView({ kind: "guild-hall" });
        break;
    }
  };

  // OutpostView 의 enter-dungeon 은 폐기 (사용자 의도 — 사냥터를 전투 탭으로 이동).
  // 그 외 action (back/claimed/harvested) 만 처리.
  const handleOutpostAction = (action: {
    kind: "back" | "enter-dungeon" | "claimed" | "harvested";
  }) => {
    if (view.kind !== "outpost") return;
    if (action.kind === "back") setView({ kind: "map" });
    if (action.kind === "claimed" || action.kind === "harvested") {
      refreshOccupations();
    }
  };

  const currentTab = tabOfView(view);
  // 전투 장면 플레이어 부제 — "Lv.42 · 견습 검사 · 무속성". 레벨·직업·속성 간단 표기.
  const playerSubtitle = `Lv.${viewerLevel} · ${
    V2_CLASS_DEFS[parseV2Class(viewerClass)].name
  } · ${V2_ELEMENT_LABEL[parseV2Element(viewerElement)]}`;
  // 현 위치 거점의 종류 — 배경 이미지 선택용. 거점 밖이면 village 로 취급.
  const currentOutpostType: OutpostType = currentOutpost
    ? (OUTPOST_TYPE_BY_ID.get(currentOutpost.id) ?? "village")
    : "village";

  return (
    <div>
      <V2TopBar currentOutpost={currentOutpost} />
      {/* 탭 배경 — 현 위치 거점 종류별 이미지 (모험/마을/캐릭터). 전투·길드는 추후. */}
      {BG_TABS.has(currentTab) && (
        <OutpostBackground key={currentOutpostType} type={currentOutpostType} />
      )}
      <div>
        <TabBar
          tabs={TABS}
          active={currentTab}
          onChange={handleTabSelect}
          ariaLabel="메인 탭"
          size="lg"
          variant="highlight"
          className="mx-auto w-full max-w-[720px] px-4 sm:px-6"
        />
        {(currentTab === "adventure" ||
          (currentTab === "battle" &&
            view.kind !== "map" &&
            view.kind !== "outpost")) && (
          <div className="mx-auto w-full max-w-[720px] space-y-2 px-4 py-2 sm:px-6">
            <StaminaBar state={stamina} />
          </div>
        )}

      {/* === 모험 탭 === */}
      {view.kind === "adventure" && (
        <V2AdventureHome
          currentOutpost={currentOutpost}
          onEnterOutpost={enterOutpost}
        />
      )}

      {/* === 전투 탭 === */}
      {view.kind === "battle" && (
        <V2BattleHome
          onAction={(action: BattleAction) => {
            if (action.kind === "open-dungeons") setView({ kind: "dungeons" });
            else if (action.kind === "open-map") setView({ kind: "map" });
            else if (action.kind === "open-arena") setView({ kind: "arena" });
          }}
        />
      )}
      {view.kind === "arena" && (
        <V2ArenaView onBack={() => setView({ kind: "battle" })} />
      )}
      {view.kind === "dungeons" && (
        <V2DungeonList
          currentOutpost={currentOutpost}
          onSelectFloor={(floorId) => setView({ kind: "battle-floor", floorId })}
          onOpenMap={() => setView({ kind: "map" })}
        />
      )}
      {view.kind === "battle-floor" && currentOutpost && (
        <V2DungeonFloorView
          floorId={view.floorId}
          outpostId={currentOutpost.id}
          outpostName={currentOutpost.name}
          playerName={viewerName}
          playerGender={viewerGender}
          playerSubtitle={playerSubtitle}
          stamina={stamina}
          setStamina={setStamina}
          hp={hp}
          setHp={setHp}
          onSeekHealing={() => setView({ kind: "healing" })}
          onBack={() => setView({ kind: "dungeons" })}
        />
      )}
      {view.kind === "battle-floor" && !currentOutpost && (
        // 거점이 사라진 사고용 안전 — 자동 dungeons 로 복귀.
        <V2DungeonList
          currentOutpost={null}
          onSelectFloor={() => {}}
          onOpenMap={() => setView({ kind: "map" })}
        />
      )}

      {/* === 마을 탭 === */}
      {view.kind === "town" && <V2TownHome onAction={handleTownAction} />}
      {view.kind === "shrine" && (
        <V2CultivationView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "healing" && (
        <V2HealingView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "shop" && (
        <V2ShopView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "training" && (
        <V2SkillLearnView
          onBack={() => setView({ kind: "town" })}
          onStartSparring={() => setView({ kind: "sparring" })}
        />
      )}
      {view.kind === "sparring" && (
        <V2SparringView
          playerName={viewerName}
          gender={viewerGender}
          playerSubtitle={playerSubtitle}
          onBack={() => setView({ kind: "training" })}
        />
      )}
      {view.kind === "smithy" && (
        <V2PlaceholderView
          title="대장간"
          onBack={() => setView({ kind: "town" })}
        />
      )}

      {/* === 캐릭터 탭 === */}
      {view.kind === "character" && (
        <V2CharacterMenu
          onAction={(a: CharacterAction) => {
            switch (a.kind) {
              case "open-info":
                setView({ kind: "character-info" });
                break;
              case "open-inventory":
                setView({ kind: "inventory" });
                break;
              case "open-codex":
                setView({ kind: "codex" });
                break;
            }
          }}
        />
      )}
      {view.kind === "character-info" && (
        <V2CharacterScreen onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "inventory" && (
        <V2InventoryView onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "codex" && (
        <V2CodexView onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "guild-hall" && (
        <V2GuildHallView onBack={() => setView({ kind: "town" })} />
      )}

      {/* === 길드 탭 === */}
      {view.kind === "guild" && (
        <V2GuildHome
          viewerGuildId={viewerGuildId}
          viewerUserId={viewerUserId}
          occupations={occupations}
        />
      )}

      {/* === 지도 탭 === */}
      {view.kind === "map" && (
        <ContinentMap
          onOutpostEnter={enterOutpost}
          onTravelTo={travelTo}
          occupations={occupations}
          viewerUserId={viewerUserId}
          currentOutpostId={currentOutpost?.id ?? null}
          discoveredIds={discoveredIds}
        />
      )}
      {view.kind === "outpost" && (
        <OutpostView
          outpost={view.outpost}
          viewerUserId={viewerUserId}
          viewerGuildId={viewerGuildId}
          occupation={
            occupations.find((o) => o.outpostId === view.outpost.id) ?? null
          }
          onAction={handleOutpostAction}
        />
      )}
      </div>
    </div>
  );
}
