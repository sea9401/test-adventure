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
    expect(html).toContain("기본 작업 · 재료 80% · 성공률 보정 없음");
    expect(html).toContain("느긋한 작업 · 재료 60% · 기본 성공률의 80%");
    expect(html).not.toContain("성공률 100%");
    expect(html).toContain("30분 자동 벌목 시작");
  });

  it("자동 채광 정산에서 획득한 부산물 이름과 수량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_mine"
        session={null}
        result={{
          attempts: 30,
          successes: 27,
          materialName: "철광석",
          materialsGained: 27,
          xpGained: 270,
          byproducts: [
            {
              materialId: "v2_mining_hard_stone",
              name: "단단한 돌",
              amount: 2,
            },
          ],
        }}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain("부산물");
    expect(html).toContain("단단한 돌 +2");
  });

  it("긴 작업 장소명과 별개로 남은 시간을 줄어들지 않는 영역에 표시한다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_mine"
        session={{
          sessionId: "auto-mining-long-name",
          planId: "extended",
          sourceId: "iron",
          sourceName: "아주 길어서 좁은 화면을 가득 채우는 깊은 철 광맥",
          materialId: "iron_ore",
          startedAt: Date.now(),
          readyAt: Date.now() + 2 * 60 * 60 * 1_000,
          attempts: 120,
        }}
        result={null}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('data-auto-gathering-time="remaining"');
    expect(html).toContain("min-w-0 truncate font-semibold");
    expect(html).toContain(
      "shrink-0 whitespace-nowrap font-bold tabular-nums",
    );
    expect(html).toContain("남은 시간 2:00:00");
  });

  it("정비한 채집지에서는 느긋한 작업 시간을 그 단계에 맞게 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_quarry"
        extendedDurationMs={156 * 60_000}
        session={null}
        result={null}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );
    expect(html).toContain("2시간 36분");
    expect(html).toContain("30분 자동 채광 시작");
  });

  it("진행 중인 작업은 시작할 때 굳힌 시간을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="벌목"
        spotId="pine_grove"
        extendedDurationMs={2 * 60 * 60_000}
        session={{
          sessionId: "auto-wood",
          planId: "extended",
          sourceId: "pine",
          sourceName: "소나무",
          materialId: "v2_timber",
          startedAt: 0,
          readyAt: 3 * 60 * 60_000,
          durationMs: 3 * 60 * 60_000,
          attempts: 1_200,
        }}
        result={null}
        loading={false}
        blockedByActivity={null}
        buttonVariant="success"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );
    expect(html).toContain("3시간 자동 벌목");
    expect(html).not.toContain("2시간 자동 벌목");
  });
});
