// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DangerousRealtimeView } from "./dangerousFishingRealtime";
import { DangerousFishingRealtimeCanvas } from "./DangerousFishingRealtimeCanvas";

function viewFixture(): DangerousRealtimeView {
  return {
    tick: 10,
    mode: "release",
    status: "active",
    tension: 500,
    maxTension: 1_000,
    stamina: 7_500,
    maxStamina: 10_000,
    distance: 8_000,
    startDistance: 10_000,
    lowTensionTicks: 0,
    behavior: "turn",
    behaviorCursor: 0,
    phase: "active",
    phaseTicksRemaining: 5,
    chainRemaining: 0,
    targetTicks: 200,
    maxTicks: 400,
    performanceScalePermille: 1_000,
    safeTensionMin: 300,
    safeTensionMax: 700,
    remainingTicks: 390,
    telegraphs: [],
  };
}

const props = {
  view: viewFixture(),
  scene: {
    encounterImageSrc: "/scene.webp",
    depth: "deep" as const,
    risk: 5,
    description: "심연",
  },
  target: {
    imageSrc: "/failed-fish.webp",
    name: "시험 어종",
  },
  reducedMotion: false,
};

type ObserverCallback = ResizeObserverCallback;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.active = false;
  });
  private active = true;

  constructor(private readonly callback: ObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  trigger() {
    if (this.active) {
      this.callback([], this as unknown as ResizeObserver);
    }
  }
}

function installImageLoader(rejectedSrc?: string) {
  class FakeImage {
    naturalWidth = 640;
    naturalHeight = 360;
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    set src(value: string) {
      queueMicrotask(() => {
        if (value === rejectedSrc) {
          this.onerror?.(new Event("error"));
        } else {
          this.onload?.(new Event("load"));
        }
      });
    }
  }

  vi.stubGlobal("Image", FakeImage);
}

function installCanvasContext() {
  const context = {
    setTransform: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

describe("DangerousFishingRealtimeCanvas failure boundary", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 91));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    installImageLoader();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("2D context가 없으면 마운트된 장면을 DOM fallback으로 바꾼다", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container } = render(
      <DangerousFishingRealtimeCanvas {...props} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-renderer="solid-underwater"]'),
      ).not.toBeNull();
    });
  });

  it("대상 이미지 거절 시 실패 URL과 무관한 정적 물고기 visual을 보인다", async () => {
    installCanvasContext();
    installImageLoader(props.target.imageSrc);

    const { container } = render(
      <DangerousFishingRealtimeCanvas {...props} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-fallback-fish="silhouette"]'),
      ).not.toBeNull();
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain(props.target.imageSrc);
  });

  it.each(["missing", "throwing"] as const)(
    "%s ResizeObserver에서는 DOM fallback으로 바꾼다",
    async (failure) => {
      installCanvasContext();
      if (failure === "missing") {
        vi.stubGlobal("ResizeObserver", undefined);
      } else {
        vi.stubGlobal(
          "ResizeObserver",
          class {
            constructor() {
              throw new Error("observer unavailable");
            }
          },
        );
      }

      const { container } = render(
        <DangerousFishingRealtimeCanvas {...props} />,
      );

      await waitFor(() => {
        expect(
          container.querySelector('[data-renderer="solid-underwater"]'),
        ).not.toBeNull();
      });
    },
  );

  it("observe 뒤 초기 canvas sizing 실패에서도 observer 수명을 끝낸다", async () => {
    const context = installCanvasContext();
    context.setTransform.mockImplementationOnce(() => {
      throw new Error("initial transform failure");
    });
    const { container, unmount } = render(
      <DangerousFishingRealtimeCanvas {...props} />,
    );
    const observer = FakeResizeObserver.instances[0];

    expect(observer.observe).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        container.querySelector('[data-renderer="solid-underwater"]'),
      ).not.toBeNull();
    });
    expect(observer.disconnect).toHaveBeenCalledTimes(1);

    context.setTransform.mockClear();
    unmount();
    observer.trigger();
    expect(context.setTransform).not.toHaveBeenCalled();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it("후속 ResizeObserver 콜백 예외를 밖으로 던지지 않고 fallback으로 보낸다", async () => {
    installCanvasContext();
    let boundsReadCount = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => {
        boundsReadCount += 1;
        if (boundsReadCount > 1) throw new Error("late resize failure");
        return {
          width: 640,
          height: 360,
          x: 0,
          y: 0,
          top: 0,
          right: 640,
          bottom: 360,
          left: 0,
          toJSON: () => ({}),
        };
      });
    const { container } = render(
      <DangerousFishingRealtimeCanvas {...props} />,
    );

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(() => {
      act(() => FakeResizeObserver.instances[0].trigger());
    }).not.toThrow();
    await waitFor(() => {
      expect(
        container.querySelector('[data-renderer="solid-underwater"]'),
      ).not.toBeNull();
    });
  });

  it("unmount에서 observer와 예약된 animation frame을 정리한다", async () => {
    installCanvasContext();
    const requestFrame = vi.mocked(window.requestAnimationFrame);
    const cancelFrame = vi.mocked(window.cancelAnimationFrame);
    const { unmount } = render(<DangerousFishingRealtimeCanvas {...props} />);

    await waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(1));
    const observer = FakeResizeObserver.instances[0];
    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(91);
  });
});
