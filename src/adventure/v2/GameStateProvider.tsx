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
import type { MpBarState } from "@/adventure/v2/MpBar";
import type { PlayerCombatStats } from "@/adventure/v2/PlayerStatusCard";
import {
  MAX_STAMINA,
  initialStamina,
  type StaminaState,
} from "@/adventure/v2/stamina";
import {
  OUTPOST_BY_ID,
  OUTPOSTS,
  START_OUTPOST_ID,
} from "@/adventure/data/v2/outposts";
import { seededDiscovery } from "@/adventure/data/v2/outpostGraph";
import {
  TILE_OUTPOST_AT,
  TILE_POS_BY_OUTPOST,
  tileKey,
  tileNextTier,
  type TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";

// 개척 정착지(자유 타일 지도 Phase 3) — me/state 로드 + 건설/승격/철거 후 갱신.
export type TileSettlement = {
  col: number;
  row: number;
  userId: string;
  tier: string;
  name: string | null;
  // 소유자의 현재 길드(읽기 시 멤버십 조인으로 파생). 무소속이면 null.
  guildId?: number | null;
  guildName?: string | null;
  guildColor?: string | null;
};
import { parseV2Class, V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import {
  parseV2Element,
  V2_ELEMENT_LABEL,
} from "@/adventure/data/v2/elements";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import type { Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 신규/미방문 플레이어의 기본 현재 거점 — 인접 게이트의 부트스트랩 기준점.
const START_OUTPOST = OUTPOSTS.find((o) => o.id === START_OUTPOST_ID)!;


// 거점 금고 잔액 — occupations GET 동봉(gold>0 만).
export type TreasuryEntry = { outpostId: string; gold: number };

export type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedByGuildEmblem?: string | null;
  occupiedByGuildColor?: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
  // 거점 공성(성벽 HP) — 재생 반영 현재값. protectedUntil = 함락 후 보호막 만료 시각.
  fortHp: number;
  fortMaxHp: number;
  protectedUntil: string;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 이걸로 덮는다(미건설=null).
  villageName: string | null;
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
  // per-user 스태미나 최대치 — 기본 + 한계의 비약 보너스(me/state 가 권위).
  staminaMax: number;
  setStamina: React.Dispatch<React.SetStateAction<StaminaState>>;
  // 보유 스태미나 포션 수(퀘 마일스톤 보상·보관형 소비템). me/state 에서 초기화.
  staminaPotions: number;
  hp: HpBarState | null;
  setHp: React.Dispatch<React.SetStateAction<HpBarState | null>>;
  // 보유 골드(들고 다니는·토벌 압류 대상) + 은행 잔액(입금분·안전). me/state 에서 초기화.
  gold: number;
  bankedGold: number;
  // 지불 가능한 총 골드 — 코어루프(은행 우선 소비) on 이면 보유+은행, off 면 보유만. 상점/강화 등
  //   클라 affordability 게이트는 이 값을 써야 은행에 든 골드로도 구매 버튼이 활성화된다.
  spendableGold: number;
  setGold: React.Dispatch<React.SetStateAction<number>>;
  setBankedGold: React.Dispatch<React.SetStateAction<number>>;
  // === 코어루프(V2_CORE_LOOP_V2) flag-on 전용 — off 면 전부 null(현행 UI 무변경) ===
  // 코어루프 활성(은행/골드/직업 시스템) — me/state 명시 coreLoopOn. 사냥 throttle 과 독립
  //   (combatCooldown 유무로 추론 금지 — 스태미나 모드면 쿨다운이 null 이므로).
  coreLoopOn: boolean;
  // 사냥이 스태미나 모드인가 — 스태미나 바/UI 표시·쿨다운 UI 숨김 판정.
  huntStaminaMode: boolean;
  // 전투 쿨다운 — nextBattleAt 은 클라 로컬 시각으로 변환됨(서버 skew 보정). 사냥 버튼 카운트다운.
  combatCooldown: { nextBattleAt: number; cooldownMs: number } | null;
  setCombatCooldown: React.Dispatch<
    React.SetStateAction<{ nextBattleAt: number; cooldownMs: number } | null>
  >;
  // 오프라인 정산 대기 판수 — 복귀 카드 트리거. 정산 후 0 으로.
  offlinePending: number | null;
  setOfflinePending: React.Dispatch<React.SetStateAction<number | null>>;
  // 오프라인(자동) 사냥 세션 — active + endsAt(클라 로컬 시각, skew 보정) + depth(farm 깊이,
  //   "자동 사냥 중 사냥터 바로 입장" 목적지). null=flag off. 시작/정지 버튼.
  offlineHunt: { active: boolean; endsAt: number; depth: number } | null;
  setOfflineHunt: React.Dispatch<
    React.SetStateAction<{
      active: boolean;
      endsAt: number;
      depth: number;
    } | null>
  >;
  // 위험 골드 — 마지막 패배 이후 번 골드(패배 시 절반 압류). 사냥 응답으로 갱신.
  atRiskGold: number | null;
  setAtRiskGold: React.Dispatch<React.SetStateAction<number | null>>;
  mp: MpBarState | null;
  setMp: React.Dispatch<React.SetStateAction<MpBarState | null>>;
  // 유효 전투 스탯(공/방/속+상세) — 사냥 카드 표기. me/state 권위.
  playerCombat: PlayerCombatStats | null;
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
  // 자유 타일 지도(V2_FREEFORM_TILES) — 마커 칸 좌표 + 칸 이동(거점/빈 땅 공통).
  //   거점 칸이면 travelTo 로 위임, 빈 칸이면 move-tile POST(사냥 base 불변·마커만 이동).
  tilePos: { col: number; row: number } | null;
  travelToTile: (col: number, row: number) => void;
  // 개척 정착지(Phase 3) — 보드의 모든 정착지 + 본인 건설/승격/철거.
  tileSettlements: TileSettlement[];
  foundTile: (col: number, row: number, name: string) => Promise<boolean>;
  promoteTile: (col: number, row: number) => void;
  demolishTile: (col: number, row: number) => void;
  renameTile: (col: number, row: number, name: string) => void;
  // 개척/승격/철거/개명 실패 사유(한 줄). 성공·미발생이면 null. 지도에서 안내 후 해제.
  tileActionError: string | null;
  clearTileActionError: () => void;
};

// 정착지 액션(개척/승격/철거/개명) 실패 사유 → 사용자 안내 문구.
//   서버 error 코드별로 "왜 안 됐는지"를 한국어로 풀어 침묵 실패를 없앤다.
function tileSettlementErrorMessage(
  action: "found" | "promote" | "demolish" | "rename",
  res: { error?: string; requiredGold?: number; gold?: number },
): string {
  const label =
    action === "found"
      ? "개척"
      : action === "promote"
        ? "승격"
        : action === "demolish"
          ? "철거"
          : "개명";
  const req = res.requiredGold ?? 0;
  const have = res.gold ?? 0;
  switch (res.error) {
    case "out_of_guild_gold":
      return `길드 골드 부족 — ${label} 비용 ${req.toLocaleString()} G 필요 (현재 길드 골드 ${have.toLocaleString()} G). 거점 금고를 회수해 길드 자금을 채우세요.`;
    case "out_of_gold":
      return `골드 부족 — ${label} 비용 ${req.toLocaleString()} G 필요.`;
    case "not_guild_admin":
      return "개척마을 건설은 길드 마스터·부마스터만 가능합니다.";
    case "need_guild":
      return "개척마을은 길드 전용입니다 — 길드를 만들거나 가입하세요.";
    case "already_settled":
      return "이미 정착지가 있는 칸입니다.";
    case "tile_is_outpost":
      return "거점 칸에는 개척할 수 없습니다.";
    case "invalid_name":
      return "마을 이름이 올바르지 않습니다.";
    case "not_owner":
      return "본인 정착지가 아닙니다.";
    case "not_found":
      return "정착지를 찾을 수 없습니다.";
    case "max_tier":
      return "이미 최고 단계입니다.";
    case "use_production_management":
      return "승격은 거점 관리 화면(생산 시스템)에서 진행하세요.";
    case "network":
      return "네트워크 오류 — 잠시 후 다시 시도하세요.";
    default:
      return `${label}에 실패했습니다 (${res.error ?? "알 수 없는 오류"}).`;
  }
}

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
  // 직업 표시명(서버 산출) — 직업 시스템이면 견습 병사·방패병 등. 전투 부제가 class 직접 환산
  //   대신 이걸 우선 사용(상위 직업 반영). 미동봉이면 null → class 직군명 폴백.
  const [viewerJobName, setViewerJobName] = useState<string | null>(null);
  const [viewerElement, setViewerElement] = useState<string>("neutral");
  // 기본값 = 시작 거점(중앙 자유 도시). me/state 로드 시 저장된 현재 거점이 있으면 덮어쓴다.
  // null 로 두지 않아 인접 이동 게이트가 첫 화면부터 일관되게 동작한다.
  const [currentOutpost, setCurrentOutpost] = useState<
    { id: string; name: string } | null
  >(() => ({ id: START_OUTPOST.id, name: START_OUTPOST.name }));
  // 자유 타일 지도 마커 좌표 — me/state 의 tilePos 또는 현재 거점 칸에서 초기화(없으면 null).
  const [tilePos, setTilePos] = useState<{ col: number; row: number } | null>(
    null,
  );
  // 개척 정착지 — me/state 로 초기화, 건설/승격/철거로 낙관적 갱신.
  const [tileSettlements, setTileSettlements] = useState<TileSettlement[]>([]);
  // 개척/승격/철거/개명 실패 사유 — 한 줄 안내(지도에서 표시). 성공 시 null 로 해제.
  //   서버가 403/409 등으로 거절해도 클라가 침묵하면 "버튼이 안 먹는다"로 보이므로
  //   사유를 사용자에게 노출한다.
  const [tileActionError, setTileActionError] = useState<string | null>(null);
  // 전역 stamina — me/state mount fetch 에서 초기화. 던전 hunt 응답 시 갱신.
  const [staminaMax, setStaminaMax] = useState(MAX_STAMINA);
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  const [staminaPotions, setStaminaPotions] = useState(0);
  // 발견(안개) — 공개된 거점 id 집합. me/state 에서 초기화, 이동 응답마다 확장.
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(
    () => new Set(seededDiscovery()),
  );
  // 무한 프론티어 최고 도달 깊이 — me/state 에서 초기화(기본 2), 도전 성공 시 갱신.
  const [frontierDepth, setFrontierDepth] = useState<number>(2);
  // 전역 HP — me/state mount fetch 에서 초기화, 사냥/전투 응답마다 갱신.
  const [hp, setHp] = useState<HpBarState | null>(null);
  // 보유 골드 + 은행 잔액 — me/state 에서 초기화, 은행 입출금 응답으로 갱신.
  const [gold, setGold] = useState(0);
  const [bankedGold, setBankedGold] = useState(0);
  const [mp, setMp] = useState<MpBarState | null>(null);
  // 유효 전투 스탯(공/방/속+상세) — me/state combat 에서 초기화, 사냥 카드 표기용.
  const [playerCombat, setPlayerCombat] = useState<PlayerCombatStats | null>(
    null,
  );
  // 쿨다운 모드 전용(스태미나 모드/off=null). me/state 에서 초기화.
  const [combatCooldown, setCombatCooldown] = useState<{
    nextBattleAt: number;
    cooldownMs: number;
  } | null>(null);
  // 코어루프 활성(은행/골드/직업) — 사냥 throttle 과 독립. me/state 의 명시 coreLoopOn 사용
  //   (combatCooldown 유무로 추론 금지 — 스태미나 모드면 쿨다운 null 이라 은행이 꺼져버림).
  const [coreLoopOn, setCoreLoopOn] = useState(false);
  // 사냥이 스태미나 모드인가(스태미나 바/UI 표시 판정).
  const [huntStaminaMode, setHuntStaminaMode] = useState(false);
  const [offlinePending, setOfflinePending] = useState<number | null>(null);
  const [offlineHunt, setOfflineHunt] = useState<{
    active: boolean;
    endsAt: number;
    depth: number;
  } | null>(null);
  const [atRiskGold, setAtRiskGold] = useState<number | null>(null);

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
            classDisplayName?: string | null;
            element?: string;
            hp?: number;
            maxHp?: number;
            mp?: number;
            maxMp?: number;
            stamina?: {
              current: number;
              lastUpdatedAt: number;
              max?: number;
            };
            staminaPotions?: number;
            gold?: number;
            bankedGold?: number;
            atRiskGold?: number | null;
          };
          currentOutpost?: { id: string; name: string } | null;
          discoveredOutpostIds?: string[];
          tilePos?: { col: number; row: number } | null;
          tileSettlements?: TileSettlement[];
          accountName?: string | null;
          frontierDepth?: number;
          proficiency?: {
            groups?: Record<string, { tier?: number }>;
            current?: { group?: string };
          };
          // 코어루프 활성(은행/골드/직업) — 사냥 throttle 과 독립.
          coreLoopOn?: boolean;
          // 사냥이 스태미나 모드인가(스태미나 바/UI 표시).
          huntStaminaMode?: boolean;
          // 쿨다운 모드 전용(스태미나 모드/off=null).
          combatCooldown?: {
            nextBattleAt: number;
            cooldownMs: number;
            serverNow: number;
          } | null;
          offlinePending?: number | null;
          // 유효 전투 스탯(공/방/속 + 명중/회피/치명). 사냥 카드 표기용.
          combat?: PlayerCombatStats | null;
          offlineHunt?: {
            active: boolean;
            startedAt?: number;
            endsAt?: number;
            serverNow?: number;
            depth?: number;
          } | null;
        } | null;
        if (j?.character?.name) setViewerName(j.character.name);
        setAccountName(j?.accountName ?? null);
        if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
        if (typeof j?.character?.level === "number")
          setViewerLevel(j.character.level);
        if (j?.character?.class) setViewerClass(j.character.class);
        setViewerJobName(
          typeof j?.character?.classDisplayName === "string"
            ? j.character.classDisplayName
            : null,
        );
        if (j?.character?.element) setViewerElement(j.character.element);
        const currentGroup = j?.proficiency?.current?.group ?? "none";
        const currentTier =
          currentGroup === "none"
            ? null
            : (j?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
        setViewerLevelCap(
          currentTier == null ? null : effectiveLevelCap(currentTier),
        );
        if (typeof j?.character?.stamina?.max === "number") {
          setStaminaMax(j.character.stamina.max);
        }
        if (j?.character?.stamina) {
          setStamina({
            current: j.character.stamina.current,
            lastUpdatedAt: j.character.stamina.lastUpdatedAt,
          });
        }
        if (typeof j?.character?.staminaPotions === "number") {
          setStaminaPotions(j.character.staminaPotions);
        }
        if (typeof j?.character?.gold === "number") setGold(j.character.gold);
        if (typeof j?.character?.bankedGold === "number")
          setBankedGold(j.character.bankedGold);
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
        if (
          typeof j?.character?.mp === "number" &&
          typeof j?.character?.maxMp === "number"
        ) {
          setMp({ mp: j.character.mp, maxMp: j.character.maxMp });
        }
        setPlayerCombat(j?.combat ?? null);
        if (j?.currentOutpost) setCurrentOutpost(j.currentOutpost);
        if (j?.discoveredOutpostIds && j.discoveredOutpostIds.length > 0) {
          setDiscoveredIds(new Set(j.discoveredOutpostIds));
        }
        // 마커 좌표 — 저장된 tilePos 우선, 없으면 현재 거점 칸에서 파생(자유 타일 지도용).
        if (j?.tilePos) {
          setTilePos(j.tilePos);
        } else if (j?.currentOutpost) {
          setTilePos(TILE_POS_BY_OUTPOST.get(j.currentOutpost.id) ?? null);
        }
        if (Array.isArray(j?.tileSettlements)) {
          setTileSettlements(j.tileSettlements);
        }
        if (typeof j?.frontierDepth === "number") {
          // MAX 캡 — 클라가 캡 밖 깊이를 들고 다니지 않게(서버도 캡하지만 방어).
          setFrontierDepth(
            Math.min(MAX_FRONTIER_DEPTH, Math.max(2, j.frontierDepth)),
          );
        }
        // 코어루프 — 전투 쿨다운(서버 시각 → 클라 로컬로 변환, skew 보정), 위험 골드, 오프라인 대기.
        const cc = j?.combatCooldown;
        if (cc) {
          const remaining = Math.max(0, cc.nextBattleAt - cc.serverNow);
          setCombatCooldown({
            nextBattleAt: Date.now() + remaining,
            cooldownMs: cc.cooldownMs,
          });
        } else {
          setCombatCooldown(null);
        }
        setCoreLoopOn(j?.coreLoopOn === true);
        setHuntStaminaMode(j?.huntStaminaMode === true);
        setOfflinePending(
          typeof j?.offlinePending === "number" ? j.offlinePending : null,
        );
        // 오프라인 사냥 세션 — endsAt(서버) → 클라 로컬로 변환(skew 보정).
        const oh = j?.offlineHunt;
        if (oh == null) {
          setOfflineHunt(null);
        } else if (
          oh.active &&
          typeof oh.endsAt === "number" &&
          typeof oh.serverNow === "number"
        ) {
          const remaining = Math.max(0, oh.endsAt - oh.serverNow);
          setOfflineHunt({
            active: true,
            endsAt: Date.now() + remaining,
            depth: typeof oh.depth === "number" ? oh.depth : 1,
          });
        } else {
          setOfflineHunt({ active: false, endsAt: 0, depth: 0 });
        }
        setAtRiskGold(
          typeof j?.character?.atRiskGold === "number"
            ? j.character.atRiskGold
            : null,
        );
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

  // 자유이동 — 현재 거점에서 목적지로 바로 이동(인접/경로 무관, B안 PR-3). 서버가 비용을
  // 권위 판정. 마커만 옮기고 지도에 머문다(거점 화면은 열지 않음 — 연속 이동 편의).
  // 거점 진입은 모험 탭 「거점 진입」 또는 지도에서 현재 거점 「둘러보기」로.
  const travelTo = useCallback(
    (target: Outpost) => {
      if (visitInFlightRef.current) return;
      const startId = currentOutpost?.id ?? START_OUTPOST_ID;
      if (startId === target.id) return; // 이미 그 거점 — 이동 없음.
      visitInFlightRef.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/v2/me/visit-outpost", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ outpostId: target.id }),
          });
          const j = await res.json().catch(() => null);
          applyVisitResult(j);
          // 비용 부족(out_of_gold/stamina)·오류면 위치 유지, 성공이면 마커 갱신.
          if (res.ok) setCurrentOutpost({ id: target.id, name: target.name });
        } catch {
          // 네트워크 오류 — 현재 위치 유지.
        } finally {
          visitInFlightRef.current = false;
        }
      })();
    },
    [currentOutpost, applyVisitResult],
  );

  // 자유 타일 지도 이동 — 칸 좌표로 이동. 거점 칸이면 travelTo(visit-outpost) 로 위임하고,
  // 빈 칸이면 move-tile 을 POST 해 마커만 옮긴다(사냥 base=currentOutpost 불변). 마커(tilePos)는
  // 두 경우 모두 갱신. V2_FREEFORM_TILES on 인 /map(TileMap)에서만 호출된다.
  const travelToTile = useCallback(
    (col: number, row: number) => {
      if (visitInFlightRef.current) return;
      const oid = TILE_OUTPOST_AT.get(tileKey(col, row));
      if (oid) {
        const o = OUTPOST_BY_ID.get(oid);
        if (o) {
          setTilePos({ col, row });
          travelTo(o);
        }
        return;
      }
      visitInFlightRef.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/v2/me/move-tile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ col, row }),
          });
          const j = await res.json().catch(() => null);
          applyVisitResult(j);
          if (res.ok) setTilePos({ col, row });
        } catch {
          // 네트워크 오류 — 위치 유지.
        } finally {
          visitInFlightRef.current = false;
        }
      })();
    },
    [travelTo, applyVisitResult],
  );

  // 개척 정착지 — 건설/승격/철거/수확. 성공 시 낙관적 갱신 + 골드 반영(서버 권위). 실패는 현 상태 유지.
  //   실패 사유(error/requiredGold/gold)를 그대로 돌려줘 호출부가 안내 문구를 만들 수 있게 한다.
  const postTileSettlement = useCallback(
    async (
      action: "found" | "promote" | "demolish" | "rename",
      col: number,
      row: number,
      name?: string,
    ): Promise<{
      ok: boolean;
      error?: string;
      requiredGold?: number;
      gold?: number;
    }> => {
      try {
        const res = await fetch("/api/v2/me/tile-settlement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            col,
            row,
            ...(name != null ? { name } : {}),
          }),
        });
        const j = (await res.json().catch(() => null)) as {
          gold?: number;
          bankedGold?: number;
          error?: string;
          requiredGold?: number;
        } | null;
        if (res.ok) {
          if (typeof j?.gold === "number") setGold(j.gold);
          if (typeof j?.bankedGold === "number") setBankedGold(j.bankedGold);
          return { ok: true };
        }
        return {
          ok: false,
          error: j?.error ?? "unknown",
          requiredGold: j?.requiredGold,
          gold: j?.gold,
        };
      } catch {
        return { ok: false, error: "network" };
      }
    },
    [],
  );
  const foundTile = useCallback(
    async (col: number, row: number, name: string): Promise<boolean> => {
      const res = await postTileSettlement("found", col, row, name);
      if (!res.ok) {
        setTileActionError(tileSettlementErrorMessage("found", res));
        return false;
      }
      setTileActionError(null);
      setTileSettlements((s) =>
        s.some((x) => x.col === col && x.row === row)
          ? s
          : [
              ...s,
              {
                col,
                row,
                userId: viewerUserId ?? "",
                tier: "frontier",
                // 창립자가 직접 지은 이름 — 지도·헤더 표시 이름(서버 tile_settlements.name).
                name,
                // 내 길드로 즉시 귀속(색은 다음 state 새로고침이 채움).
                guildId: viewerGuildId,
              },
            ],
      );
      // 점령행(occupations)도 새로고침 — found 가 createTileOccupation 으로 길드 점령행을
      //   짝으로 만든다. 이걸 안 끌어오면 거점 관리 화면이 occupation=null 로 보고 "점령 시도"
      //   (= 본인 거점인데 남의 땅 공격 UI)를 띄운다. 지도 마커 색(소유자색)도 이 행으로 파생.
      void refreshOccupations();
      return true;
    },
    [postTileSettlement, viewerUserId, viewerGuildId, refreshOccupations],
  );
  const renameTile = useCallback(
    (col: number, row: number, name: string) => {
      void postTileSettlement("rename", col, row, name).then((res) => {
        if (!res.ok) {
          setTileActionError(tileSettlementErrorMessage("rename", res));
          return;
        }
        setTileActionError(null);
        setTileSettlements((s) =>
          s.map((x) => (x.col === col && x.row === row ? { ...x, name } : x)),
        );
        // 거점 화면 헤더(occupations.villageName)도 새 이름으로 — 지도는 위 낙관적 갱신이 처리.
        void refreshOccupations();
      });
    },
    [postTileSettlement, refreshOccupations],
  );
  const promoteTile = useCallback(
    (col: number, row: number) => {
      void postTileSettlement("promote", col, row).then((res) => {
        if (!res.ok) {
          setTileActionError(tileSettlementErrorMessage("promote", res));
          return;
        }
        setTileActionError(null);
        setTileSettlements((s) =>
          s.map((x) =>
            x.col === col && x.row === row
              ? {
                  ...x,
                  tier: tileNextTier(x.tier as TileSettlementTier) ?? x.tier,
                }
              : x,
          ),
        );
      });
    },
    [postTileSettlement],
  );
  const demolishTile = useCallback(
    (col: number, row: number) => {
      void postTileSettlement("demolish", col, row).then((res) => {
        if (!res.ok) {
          setTileActionError(tileSettlementErrorMessage("demolish", res));
          return;
        }
        setTileActionError(null);
        setTileSettlements((s) =>
          s.filter((x) => !(x.col === col && x.row === row)),
        );
        // 철거는 점령행(occupations)도 서버에서 지운다(removeTileWarfare) — 클라 점령행 동기화.
        void refreshOccupations();
      });
    },
    [postTileSettlement, refreshOccupations],
  );
  const clearTileActionError = useCallback(() => setTileActionError(null), []);

  // 전투 장면 플레이어 부제 — "Lv.42 · 견습 검사 · 무속성". 레벨·직업·속성 간단 표기.
  const playerLevelText = viewerLevelCap
    ? `Lv ${viewerLevel} / ${viewerLevelCap}`
    : `Lv.${viewerLevel}`;
  const playerSubtitle = `${playerLevelText} · ${
    viewerJobName ?? V2_CLASS_DEFS[parseV2Class(viewerClass)].name
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
    staminaMax,
    setStamina,
    staminaPotions,
    hp,
    setHp,
    gold,
    bankedGold,
    spendableGold: coreLoopOn ? gold + bankedGold : gold,
    setGold,
    setBankedGold,
    coreLoopOn,
    huntStaminaMode,
    combatCooldown,
    setCombatCooldown,
    offlinePending,
    setOfflinePending,
    offlineHunt,
    setOfflineHunt,
    atRiskGold,
    setAtRiskGold,
    mp,
    setMp,
    playerCombat,
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
    tilePos,
    travelToTile,
    tileSettlements,
    foundTile,
    promoteTile,
    demolishTile,
    renameTile,
    tileActionError,
    clearTileActionError,
  };

  return (
    <GameStateCtx.Provider value={value}>{children}</GameStateCtx.Provider>
  );
}
