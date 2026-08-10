import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SecretShopAccessNote } from "./V2SecretShopView";

describe("비밀 상점 이용 시간 안내", () => {
  it("기존 개방 안내 뒤에 실제 남은 시간을 표시한다", () => {
    const html = renderToStaticMarkup(
      <SecretShopAccessNote remainingMs={24 * 60_000 + 8_000} />,
    );

    expect(html).toContain(
      "품목당 1회 구매 · 비밀 상점 지도는 발견 후 30분 동안 개방 · 남은 시간 24:08",
    );
  });
});
