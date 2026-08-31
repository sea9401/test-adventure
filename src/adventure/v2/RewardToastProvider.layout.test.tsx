import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";

describe("RewardToastProvider layout", () => {
  it("모바일 토스트를 상단바와 메인 탭 아래에 두고 데스크톱 좌하단 배치는 유지한다", () => {
    const html = renderToStaticMarkup(
      <RewardToastProvider>
        <span>게임 화면</span>
      </RewardToastProvider>,
    );

    expect(html).toContain(
      "top-[calc(env(safe-area-inset-top)+7.25rem)]",
    );
    expect(html).toContain("sm:top-auto");
    expect(html).toContain("sm:bottom-5");
  });
});
