import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FishingView } from "./FishingView";

describe("낚시 정보 패널", () => {
  it("물때 정보와 요리 재료 일일 획득을 기본 접힘 상태로 제공한다", () => {
    const html = renderToStaticMarkup(
      <FishingView
        cast={() => Promise.resolve({ castId: "cast-1", biteDelayMs: 1_000 })}
        reel={() => Promise.resolve({ caught: false, reason: "missed_window" })}
        dailyCatchCoins={{ earned: 10, cap: 100 }}
        dailyCatchItems={[
          {
            itemId: "catch_common",
            name: "일반 어획물",
            awarded: 12,
            cap: 50,
          },
        ]}
      />,
    );

    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).not.toContain("<details open");
    expect(html).toContain("낚시 정보");
    expect(html).toContain("요리 재료 일일 획득");
  });
});
