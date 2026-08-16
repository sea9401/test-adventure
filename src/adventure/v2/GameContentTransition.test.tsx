import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/battle/dungeon/73";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import {
  GameContentTransition,
  gameContentTransitionClass,
  isHuntListToFloorNavigation,
} from "./GameContentTransition";

describe("사냥터 층 진입 전환", () => {
  beforeEach(() => {
    pathname = "/battle/dungeon/73";
  });

  it("사냥터 목록에서 숫자 층으로 들어갈 때만 전진 전환으로 판정한다", () => {
    expect(
      isHuntListToFloorNavigation("/battle/dungeon", "/battle/dungeon/73"),
    ).toBe(true);
    expect(
      isHuntListToFloorNavigation(null, "/battle/dungeon/73"),
    ).toBe(false);
    expect(
      isHuntListToFloorNavigation(
        "/battle/dungeon/72",
        "/battle/dungeon/73",
      ),
    ).toBe(false);
    expect(
      isHuntListToFloorNavigation("/battle/dungeon", "/battle/dungeon/deep"),
    ).toBe(false);
    expect(isHuntListToFloorNavigation("/battle", "/battle/dungeon/73"))
      .toBe(false);
  });

  it("층 주소로 직접 접속한 첫 렌더에는 진입 애니메이션을 붙이지 않는다", () => {
    const html = renderToStaticMarkup(
      <GameContentTransition>
        <main>전투</main>
      </GameContentTransition>,
    );

    expect(html).toContain("전투");
    expect(html).not.toContain("ui-hunt-floor-enter");
  });

  it("첫 렌더와 같은 경로에는 전환을 붙이지 않는다", () => {
    expect(gameContentTransitionClass(null, "/character")).toBe("");
    expect(gameContentTransitionClass("/character", "/character")).toBe("");
  });

  it("일반 경로 변경은 위치 이동 없는 공통 전환을 사용한다", () => {
    expect(gameContentTransitionClass("/character", "/town")).toBe(
      "ui-route-content-enter",
    );
  });

  it("사냥터 목록에서 층 진입은 기존 방향 전환을 우선한다", () => {
    expect(
      gameContentTransitionClass("/battle/dungeon", "/battle/dungeon/73"),
    ).toBe("ui-hunt-floor-enter");
  });
});
