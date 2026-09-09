// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hunt: vi.fn(),
  huntBatch: vi.fn(),
}));

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({ state: { flags: [] }, set: vi.fn() }),
}));

vi.mock("@/adventure/v2/useDungeonHunt", () => ({
  useDungeonHunt: () => ({
    busy: false,
    lastResult: null,
    hunt: mocks.hunt,
    huntBatch: mocks.huntBatch,
  }),
}));

vi.mock("./autoHuntStopConditions", async (importActual) => {
  const actual = await importActual<typeof import("./autoHuntStopConditions")>();
  return {
    ...actual,
    useAutoHuntStopConfig: () => ({
      config: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG,
      configRef: { current: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG },
      updateConfig: vi.fn(),
    }),
  };
});

import { V2DungeonFloorView } from "./V2DungeonFloorView";

const baseProps = {
  floorId: 79,
  frontierDepth: 79,
  outpostId: "star-grave",
  outpostName: "별의 무덤 거점",
  playerName: "모험가",
  playerGender: "male" as const,
  stamina: { current: 100, lastUpdatedAt: 0 },
  setStamina: vi.fn(),
  onBack: vi.fn(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("미개척지 특화 최초 조회 중 사냥 잠금", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("GET 시작부터 단판·자동과 오프라인 시작 버튼을 같은 잠금 상태로 막는다", () => {
    render(
      <V2DungeonFloorView
        {...baseProps}
        combatCooldown={{ nextBattleAt: 0, cooldownMs: 0 }}
        offlineHunt={null}
      />,
    );

    const huntButton = screen.getByRole("button", { name: /사냥 \(길게 눌러 자동\)/ });
    const offlineButton = screen.getByRole("button", { name: "오프라인 사냥" });
    expect((huntButton as HTMLButtonElement).disabled).toBe(true);
    expect((offlineButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(huntButton);
    fireEvent.pointerDown(huntButton);
    fireEvent.click(offlineButton);
    expect(mocks.hunt).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("GET 시작부터 저장된 일괄 횟수의 실행 버튼을 막는다", () => {
    localStorage.setItem("v2-hunt-count.v1", "5");
    render(<V2DungeonFloorView {...baseProps} />);

    const batchButton = screen.getByRole("button", { name: /5회 사냥/ });
    expect((batchButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(batchButton);
    expect(mocks.huntBatch).not.toHaveBeenCalled();
  });

  it("길게 누르는 도중 특화 저장이 시작되면 예약된 자동 사냥도 취소한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ok: true,
        unlocked: true,
        mode: { mode: "standard" },
      }))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    mocks.hunt.mockResolvedValue(null);
    render(<V2DungeonFloorView {...baseProps} />);

    const huntButton = screen.getByRole("button", { name: /사냥 \(길게 눌러 자동/ });
    await vi.waitFor(() => {
      expect((huntButton as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.pointerDown(huntButton);
    fireEvent.click(screen.getByRole("radio", { name: /무작위 특화/ }));
    expect((huntButton as HTMLButtonElement).disabled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(mocks.hunt).not.toHaveBeenCalled();
    expect(huntButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("깊이 80 POST를 깊이 82에서도 소유해 대체 GET 없이 잠금과 선택을 함께 유지한다", async () => {
    localStorage.setItem("v2-hunt-count.v1", "5");
    const firstGet = deferred<Response>();
    const oldPost = deferred<Response>();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstGet.promise)
      .mockImplementationOnce(() => oldPost.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <V2DungeonFloorView
        {...baseProps}
        floorId={80}
        combatCooldown={{ nextBattleAt: 0, cooldownMs: 0 }}
        offlineHunt={null}
      />,
    );
    firstGet.resolve(Response.json({
      ok: true,
      unlocked: true,
      mode: { mode: "standard" },
    }));
    const standard = screen.getByRole("radio", { name: /일반 사냥/ });
    await vi.waitFor(() => {
      expect((standard as HTMLInputElement).checked).toBe(true);
      expect((standard as HTMLInputElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("radio", { name: /무작위 특화/ }));
    const coreHunt = screen.getByRole("button", { name: /사냥 \(길게 눌러 자동/ });
    const offline = screen.getByRole("button", { name: "오프라인 사냥" });
    expect((coreHunt as HTMLButtonElement).disabled).toBe(true);
    expect((offline as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(coreHunt);
    fireEvent.pointerDown(coreHunt);
    fireEvent.click(offline);

    rerender(<V2DungeonFloorView {...baseProps} floorId={82} />);
    const batch = screen.getByRole("button", { name: /5회 사냥/ });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect((batch as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);
    });
    fireEvent.click(batch);
    fireEvent.pointerDown(batch);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(mocks.hunt).not.toHaveBeenCalled();
    expect(mocks.huntBatch).not.toHaveBeenCalled();
    oldPost.resolve(Response.json({ ok: true, mode: { mode: "random" } }));
    await vi.waitFor(() => {
      expect((screen.getByRole("radio", { name: /무작위 특화/ }) as HTMLInputElement).checked).toBe(true);
      expect((batch as HTMLButtonElement).disabled).toBe(false);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("POST 중 특화 패널을 숨겼다가 다시 열어도 controller와 부모 busy를 유지한다", async () => {
    localStorage.setItem("v2-hunt-count.v1", "5");
    const oldPost = deferred<Response>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ok: true,
        unlocked: true,
        mode: { mode: "standard" },
      }))
      .mockImplementationOnce(() => oldPost.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <V2DungeonFloorView {...baseProps} floorId={80} />,
    );
    await vi.waitFor(() => {
      expect((screen.getByRole("radio", { name: /일반 사냥/ }) as HTMLInputElement).checked).toBe(true);
    });

    fireEvent.click(screen.getByRole("radio", { name: /무작위 특화/ }));
    rerender(<V2DungeonFloorView {...baseProps} floorId={85} />);
    expect(screen.queryByRole("radiogroup", { name: "미개척지 특화 사냥" })).toBeNull();
    const hiddenBatch = screen.getByRole("button", { name: /5회 사냥/ });
    expect((hiddenBatch as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(hiddenBatch);
    expect(mocks.huntBatch).not.toHaveBeenCalled();

    rerender(<V2DungeonFloorView {...baseProps} floorId={82} />);
    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    oldPost.resolve(Response.json({ ok: true, mode: { mode: "random" } }));
    await vi.waitFor(() => {
      expect((screen.getByRole("radio", { name: /무작위 특화/ }) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByRole("button", { name: /5회 사냥/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
