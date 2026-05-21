export type NotificationKind =
  | "battle_win"
  | "battle_lose"
  | "training_done"
  | "quest_ready"
  | "quest_complete"
  // 성취 — 레벨업 / 스킬 습득 / 칭호 획득.
  | "milestone"
  // 위탁 원정(자동 사냥) 결과 요약.
  | "expedition"
  // 전투 드롭 — 재료 / 골드. 잦아서 토스트 기본 OFF.
  | "loot"
  // 전투 드롭 — 장비 / 제작서. 보존 가치 있는 드랍이라 토스트 기본 ON.
  | "equip_drop"
  // 장비 액션 — 제작 / 장착 / 해제 / 폐기.
  | "item"
  | "info";

// 알림 종류별로 부착될 수 있는 부가 데이터. UI에서 expand 시 사용.
// kind = "battle_win" | "battle_lose" 일 때 battleLog가 있으면 RecentLogView에서 클릭 시 전투 로그 펼쳐 보기.
// highlight 가 있으면 토스트/알림 패널에서 메시지 안의 name 부분만 className 으로 강조한다.
//   — lib 레이어가 adventure 도메인(ItemId, rarity)을 모르도록 색상 className 자체를 직접 담는다.
// prefix 가 있으면 name 바로 앞의 접두어(드랍 수식어 등)를 별도 색으로 칠한다 — 이름은 rarity 색,
// 접두어만 품질 색. prefix 없는 기존 알림은 종전대로 name 전체를 한 색으로 강조(하위 호환).
export type NotificationMeta = {
  battleLog?: { kind: string; text: string }[];
  highlight?: {
    name: string;
    className: string;
    prefix?: { text: string; className: string };
  };
};

export type AppNotification = {
  id: string;
  timestamp: number;
  kind: NotificationKind;
  text: string;
  meta?: NotificationMeta;
};

export const NOTIFICATIONS_STORAGE_KEY = "notifications.v2";
export const MAX_NOTIFICATIONS_PER_GROUP = 10;

const BATTLE_KINDS: ReadonlySet<NotificationKind> = new Set([
  "battle_win",
  "battle_lose",
]);

export function isBattleNotification(kind: NotificationKind): boolean {
  return BATTLE_KINDS.has(kind);
}

// 전투 / 전리품 / 시스템 세 그룹으로 나눠 각 그룹을 MAX_NOTIFICATIONS_PER_GROUP 개로 제한.
// loot 를 따로 빼는 이유 — 잦은 드롭 알림이 레벨업·의뢰 같은 의미 있는 시스템 알림을
// 기록에서 밀어내지 않도록. 입력 list 는 newest-first 가정 — 카운터를 채우며 순서 유지.
export function pruneNotifications(
  list: AppNotification[],
): AppNotification[] {
  let battle = 0;
  let loot = 0;
  let system = 0;
  return list.filter((n) => {
    if (isBattleNotification(n.kind)) {
      if (battle >= MAX_NOTIFICATIONS_PER_GROUP) return false;
      battle++;
      return true;
    }
    if (n.kind === "loot") {
      if (loot >= MAX_NOTIFICATIONS_PER_GROUP) return false;
      loot++;
      return true;
    }
    if (system >= MAX_NOTIFICATIONS_PER_GROUP) return false;
    system++;
    return true;
  });
}

export type NotificationStorage = {
  list: AppNotification[];
  lastReadAt: number;
};

const initial: NotificationStorage = { list: [], lastReadAt: 0 };

export function loadNotifications(): NotificationStorage {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<NotificationStorage>;
    return {
      list: Array.isArray(parsed.list) ? pruneNotifications(parsed.list) : [],
      lastReadAt: parsed.lastReadAt ?? 0,
    };
  } catch {
    return initial;
  }
}

export function saveNotifications(data: NotificationStorage): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function genNotificationId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "방금 전";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${Math.floor(diff / 86400_000)}일 전`;
}
