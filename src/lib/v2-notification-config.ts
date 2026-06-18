// v2 전용 알림 제약/타입 — 클라(Bell·알림 페이지)/서버 공통.
// 우편함(아이템 첨부)과 분리된 "읽고 끝" 채널 — docs/v2-war-visibility-plan.md PR-5.
// v1 클라 로컬 토스트(src/lib/notifications.ts)와는 별개 — 이쪽은 DB 영속·교차 세션.

// GET /api/v2/notifications 가 돌려주는 최근 항목 수.
export const NOTIF_FETCH_LIMIT = 30;

// 유저당 보존 행 수 — insert 마다 초과분 trim (serverFeed 관례, cron 없음).
export const NOTIF_MAX_PER_USER = 50;

// Bell 미읽음 뱃지 폴링 주기 — 영속 chrome 폴링이라 가볍게(60s).
export const NOTIF_POLL_MS = 60_000;

// 피격(outpost_attacked) 디바운스 — 같은 수신자+거점 기준 이 간격 안엔 한 번만.
// 함락/토벌은 디바운스 없음(즉시).
export const WAR_NOTIF_DEBOUNCE_MS = 6 * 3_600_000;

// 알림 종류 — 전쟁 3종으로 시작, 스키마는 범용(추후 아레나/길드 신청 등 확장).
export const V2_NOTIFICATION_TYPES = [
  "outpost_attacked",
  "outpost_lost",
  "ejected",
] as const;
export type V2NotificationType = (typeof V2_NOTIFICATION_TYPES)[number];

// type 별 payload — 거점 이름은 클라에서 OUTPOST_BY_ID 해석, 라벨은 시점 스냅샷.
export type V2NotificationPayload =
  // outpost_attacked — 내(길드) 거점 성벽 피격. fortHp = 타격 후 잔량.
  | {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      attackerLabel?: string | null;
    }
  // outpost_lost — 함락(attackerLabel) 또는 NPC 정기공격에 점령 풀림(byNpc).
  | { outpostId: string; byNpc?: boolean; attackerLabel?: string | null }
  // ejected — 침입 중이던 거점에서 토벌당함. gold = 압류된 보유 골드(0 이면 무손실),
  //   exiledTo = 추방된 중립 자유도시 id(클라에서 OUTPOST_BY_ID 해석).
  | { outpostId: string; byName: string; gold?: number; exiledTo?: string };

// 클라/서버가 주고받는 한 항목.
export type V2NotificationEntry = {
  id: number;
  type: V2NotificationType;
  payload: V2NotificationPayload;
  readAt: number | null; // epoch ms, null = 미읽음
  createdAt: number; // epoch ms
};
