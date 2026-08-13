import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewOpPresetSection } from "./ReviewOpPresetSection";

describe("ReviewOpPresetSection", () => {
  it("상향 범위와 보존 범위 및 되돌리기 주의를 설명한다", () => {
    const html = renderToStaticMarkup(
      <ReviewOpPresetSection
        disabled={false}
        applying={false}
        onApply={vi.fn()}
      />,
    );

    expect(html).toContain("심의용 OP 세팅");
    expect(html).toContain("최종 사냥터");
    expect(html).toContain("퀘스트와 장비는 유지");
    expect(html).toContain("자동으로 되돌아가지 않습니다");
    expect(html).toContain("심의용 OP 세팅 적용");
  });

  it("처리 중에는 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <ReviewOpPresetSection disabled={false} applying onApply={vi.fn()} />,
    );

    expect(html).toContain("적용 중…");
    expect(html).toContain('disabled=""');
  });
});
