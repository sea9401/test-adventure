import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutoGatheringCard } from "./AutoGatheringCard";

describe("AutoGatheringCard", () => {
  it("30분 기본 작업과 2시간 저효율 작업을 함께 제시한다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="벌목"
        spotId="pine_grove"
        session={null}
        result={null}
        loading={false}
        blockedByActivity={null}
        buttonVariant="success"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('aria-label="자동 작업 시간 선택"');
    expect(html).toContain("30분");
    expect(html).toContain("2시간");
    expect(html).toContain("느긋한 작업 · 재료 60% · 성공률 80%");
    expect(html).toContain("30분 자동 벌목 시작");
  });
});
