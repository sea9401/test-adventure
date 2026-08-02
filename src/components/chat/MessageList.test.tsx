import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../ChatPanel";
import { MessageList } from "./MessageList";
import {
  ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
  arenaTournamentNoticeContent,
} from "@/lib/chat-config";

const message: ChatMessage = {
  id: 1,
  channel: "global",
  name: "시스템",
  className: "협동 보스",
  title: null,
  content: "태고의 노룡이 깨어났습니다.",
  createdAt: Date.now(),
  mine: false,
};

describe("MessageList", () => {
  it("단일 배지만 맨 앞에 두고 칭호를 대괄호로 구분한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="chat"
        messages={[
          {
            ...message,
            name: "모험가",
            title: "수다쟁이",
            cosmetics: {
              profileBorder: null,
              chatBadge: "star",
              chatNameEffect: null,
              championshipBadge: "gold",
            },
          },
        ]}
        onSelectName={vi.fn()}
      />,
    );

    const championshipBadge = html.indexOf("아레나 챔피언십 우승 메달");
    const chatBadge = html.indexOf("별 채팅 배지");
    const title = html.indexOf("[수다쟁이]");
    const name = html.indexOf("모험가");

    expect(championshipBadge).toBeGreaterThanOrEqual(0);
    expect(chatBadge).toBe(-1);
    expect(title).toBeGreaterThan(championshipBadge);
    expect(name).toBeGreaterThan(title);
  });

  it("긴 칭호를 말줄임 없이 전부 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="chat"
        messages={[{ ...message, title: "오픈 전 단골" }]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain("[오픈 전 단골]");
    expect(html).toContain("mr-1 shrink-0 whitespace-nowrap");
    expect(html).not.toContain("max-w-16");
  });

  it("일반 채팅 본문을 들여쓰기 없이 두 줄로 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="chat"
        messages={[message]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain("whitespace-pre-wrap break-words leading-relaxed");
    expect(html).not.toContain("pl-2");
  });

  it("시스템 알림의 이름·시간·내용을 한 줄에 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="notice"
        messages={[message]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain(
      "flex min-w-0 items-baseline overflow-hidden whitespace-nowrap leading-relaxed",
    );
    expect(html).toContain("ml-1.5 min-w-0 truncate");
    expect(html).not.toContain("whitespace-pre-wrap");
  });

  it("아레나 본선 알림은 결과와 전투 로그 링크를 분리해 표시한다", () => {
    const html = renderToStaticMarkup(
      <MessageList
        open
        tab="notice"
        messages={[
          {
            ...message,
            className: ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
            content: arenaTournamentNoticeContent(
              "🏆 결승 · 모험가A 2:0 모험가B — 모험가A님이 챔피언이 되었습니다.",
              "2026-W31",
              "2026-W31-r4-m1",
            ),
          },
        ]}
        onSelectName={vi.fn()}
      />,
    );

    expect(html).toContain("모험가A님이 챔피언이 되었습니다.");
    expect(html).toContain("전투 로그 보기");
    expect(html).toContain(
      'href="/battle/arena/tournament/2026-W31/2026-W31-r4-m1"',
    );
    expect(html).not.toContain("arena-tournament-replay");
  });
});
