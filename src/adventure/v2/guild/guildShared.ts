import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";

// V2GuildHome 탭 분리 — 탭 패널들이 공유하는 타입·순수 헬퍼.

export type StateResponse = {
  guild?: { id: number; name: string };
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
    fameAvailable: number;
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
  hasMapWorkshop?: boolean;
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

export type GuildSubTab =
  | "info"
  | "members"
  | "manage"
  | "facilities";
// 관리(manage) 탭 내부 하위 탭 — 멤버(가입신청·초대·직책)·길드 연구·길드 설정.
export type GuildManageTab = "members" | "research" | "settings";

export type Notice = { kind: "ok" | "err"; text: string };
