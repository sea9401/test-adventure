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

  it("자동 채집 정산에서 얻은 명장 산물을 결과에 표시한다", () => {
    const render = (masterProduct: { name: string; count: number } | null) =>
      renderToStaticMarkup(
        <AutoGatheringCard
          activityName="채광"
          spotId="iron_mine"
          session={null}
          result={{
            attempts: 800,
            successes: 600,
            materialName: "철광석",
            materialsGained: 430,
            xpGained: 2_100,
            masterProduct,
          }}
          loading={false}
          blockedByActivity={null}
          buttonVariant="warning"
          onStart={vi.fn(async () => {})}
          onClaim={vi.fn(async () => {})}
          onCancel={vi.fn(async () => {})}
        />,
      );

    expect(render({ name: "명장 합금", count: 3 })).toContain("명장 산물 · 명장 합금 +3");
    expect(render(null)).not.toContain("명장 산물");
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

  const readySession = {
    sessionId: "auto-ready",
    planId: "extended" as const,
    sourceId: "iron",
    sourceName: "철 광맥",
    materialId: "v2_iron_ore",
    spotId: "iron_quarry",
    startedAt: 0,
    readyAt: 1,
    durationMs: 2 * 60 * 60_000,
    attempts: 800,
  };

  it("편의가 열려 있고 정산할 수 있으면 보상을 받고 바로 다시 시작하는 버튼을 보여 준다", () => {
    const base = {
      activityName: "채광" as const,
      spotId: "copper_gallery",
      result: null,
      loading: false,
      blockedByActivity: null,
      buttonVariant: "warning" as const,
      onStart: vi.fn(async () => {}),
      onClaim: vi.fn(async () => {}),
      onCancel: vi.fn(async () => {}),
    };
    const unlocked = renderToStaticMarkup(
      <AutoGatheringCard {...base} session={readySession} onRestart={vi.fn(async () => {})} />,
    );
    expect(unlocked).toContain("보상 받고 다시 시작");
    expect(unlocked).toContain("자동 작업 보상 받기");

    // 편의가 잠겨 있으면 버튼이 없다.
    expect(renderToStaticMarkup(<AutoGatheringCard {...base} session={readySession} />)).not.toContain(
      "보상 받고 다시 시작",
    );
    // 아직 진행 중이면 버튼이 없다.
    expect(
      renderToStaticMarkup(
        <AutoGatheringCard
          {...base}
          session={{ ...readySession, readyAt: Date.now() + 60_000 }}
          onRestart={vi.fn(async () => {})}
        />,
      ),
    ).not.toContain("보상 받고 다시 시작");
  });

  it("다시 시작한 뒤에는 새 작업과 함께 방금 정산한 결과를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_quarry"
        session={{ ...readySession, readyAt: Date.now() + 60_000 }}
        result={{ attempts: 800, successes: 600, materialName: "철광석", materialsGained: 430, xpGained: 2_100 }}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );
    expect(html).toContain("남은 시간");
    expect(html).toContain("자동 채광 정산 완료");
    expect(html).toContain("철광석 +430");
  });

  it("정산 결과의 경험치 뒤에 식당 효과로 붙은 값을 적는다(건의 #882)", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_quarry"
        session={null}
        result={{
          attempts: 800,
          successes: 600,
          materialName: "철광석",
          materialsGained: 430,
          xpGained: 2_310,
          diningXpBonus: { menuName: "일꾼 도시락", xp: 210 },
        }}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={vi.fn(async () => {})}
        onClaim={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
      />,
    );
    expect(html.replaceAll("<!-- -->", "")).toContain("XP +2,310 (일꾼 도시락 +210)");
  });

  const HOUR = 60 * 60 * 1_000;
  const runningSession = {
    sessionId: "auto-1",
    planId: "extended" as const,
    sourceId: "copper",
    sourceName: "구리 광맥",
    materialId: "v2_copper_ore",
    startedAt: Date.now() - HOUR,
    readyAt: Date.now() + HOUR,
    durationMs: 2 * HOUR,
    spotId: "copper_gallery",
    attempts: 1_200,
  };
  const pineReservation = {
    activity: "woodcutting" as const,
    spotId: "pine_grove",
    planId: "extended" as const,
    sourceId: "pine",
    sourceName: "소나무",
    durationMs: 2 * HOUR,
    reservedAt: Date.now(),
  };
  const baseProps = {
    result: null,
    loading: false,
    onStart: vi.fn(async () => {}),
    onClaim: vi.fn(async () => {}),
    onCancel: vi.fn(async () => {}),
    onReserve: vi.fn(async () => {}),
    onUnreserve: vi.fn(async () => {}),
  };

  it("작업이 도는 동안 지원권이 있으면 고른 채집지를 다음 작업으로 예약할 수 있다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        spotName="철 채석장"
        session={runningSession}
        blockedByActivity={null}
        buttonVariant="warning"
        reservation={null}
        reservationAllowed
      />,
    );

    expect(html).toContain("다음 작업 예약");
    expect(html).toContain("철 채석장");
    expect(html).toContain("30분 예약");
    expect(html).toContain("2시간 예약");
    expect(html).not.toContain("예약 취소");
  });

  it("예약이 있으면 무엇을 얼마 동안 하는지와 취소를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        spotName="철 채석장"
        session={runningSession}
        blockedByActivity={null}
        buttonVariant="warning"
        reservation={pineReservation}
        reservationAllowed
      />,
    );

    expect(html).toContain("벌목 · 소나무 · 2시간");
    expect(html).toContain("예약 취소");
    expect(html).not.toContain("30분 예약");
  });

  it("다른 쪽 자동 채집이 도는 중이면 시작 대신 예약 버튼을 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        spotName="철 채석장"
        session={null}
        blockedByActivity="woodcutting"
        buttonVariant="warning"
        reservation={null}
        reservationAllowed
      />,
    );

    expect(html).toContain("30분 자동 채광 예약");
    expect(html).toContain("자동 벌목이 끝나면 이어서 시작합니다.");
    expect(html).not.toContain("시작할 수 없습니다");
  });

  it("지원권이 없으면 예약 조건 한 줄만 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        spotName="철 채석장"
        session={runningSession}
        blockedByActivity={null}
        buttonVariant="warning"
        reservation={null}
        reservationAllowed={false}
      />,
    );

    expect(html).toContain(
      "다음 작업 예약은 월간 모험 지원권 이용 중에 쓸 수 있습니다.",
    );
    expect(html).not.toContain("30분 예약");
  });

  it("진행 중인 자동 채집이 없으면 예약 안내를 보이지 않는다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        session={null}
        blockedByActivity={null}
        buttonVariant="warning"
        reservation={null}
        reservationAllowed={false}
      />,
    );

    expect(html).not.toContain("다음 작업 예약");
  });

  it("보상을 받은 뒤 이어진 예약 작업을 알려 준다", () => {
    const html = renderToStaticMarkup(
      <AutoGatheringCard
        {...baseProps}
        activityName="채광"
        spotId="iron_quarry"
        session={null}
        blockedByActivity="woodcutting"
        buttonVariant="warning"
        reservation={null}
        reservationAllowed
        chain={{ activity: "woodcutting", sourceName: "소나무" }}
      />,
    );

    expect(html).toContain("예약한 벌목(소나무)을 이어서 시작했습니다.");
    expect(html).toContain('href="/town/logging"');
  });
});
