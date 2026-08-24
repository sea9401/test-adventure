// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDangerousRealtimeState } from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import { DangerousFishingRealtimePanel } from "./DangerousFishingRealtimePanel";
import type { DangerousRealtimeClientEncounter } from "./useDangerousFishingRealtime";

function encounterFixture(
  patch: Partial<DangerousRealtimeClientEncounter["checkpoint"]> = {},
  balanceRevision: DangerousRealtimeClientEncounter["balanceRevision"] = 2,
): DangerousRealtimeClientEncounter {
  const startedAt = Date.now() - 1_000;
  const config: DangerousRealtimeClientEncounter["config"] = {
    seed: 17,
    risk: 3,
    targetKind: "fish",
    rarity: "rare",
    behaviorPattern: ["turn", "charge", "dive", "thrash"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: 10_000,
    initialDistance: 10_000,
    maxTicks: 400,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "reef_bait",
      slackTolerance: 1,
    }),
  };
  const checkpoint = {
    ...createDangerousRealtimeState(config, balanceRevision),
    ...patch,
  };
  return {
    simulationVersion: 2,
    balanceRevision,
    id: "realtime-panel",
    targetKind: "fish",
    targetId: "ironjaw_tuna",
    config,
    checkpoint,
    approvedTick: checkpoint.tick,
    revision: 0,
    startedAt,
    expiresAt: startedAt + 20_000,
  };
}

const baseProps = {
  scene: {
    encounterImageSrc: "/images/ui/dangerous-fishing-storm-trench-encounter.webp",
    depth: "midwater" as const,
    risk: 3,
    description: "폭풍 해구 중층",
  },
  targetMetadata: {
    imageSrc: "/images/fish/ironjaw_tuna.webp",
    name: "철턱 참치",
  },
  endpointTarget: {
    kind: "voyage" as const,
    endpoint: "/api/v2/dangerous-fishing/encounter" as const,
  },
  readJson: (response: Response) => response.json(),
  verification: null,
  onFinish: vi.fn(),
};

