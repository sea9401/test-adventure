import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  model: {} as Record<string, unknown>,
}));

vi.mock("./useFriendlySparring", () => ({
  useFriendlySparring: () => mocks.model,
}));
vi.mock("./ReplayBattleScene", () => ({
  ReplayBattleScene: ({ logTitle }: { logTitle: string }) => (
    <div data-replay>{logTitle}</div>
  ),
}));
vi.mock("@/components/ui/CosmeticAvatar", () => ({
  CosmeticAvatar: ({ name }: { name: string }) => <span>{name} 프로필</span>,
}));

import { FriendlySparringPanel } from "./FriendlySparringPanel";

function panel() {
  return renderToStaticMarkup(
    <FriendlySparringPanel
      playerName="나"
      gender="male1"
    />,
  );
}

beforeEach(() => {
  mocks.model = {
    query: "",
    setQuery: vi.fn(),
    target: null,
    result: null,
    searching: false,
    busy: false,
    error: null,
    cooldownLeftSec: 0,
    search: vi.fn(),
    fight: vi.fn(),
  };
});

describe("FriendlySparringPanel", () => {
  it("정확한 닉네임 검색과 무보상 규칙을 안내한다", () => {
    const html = panel();
    expect(html).toContain("정확한 닉네임");
    expect(html).toContain("상대 찾기");
    expect(html).toContain("점수·전적·보상·기록에 영향을 주지 않습니다");
    expect(html).not.toContain("bg-white/");
  });

  it("검색된 상대의 공개 카드와 친선전 시작 버튼을 표시한다", () => {
    mocks.model.target = {
      name: "상대",
      level: 77,
      avatar: "female2",
      profileBorder: null,
    };
    const html = panel();
    expect(html).toContain("상대");
    expect(html).toContain("Lv.77");
    expect(html).toContain("친선전 시작");
    expect(html).toContain("bg-white");
  });

  it("쿨타임과 전투 결과 전체 로그를 표시한다", () => {
    mocks.model.target = {
      name: "상대",
      level: 77,
      avatar: "female2",
      profileBorder: null,
    };
    mocks.model.cooldownLeftSec = 10;
    mocks.model.result = {
      outcome: "win",
      turns: 7,
      opponent: { name: "상대", level: 77 },
      replay: { enemy: { name: "상대", hp: 120 }, playerMaxHp: 100, log: [] },
      startPlayerHp: 100,
      cooldownMs: 10_000,
    };
    const html = panel();
    expect(html).toContain("승리");
    expect(html).toContain("7행동");
    expect(html).toContain("다시 대련까지 10초");
    expect(html).toContain("친선전 전체 전투 로그");
  });

  it("대상을 숨기는 검색 실패 메시지를 그대로 표시한다", () => {
    mocks.model.error = "상대를 찾을 수 없습니다.";
    expect(panel()).toContain("상대를 찾을 수 없습니다.");
  });
});
