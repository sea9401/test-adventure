// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDangerousRealtimeState } from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import {
  DangerousFishingBossPanel,
  type DangerousFishingBossViewModel,
} from "./DangerousFishingBossPanel";
import type { DangerousRealtimeClientEncounter } from "./useDangerousFishingRealtime";

const NOW = 1_800_000_000_000;

function bossModel(
  patch: Partial<DangerousFishingBossViewModel> = {},
): DangerousFishingBossViewModel {
  return {
    ok: true,
    now: NOW,
    event: {
      id: "event-ui",
      bossId: "tidal_colossus",
      name: "해일의 거신",
      stamina: 12_000,
      maxStamina: 18_000,
      status: "active",
      spawnedAt: NOW - 60_000,
      expiresAt: NOW + 5 * 60 * 60_000,
      defeatedAt: null,
      isDiscoverer: true,
      isLastHaul: false,
    },
    contribution: {
      totalContribution: 240,
      successfulAttempts: 1,
      rewardClaimedAt: null,
    },
    attempt: null,
    realtimeAttempt: null,
    eligible: true,
    claimed: false,
    rewardPreview: {
      tier: "base",
      fishingCoins: 120,
      materialCount: 2,
      discovererBonus: true,
    },
    ...patch,
  };
}

const handlers = {
  onStart: vi.fn(async () => true),
  onAction: vi.fn(async () => true),
  onClaim: vi.fn(async () => true),
  readJson: (response: Response) => response.json(),
  onRealtimeFinish: vi.fn(),
};

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function realtimeBossEncounter(): DangerousRealtimeClientEncounter {
  const config: DangerousRealtimeClientEncounter["config"] = {
    seed: 31,
    risk: 5,
    targetKind: "boss",
    rarity: "boss",
    behaviorPattern: ["charge", "thrash", "dive", "turn"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: 12_000,
    initialDistance: 12_000,
    maxTicks: 600,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "basic_bait",
    }),
  };
  const checkpoint = createDangerousRealtimeState(config);
  return {
    simulationVersion: 2,
    balanceRevision: 2,
    id: "boss-realtime-attempt",
    targetKind: "boss",
    targetId: "tidal_colossus",
    config,
    checkpoint,
    approvedTick: 0,
    revision: 0,
    startedAt: NOW,
    expiresAt: NOW + 30_000,
  };
}