const verificationChallenge = {
  activity: "fishing" as const,
  siteKey: "turnstile-site-key",
  captchaSiteKey: null,
  reason: "volume" as const,
  manualTest: true,
};

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("위험 해역 실시간 조우 HUD", () => {
  it("캔버스 밖의 불투명 DOM에 조작과 모든 판정 수치를 접근 가능하게 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({
          tick: 40,
          tension: 620,
          stamina: 7_500,
          distance: 8_000,
        })}
      />,
    );

    expect(html).toContain("누르고 감아올리기");
    expect(html).toContain("낚싯줄 장력");
    expect(html).toContain("어체력");
    expect(html).toContain("남은 거리");
    expect(html).toContain("남은 시간");
    expect(html).toContain("활성 미끼 효과");
    expect(html).toContain("급선회 거리·장력 충격 20% 감소");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="620"');
    expect(html).toContain("안전 구간");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("연결됨");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("추천");
    expect(html).not.toContain("현재 행동");
    expect(html).not.toMatch(/bg-[^\" ]+\/(40|70)/);
  });

  it("물고기가 시작 거리 밖으로 달아나도 남은 거리 meter의 현재값은 접근성 최대값을 넘지 않는다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({ distance: 12_000 })}
      />,
    );

    const distance = screen.getByRole("meter", { name: "남은 거리" });
    expect(distance.getAttribute("aria-valuenow")).toBe("12000");
    expect(distance.getAttribute("aria-valuemax")).toBe("20000");
    expect(distance.getAttribute("aria-valuetext")).toBe("12,000 / 10,000");
    expect(distance.textContent).toContain("12,000 / 10,000");
    const fill = distance.querySelector<HTMLElement>(".bg-sky-500");
    expect(fill?.style.width).toBe("100%");
  });

  it("mobile에서도 상태·경고 변화와 무관하게 조작 카드를 하단에 고정한다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture()}
      />,
    );

    const button = screen.getByRole("button", { name: "누르고 감아올리기" });
    const control = button.parentElement;
    expect(control?.className.split(" ")).toContain("sticky");
    expect(control?.className.split(" ")).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]",
    );
    expect(control?.className.split(" ")).toContain("z-20");
    expect(control?.className.split(" ")).not.toContain("sm:sticky");
    expect(control?.className).toContain(
      "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
    );
    expect(button.className).toContain("min-h-16");
  });

  it("장력 경고를 조작 카드의 바깥 흐름에 띄워 버튼 위치를 바꾸지 않는다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({ tension: 200 })}
      />,
    );

    const button = screen.getByRole("button", { name: "누르고 감아올리기" });
    const control = button.parentElement;
    const alert = screen.getByRole("alert");

    expect(alert.textContent).toContain("장력이 너무 낮습니다");
    expect(control?.contains(alert)).toBe(true);
    expect(control?.className.split(" ")).toContain("relative");
    expect(alert.className.split(" ")).toContain("absolute");
    expect(alert.className.split(" ")).toContain("pointer-events-none");
  });

  it("시작 전 1초 준비 구간에는 조작을 잠그고 시간이 지나면 자동으로 시작한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const encounter = encounterFixture();

    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={{
          ...encounter,
          startedAt: 1_800_000_001_000,
          expiresAt: 1_800_000_021_000,
        }}
      />,
    );

    const preparingButton = screen.getByRole("button", { name: "조우 준비 중" });
    expect((preparingButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("잠시 후 시작");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const activeButton = screen.getByRole("button", { name: "누르고 감아올리기" });
    expect((activeButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("입력 가능한 대기 상태를 장력 HUD와 감아올리기 버튼에 명시적으로 표시한다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture()}
      />,
    );

    expect(screen.getByText("조작 가능")).not.toBeNull();
    const button = screen.getByRole("button", { name: "누르고 감아올리기" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.className).toContain("ring-2");
  });

  it("포인터 capture와 해제·취소·capture 상실을 모두 hold/release로 연결한다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture()}
      />,
    );
    const button = screen.getByRole("button", { name: "누르고 감아올리기" });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(button, {
      setPointerCapture,
      releasePointerCapture,
      hasPointerCapture: vi.fn(() => true),
    });

    fireEvent.pointerDown(button, { pointerId: 7 });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(button, { pointerId: 7 });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    fireEvent.pointerDown(button, { pointerId: 8 });
    fireEvent.pointerCancel(button, { pointerId: 8 });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.pointerDown(button, { pointerId: 9 });
    fireEvent.lostPointerCapture(button, { pointerId: 9 });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("Space의 스크롤과 repeat를 막고 keyup에서 안전하게 줄을 놓는다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture()}
      />,
    );
    const button = screen.getByRole("button", { name: "누르고 감아올리기" });
    const initialRepeat = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
      repeat: true,
    });
    fireEvent(button, initialRepeat);
    expect(initialRepeat.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    const down = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
    });
    fireEvent(button, down);
    expect(down.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    const repeated = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
      repeat: true,
    });
    fireEvent(button, repeated);
    expect(repeated.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    const up = new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
    });
    fireEvent(button, up);
    expect(up.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it.each(["pointer", "space"] as const)(
    "%s hold 중 외부 사람 확인이 도착하면 release 기록을 남기고 조작을 비활성화한다",
    (input) => {
      const encounter = encounterFixture();
      const rendered = render(
        <DangerousFishingRealtimePanel
          {...baseProps}
          encounter={encounter}
        />,
      );
      const button = screen.getByRole("button", { name: "누르고 감아올리기" });
      Object.assign(button, {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        hasPointerCapture: vi.fn(() => true),
      });
      if (input === "pointer") {
        fireEvent.pointerDown(button, { pointerId: 11 });
      } else {
        fireEvent.keyDown(button, { code: "Space", key: " " });
      }
      expect(button.getAttribute("aria-pressed")).toBe("true");

      rendered.rerender(
        <DangerousFishingRealtimePanel
          {...baseProps}
          encounter={encounter}
          verification={verificationChallenge}
        />,
      );

      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByRole("status").textContent).toContain(
        "사람 확인 후 동기화 재개",
      );
      const stored = JSON.parse(
        sessionStorage.getItem(
          `dangerous-fishing.realtime.v2:${encounter.id}`,
        )!,
      ) as { inputs: Array<{ mode: string }> };
      expect(stored.inputs.at(-1)?.mode).toBe("release");
    },
  );

  it("Canvas 초기화 실패에서도 경고·결과와 독립적인 DOM 조작을 유지한다", async () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({ tension: 850 })}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-renderer="solid-underwater"]')).not.toBeNull();
    });
    expect(screen.getByRole("alert").textContent).toContain("장력이 너무 높습니다");
    expect(
      (screen.getByRole("button", { name: "누르고 감아올리기" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("종료 결과를 접근 가능한 상태로 알린다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({ status: "line_broken", tension: 1_000 })}
      />,
    );

    expect(html).toContain("조우 실패");
    expect(html).toContain("낚싯줄 끊김");
    expect(html).toContain('aria-label="조우 종료"');
    expect(html).not.toContain(">누르고 감아올리기</span>");
    expect(html).not.toContain('data-realtime-region="alert"');
    expect(html).toContain('role="status"');
  });

  it("오프라인 종료 경고가 결과 영역 위에 떠서 재시도 동선을 가리지 않는다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({ status: "hook_lost", tension: 0 })}
      />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(100));

    expect(screen.getByText(/조우 실패 · 바늘 빠짐/)).not.toBeNull();
    expect(screen.getByText(/오프라인 보관 · 재전송 필요/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "결과 전송 다시 시도" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("로컬 어획 성공은 서버 응답 전까지 확정 대신 확인 대기라고 알린다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({
          status: "caught",
          stamina: 0,
          distance: 0,
        })}
      />,
    );

    expect(html).toContain("어획 성공 · 서버 확인 대기");
    expect(html).not.toContain("어획 결과를 확정했습니다");
  });

  it.each([2, 3] as const)(
    "revision %i의 0/0 대기 구간은 포획 확보·자동 인양 단계로 표시하고 조작을 잠근다",
    (balanceRevision) => {
    const html = renderToStaticMarkup(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({
          tick: 166,
          status: "active",
          tension: 900,
          stamina: 0,
          distance: 0,
        }, balanceRevision)}
      />,
    );

    expect(html).toContain("포획 확보 · 인양 중");
    expect(html).toContain("최소 연출 시간까지 자동 인양 중");
    expect(html).toContain('aria-label="포획 확보 · 자동 인양 중"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("누르고 감아올리기");
    expect(html).not.toContain("줄을 풀어 장력 조절 중");
    expect(html).not.toContain("장력이 너무 높습니다");
    },
  );

  it("revision 1은 0/0에서도 secured floor 대기 UI를 사용하지 않는다", () => {
    render(
      <DangerousFishingRealtimePanel
        {...baseProps}
        encounter={encounterFixture({
          status: "active",
          stamina: 0,
          distance: 0,
        }, 1)}
      />,
    );

    expect(screen.queryByText("포획 확보 · 인양 중")).toBeNull();
    expect(
      (screen.getByRole("button", {
        name: "누르고 감아올리기",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
