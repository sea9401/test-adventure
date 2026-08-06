import { describe, expect, it } from "vitest";
import {
  ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
  arenaTournamentNoticeContent,
  isNoticeMessage,
  parseChatMessageContent,
} from "./chat-config";

describe("isNoticeMessage", () => {
  it("협동/월드 보스 broadcast className 은 모두 알림 탭으로 분리된다", () => {
    // coopRespawn(스폰): isWorldBoss → "월드 보스", 아니면 "협동 보스".
    expect(isNoticeMessage({ className: "월드 보스" })).toBe(true);
    expect(isNoticeMessage({ className: "협동 보스" })).toBe(true);
    // bossState(처치): "협동 토벌".
    expect(isNoticeMessage({ className: "협동 토벌" })).toBe(true);
    expect(
      isNoticeMessage({ className: ARENA_TOURNAMENT_NOTICE_CLASS_NAME }),
    ).toBe(true);
  });

  it("일반 유저 채팅(직업명 등)은 알림이 아니다", () => {
    expect(isNoticeMessage({ className: "전사" })).toBe(false);
    expect(isNoticeMessage({ className: "" })).toBe(false);
  });

  it("본선 시스템 메시지의 내부 리플레이 링크만 액션으로 분리한다", () => {
    const content = arenaTournamentNoticeContent(
      "🏟️ 8강 · 모험가A 2:1 모험가B — 모험가A 승리",
      "2026-W31",
      "2026-W31-r1-m1",
    );
    expect(
      parseChatMessageContent({
        className: ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
        content,
      }),
    ).toEqual({
      text: "🏟️ 8강 · 모험가A 2:1 모험가B — 모험가A 승리",
      action: {
        href: "/battle/arena/tournament/2026-W31/2026-W31-r1-m1",
        label: "전투 로그 보기",
      },
    });
    expect(
      parseChatMessageContent({ className: "전사", content }).action,
    ).toBeNull();
  });
});
