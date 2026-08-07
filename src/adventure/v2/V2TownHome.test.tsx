import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2TownHome } from "./V2TownHome";

describe("마을 생활 콘텐츠 메뉴", () => {
  it("모험가 협회와 생활 작업장을 각각 독립된 진입 카드로 안내한다", () => {
    const html = renderToStaticMarkup(
      <V2TownHome gameStateLoaded viewerGuildId={null} onAction={vi.fn()} />,
    );

    expect(html).toContain("모험가 협회");
    expect(html).toContain("생활 의뢰·조합 작업장");
    expect(html).not.toContain(">상점<");
  });

  it("농장과 주방을 부연 설명 없이 독립된 진입 카드로 안내한다", () => {
    const html = renderToStaticMarkup(
      <V2TownHome gameStateLoaded viewerGuildId={null} onAction={vi.fn()} />,
    );

    expect(html).toContain("모험가 농장");
    expect(html).not.toContain("작물을 재배하고 납품합니다.");
    expect(html).toContain(">주방<");
    expect(html).not.toContain("농작물과 어획물로 음식을 만듭니다.");
  });

  it("통합 교환소는 유지하고 일반 상점은 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <V2TownHome gameStateLoaded viewerGuildId={null} onAction={vi.fn()} />,
    );

    expect(html).toContain("통합 교환소");
    expect(html).not.toContain("콘텐츠별 상점을 한곳에서 이용합니다.");
    expect(html).not.toContain("일반 상점");
  });

  it("길드 가입자에게는 모험가 협회 진입 카드를 숨긴다", () => {
    const html = renderToStaticMarkup(
      <V2TownHome gameStateLoaded viewerGuildId={7} onAction={vi.fn()} />,
    );

    expect(html).not.toContain("모험가 협회");
    expect(html).toContain("생활 의뢰·조합 작업장");
  });

  it("길드 상태 확인 전에는 협회 진입 카드를 먼저 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <V2TownHome
        gameStateLoaded={false}
        viewerGuildId={null}
        onAction={vi.fn()}
      />,
    );

    expect(html).not.toContain("모험가 협회");
  });
});
