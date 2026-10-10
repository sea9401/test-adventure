import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";

describe("RewardToastProvider layout", () => {
  it("모바일 토스트를 상단 메뉴를 가리지 않도록 채팅 버튼 위 하단에 두고 데스크톱 좌하단 배치는 유지한다", () => {
    const html = renderToStaticMarkup(
      <RewardToastProvider>
        <span>게임 화면</span>
      </RewardToastProvider>,
    );

    expect(html).not.toContain("safe-area-inset-top");
    expect(html).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)+8.25rem)]",
    );
    expect(html).toContain("sm:bottom-5");
  });
});
