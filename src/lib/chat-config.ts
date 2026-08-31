// 채팅 메시지 제약 — 클라/서버 공통.
export const CHAT_MAX_LENGTH = 200;
export const CHAT_RATE_LIMIT_MS = 2000;
export const CHAT_FETCH_LIMIT = 100;
export const CHAT_RETENTION_DAYS = 3;

// 시스템/협동 알림 메시지의 className — 일반 채팅과 같은 messages 테이블에 들어오지만
// 채팅창에서는 별도 탭으로 분리해서 보여준다 (협동 보스 스폰/토벌 알림 등).
// "월드 보스" = 월드 보스(태고의 노룡·별을 잊은 것) 깨어남 알림(coopRespawn 의 isWorldBoss
// 스폰 className). 빠져 있어 등장 알림이 일반 채팅으로 새던 버그 — 스폰 className 과 일치시킨다.
export const ARENA_TOURNAMENT_NOTICE_CLASS_NAME = "아레나 본선";
const ARENA_TOURNAMENT_REPLAY_MARKER = "\n[[arena-tournament-replay]]";

export const NOTICE_CLASS_NAMES = [
  "협동 보스",
  "협동 토벌",
  "월드 보스",
  ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
] as const;

export function isNoticeMessage(m: { className: string }): boolean {
  return (NOTICE_CLASS_NAMES as readonly string[]).includes(m.className);
}

export function arenaTournamentReplayHref(
  seasonId: string,
  matchId: string,
): string {
  return `/battle/arena/tournament/${encodeURIComponent(seasonId)}/${encodeURIComponent(matchId)}`;
}

/**
 * 시스템만 쓸 수 있는 className 과 내부 경로 표식을 함께 검사해 채팅 본문에서
 * 안전한 토너먼트 리플레이 액션을 분리한다. 일반 유저 메시지는 링크로 해석하지 않는다.
 */
export function parseChatMessageContent(message: {
  className: string;
  content: string;
}): {
  text: string;
  action: { href: string; label: string } | null;
} {
  if (message.className !== ARENA_TOURNAMENT_NOTICE_CLASS_NAME) {
    return { text: message.content, action: null };
  }
  const markerAt = message.content.lastIndexOf(
    ARENA_TOURNAMENT_REPLAY_MARKER,
  );
  if (markerAt < 0) return { text: message.content, action: null };
  const href = message.content
    .slice(markerAt + ARENA_TOURNAMENT_REPLAY_MARKER.length)
    .trim();
  if (!/^\/battle\/arena\/tournament\/[^/\s]+\/[^/\s]+$/.test(href)) {
    return { text: message.content, action: null };
  }
  return {
    text: message.content.slice(0, markerAt).trimEnd(),
    action: { href, label: "전투 로그 보기" },
  };
}

export function arenaTournamentNoticeContent(
  text: string,
  seasonId: string,
  matchId: string,
): string {
  return `${text}${ARENA_TOURNAMENT_REPLAY_MARKER}${arenaTournamentReplayHref(
    seasonId,
    matchId,
  )}`;
}
