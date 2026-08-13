import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./useSparring", () => ({
  useSparring: () => ({
    busy: false,
    lastResult: null,
    error: null,
    spar: vi.fn(),
  }),
}));
vi.mock("./FriendlySparringPanel", () => ({
  FriendlySparringPanel: ({ initialTargetName }: { initialTargetName?: string }) => (
    <div>친선 상대: {initialTargetName ?? "없음"}</div>
  ),
}));

import { V2SparringView } from "./V2SparringView";

function view(
  initialMode?: "dummy" | "friendly",
  initialTargetName?: string,
) {
  return renderToStaticMarkup(
    <V2SparringView
      playerName="나"
      gender="male1"
      initialMode={initialMode}
      initialTargetName={initialTargetName}
      onBack={vi.fn()}
    />,
  );
}

describe("V2SparringView", () => {
  it("기본 모드에서 기존 허수아비 연습을 그대로 표시한다", () => {
    const html = view();
    expect(html).toContain("허수아비 연습");
    expect(html).toContain("유저 친선전");
    expect(html).toContain("허수아비치기 시작");
  });

  it("친선전 딥링크는 상대를 선택하되 전투를 자동 시작하지 않는다", () => {
    const html = view("friendly", "상대");
    expect(html).toContain("친선 상대: 상대");
    expect(html).not.toContain("허수아비치기 시작");
  });
});
