import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ageEligible: true,
  redirect: vi.fn(),
}));

vi.mock("@/adventure/v2/GameClientBoundary", () => ({
  GameClientBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/lib/server/ageEligibility", () => ({
  hasValidAgeEligibilityCookie: vi.fn(async () => mocks.ageEligible),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import GameLayout from "./layout";

describe("게임 레이아웃 전투 로그 슬롯", () => {
  beforeEach(() => {
    mocks.ageEligible = true;
    mocks.redirect.mockReset();
  });

  it("로그로 이동해도 기존 결과 화면을 함께 유지한다", async () => {
    const props = {
      children: <div>기존 전투 결과</div>,
      battleLog: <div>전투 로그 전용 화면</div>,
    };

    const html = renderToStaticMarkup(await GameLayout(props));

    expect(html).toContain("기존 전투 결과");
    expect(html).toContain("전투 로그 전용 화면");
  });

  it("기존 로그인 이용자도 연령 확인이 없으면 로그인 화면으로 보낸다", async () => {
    mocks.ageEligible = false;

    await GameLayout({ children: <div>게임</div> });

    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?age=required");
  });
});