describe("거대어 비동기 기여 패널", () => {
  it("활성 이벤트의 공용 체력·남은 시간·내 기여·발견자를 표시하고 순위는 숨긴다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel model={bossModel()} busy={false} {...handlers} />,
    );
    expect(html).toContain("해일의 거신");
    expect(html).toContain("tidal_colossus.webp");
    expect(html).toContain("dangerous-fishing-storm-trench.webp");
    expect(html).toContain("12,000 / 18,000");
    expect(html).toContain("약 5시간 남음");
    expect(html).toContain("발견자");
    expect(html).toContain("내 누적 기여 240");
    expect(html).toContain("기본 보상 자격 확보");
    expect(html).toContain("개인 시도 1회 성공");
    expect(html).toContain("낚시 코인·거대어 증표");
    expect(html).toContain("전용 장비·미끼·칭호·꾸미기");
    expect(html).not.toContain("기여 순위");
    expect(html).not.toContain("1위");
  });

  it("개인 시도가 복원되면 공용 현황과 장력 조작을 중복 이미지 없이 한 화면에서 이어서 한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={bossModel({
          attempt: {
            eventId: "event-ui",
            encounter: {
              id: "boss-attempt",
              targetKind: "boss",
              targetId: "tidal_colossus",
              status: "active",
              tension: 58,
              maxTension: 100,
              stamina: 200,
              maxStamina: 240,
              distance: 130,
              startDistance: 150,
              slackTurns: 0,
              slackTolerance: 0,
              step: 2,
              revision: 2,
              nextActionAt: NOW,
              expiresAt: NOW + 120_000,
              reelPowerBonus: 0,
              staminaDamageBonus: 0,
              tensionControlBonus: 0,
              behavior: "charge",
            },
          },
        })}
        busy={false}
        {...handlers}
      />,
    );
    expect(html).toContain("개인 장력 시도");
    expect(html).toContain("1~3분");
    expect(html).toContain("공용 제압 현황");
    expect(html).toContain("내 누적 기여 240");
    expect(html).toContain("이번 성공 시 기여 240");
    expect(html).toContain("감아올리기");
    expect(html).toContain("줄 풀기");
    expect(html).toContain("버티기");
    expect((html.match(/<img /g) ?? []).length).toBe(2);
  });

  it("versionless v1 개인 시도의 세 버튼은 기존 onAction 계약을 호출한다", () => {
    const onAction = vi.fn(async () => true);
    render(
      <DangerousFishingBossPanel
        model={bossModel({
          attempt: {
            eventId: "event-ui",
            encounter: {
              id: "boss-attempt",
              targetKind: "boss",
              targetId: "tidal_colossus",
              status: "active",
              tension: 58,
              maxTension: 100,
              stamina: 200,
              maxStamina: 240,
              distance: 130,
              startDistance: 150,
              slackTurns: 0,
              slackTolerance: 0,
              step: 2,
              revision: 2,
              nextActionAt: NOW,
              expiresAt: NOW + 120_000,
              reelPowerBonus: 0,
              staminaDamageBonus: 0,
              tensionControlBonus: 0,
              behavior: "charge",
            },
          },
        })}
        busy={false}
        {...handlers}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /감아올리기/ }));
    expect(onAction).toHaveBeenCalledWith(
      "reel",
      "event-ui",
      "boss-attempt",
      2,
    );
  });

  it("v2 개인 시도는 공용 기여 요약을 유지하고 scene 이미지는 Canvas에만 맡긴다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={bossModel({
          attempt: null,
          realtimeAttempt: {
            eventId: "event-ui",
            encounter: realtimeBossEncounter(),
          },
        })}
        busy={false}
        {...handlers}
      />,
    );

    expect(html).toContain("공용 제압 현황");
    expect(html).toContain("내 누적 기여 240");
    expect(html).toContain("이번 성공 시 기여");
    expect((html.match(/aria-label="누르고 감아올리기"/g) ?? []).length).toBe(1);
    expect(html).toContain("<canvas");
    expect((html.match(/<img /g) ?? []).length).toBe(0);
    expect(html).not.toContain("추천");
    expect(html).not.toContain("현재 행동");
  });

  it("v2 개인 시도는 hold 조작만 노출하고 legacy onAction을 사용하지 않는다", () => {
    const onAction = vi.fn(async () => true);
    render(
      <DangerousFishingBossPanel
        model={bossModel({
          attempt: null,
          realtimeAttempt: {
            eventId: "event-ui",
            encounter: realtimeBossEncounter(),
          },
        })}
        busy={false}
        {...handlers}
        onAction={onAction}
      />,
    );

    const hold = screen.getByRole("button", { name: "누르고 감아올리기" });
    fireEvent.keyDown(hold, { code: "Space", key: " " });
    fireEvent.keyUp(hold, { code: "Space", key: " " });

    expect(screen.queryByRole("button", { name: /^감아올리기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^줄 풀기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^버티기/ })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("줄이 끊긴 뒤에는 누적 기여를 보존한 채 다시 시도할 수 있다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel model={bossModel()} busy={false} {...handlers} />,
    );
    expect(html).toContain("개인 시도 시작");
    expect(html).toContain("실패해도 기존 기여는 유지");
  });

  it("처치된 이벤트는 자격과 막타 기록을 보여주며 보상을 한 번 수령한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={bossModel({
          event: {
            ...bossModel().event!,
            stamina: 0,
            status: "defeated",
            defeatedAt: NOW,
            isLastHaul: true,
          },
        })}
        busy={false}
        {...handlers}
      />,
    );
    expect(html).toContain("제압 완료");
    expect(html).toContain("마지막 인양 기록");
    expect(html).toContain("보상 수령");
    expect(html).not.toContain("독점");
  });

  it("이벤트가 없으면 위험도 높은 영웅 이상 어획에서 발견된다고 안내한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={bossModel({ event: null, contribution: null, eligible: false, rewardPreview: null })}
        busy={false}
        {...handlers}
      />,
    );
    expect(html).toContain("현재 포착된 거대어가 없습니다");
    expect(html).toContain("위험도 4 이상");
    expect(html).toContain("거대어를 발견하면 모든 낚시꾼이 함께 제압");
    expect(html).toContain("거대어 증표는 전용 장비·미끼·칭호·꾸미기 교환");
    expect(html).toContain("dangerous-fishing-abyssal-rift.webp");
  });

  it("개인 시도 결과를 즉시 알린다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={bossModel()}
        busy={false}
        feedback={{
          scope: "boss",
          tone: "success",
          title: "개인 시도 성공",
          detail: "공용 제압에 240만큼 기여했습니다.",
          terminal: true,
        }}
        {...handlers}
      />,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("개인 시도 성공");
    expect(html).toContain("공용 제압에 240만큼 기여했습니다.");
  });
});
