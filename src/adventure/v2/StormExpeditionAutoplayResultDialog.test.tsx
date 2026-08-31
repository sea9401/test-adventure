import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StormExpeditionAutoplayResultDialog } from "./StormExpeditionAutoplayResultDialog";

describe("StormExpeditionAutoplayResultDialog", () => {
  it("완주 시 도달 지점과 확정 보상을 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoplayResultDialog
        open
        model={{ kind: "complete", reachedNodeName: "폭풍의 심장", rewards: ["골드 120,000G", "장비 1개"] }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("일괄 진행 완료");
    expect(html).toContain("폭풍의 심장");
    expect(html).toContain("골드 120,000G");
    expect(html).toContain("장비 1개");
  });

  it("패배 시 도달 지점과 잃은 임시 전리품을 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionAutoplayResultDialog
        open
        model={{ kind: "defeated", reachedNodeName: "뇌운 정예", lostLoot: ["골드 35,000G", "뇌운 파편 2개"] }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("일괄 진행 패배");
    expect(html).toContain("뇌운 정예");
    expect(html).toContain("잃은 임시 전리품");
    expect(html).toContain("뇌운 파편 2개");
  });

  it("닫힌 상태에서는 렌더하지 않는다", () => {
    expect(renderToStaticMarkup(
      <StormExpeditionAutoplayResultDialog
        open={false}
        model={{ kind: "complete", reachedNodeName: "폭풍의 심장", rewards: [] }}
        onClose={vi.fn()}
      />,
    )).toBe("");
  });
});
