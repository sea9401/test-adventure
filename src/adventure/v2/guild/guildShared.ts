import type { OutpostType } from "@/adventure/data/v2/types";
import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";
import {
  TILE_TIER_LABEL,
  isTileSettlementTier,
} from "@/adventure/data/v2/tileConfig";

// V2GuildHome 탭 분리 — 탭 패널들이 공유하는 타입·순수 헬퍼. (거동 불변 추출)

export const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
export const POLICY_LABEL: Record<string, string> = {
  open: "자유 입장",
  "guild-only": "자길드만",
};

export type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  policy?: string;
  taxRate?: string;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 덮는다.
  villageName?: string | null;
};

// 자유 타일 정착지 — 소유자(userId)의 현재 길드(guildId)는 /me/state 가 멤버십 조인으로 파생.
export type TileSettlementRow = {
  col: number;
  row: number;
  userId: string;
  tier: string;
  name: string | null;
  guildId?: number | null;
  guildName?: string | null;
  guildColor?: string | null;
};

export type StateResponse = {
  guild?: { id: number; name: string };
  tileSettlements?: TileSettlementRow[];
};

export type PendingRequest = {
  requestId: number;
  userId: string;
  name: string;
  level: number;
  requestedAt: string;
};

export type GuildInfoResponse = {
  ok?: boolean;
  guild?: {
    id: number;
    name: string;
    masterId: string;
    createdAt: string;
    fameTotal: number;
    description: string | null;
    emblem: string | null;
    color: string | null;
    nationName: string | null;
    nationDeclaredAt: string | null;
  } | null;
  members?: {
    userId: string;
    role: string;
    joinedAt: string;
    name: string;
    level: number;
    job: string;
    lastSeenAt: string | null;
    honorEarned: number;
    artisan?: {
      blacksmith?: {
        level: number;
        xp: number;
        crafts: number;
        xpIntoLevel: number;
        xpForNext: number;
        totalCrafts: number;
        qualityCrafts: number;
      };
    };
  }[];
  isMaster?: boolean;
  isManager?: boolean;
  pendingRequests?: PendingRequest[];
  // 국가 선포 — 정원 한도(국가 시 상향)·대도시 보유·선포 가능 여부.
  memberCap?: number;
  hasMetropolis?: boolean;
  canDeclareNation?: boolean;
  // 길드 공용 골드 풀 보유량.
  guildGold?: number;
  // 길드 소유 마을에 배치된 영지 건축물 수.
  settlementBuildings?: Partial<Record<SettlementBuildingId, number>>;
  hasGuildSmithy?: boolean;
  hasTrainingGround?: boolean;
  // 다른 활성 길드가 이미 쓰는 색(선착순) — 색 picker 비활성용.
  takenColors?: string[];
  // 무소속일 때만 — 재가입 쿨다운 만료 시각(ISO). 활성 아니면 null/부재.
  leaveCooldownUntil?: string | null;
};

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function settleTierLabel(t: string): string {
  return isTileSettlementTier(t) ? TILE_TIER_LABEL[t] : t;
}

export type GuildSubTab =
  | "info"
  | "members"
  | "training"
  | "manage"
  | "outposts"
  | "honor_shop";
// 관리(manage) 탭 내부 하위 탭 — 멤버(가입신청·초대·직책)·거점 정책·길드 설정(엠블럼·색·국가·해산).
export type GuildManageTab = "members" | "territory" | "settings";

export type Notice = { kind: "ok" | "err"; text: string };

// 거점 정책 탭 대상 — 길드 타일 정착지 + 카탈로그 점령 거점(영주/정책·세율 일원 관리).
export type PolicyTarget = { outpostId: string; title: string; occ?: Occupation };
