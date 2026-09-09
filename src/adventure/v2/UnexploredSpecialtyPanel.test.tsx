// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { UnexploredSpecialtyPanel } from "./UnexploredSpecialtyPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnexploredSpecialtyPanel", () => {
  it("일반·무작위·12개 집중 선택과 각 풀의 전투 성격·몬스터·장비를 표시한다", () => {
    const { container } = render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "미개척지 특화 사냥" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(14);
    expect((screen.getByRole("radio", { name: /일반 사냥/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/무작위 특화.*0\.4%/)).toBeTruthy();
    expect(screen.getByText(/철갑 군단.*0\.6%/)).toBeTruthy();
    expect(screen.getByText("순수한 물리 방어와 피격 누적 방어")).toBeTruthy();
    expect(screen.getByText("철갑 방패병")).toBeTruthy();
    expect(screen.getByText("철갑 전열갑")).toBeTruthy();
    expect(container.firstElementChild?.className).toContain(SURFACE_CARD.split(" ")[0]);
    expect(container.innerHTML).toContain(SURFACE_INSET.split(" ")[0]);
    expect(container.innerHTML).toContain("dark:text-zinc-");
    expect(container.innerHTML).not.toMatch(/data-specialty-card[^>]*opacity-/);
  });

  it("키보드로 접근 가능한 라디오에 연결된 풀 이름을 제공한다", () => {
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
      />,
    );

    const focused = screen.getByRole("radio", { name: /철갑 군단.*집중.*0\.6%/ });
    focused.focus();
    expect(document.activeElement).toBe(focused);
    expect(focused.getAttribute("name")).toBe("unexplored-specialty-mode");
  });

  it("POST 성공 뒤에만 선택을 반영하고 저장 중에는 전체 선택과 사냥을 잠근다", async () => {
    let resolveRequest!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onSavingChange = vi.fn();
    const onModeChange = vi.fn();
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        onSavingChange={onSavingChange}
        onModeChange={onModeChange}
      />,
    );

    const standard = screen.getByRole("radio", { name: /일반 사냥/ });
    const focused = screen.getByRole("radio", { name: /철갑 군단.*집중.*0\.6%/ });
    fireEvent.click(focused);

    expect((standard as HTMLInputElement).checked).toBe(true);
    expect((focused as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);
    expect(onSavingChange).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/dungeon/specialty-focus",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "focused", poolId: "iron_legion" }),
      }),
    );

    resolveRequest(Response.json({ ok: true, mode: { mode: "focused", poolId: "iron_legion" } }));
    await waitFor(() => {
      expect((focused as HTMLInputElement).checked).toBe(true);
      expect(onSavingChange).toHaveBeenLastCalledWith(false);
    });
    expect(onModeChange).toHaveBeenCalledWith({ mode: "focused", poolId: "iron_legion" });
  });

  it("서버의 저장 모드를 읽는 동안 선택을 잠그고 권위값을 반영한다", async () => {
    let resolveRequest!: (value: Response) => void;
    const onSavingChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        loadFromServer
        onSavingChange={onSavingChange}
      />,
    );

    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);
    expect(onSavingChange).toHaveBeenCalledWith(true);
    resolveRequest(Response.json({
      ok: true,
      unlocked: true,
      mode: { mode: "focused", poolId: "iron_legion" },
    }));

    const focused = screen.getByRole("radio", { name: /철갑 군단.*집중.*0\.6%/ }) as HTMLInputElement;
    await waitFor(() => expect(focused.checked).toBe(true));
    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(false);
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("최초 GET이 HTTP 오류면 가짜 일반 선택을 표시하지 않고 같은 일반 선택도 POST로 확정한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { ok: false, error: "load_failed" },
        { status: 503 },
      ))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        mode: { mode: "standard" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        loadFromServer
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain("불러오지 못했습니다");
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /일반 사냥/ }));

    await waitFor(() => {
      expect((screen.getByRole("radio", { name: /일반 사냥/ }) as HTMLInputElement).checked).toBe(true);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v2/dungeon/specialty-focus",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "standard" }),
      }),
    );
  });

  it("최초 GET이 네트워크 오류면 오류를 알리고 다시 불러와 서버 선택을 복구한다", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        unlocked: true,
        mode: { mode: "focused", poolId: "iron_legion" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        loadFromServer
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => {
      expect((screen.getByRole("radio", { name: /철갑 군단.*집중/ }) as HTMLInputElement).checked).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("POST 실패 시 기존 선택을 유지하고 오류를 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { ok: false, error: "save_failed" },
      { status: 500 },
    )));
    render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /무작위 특화.*0\.4%/ }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /일반 사냥/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /무작위 특화.*0\.4%/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("잠금 상태에서도 불투명 표면을 유지하고 선택만 비활성화한다", () => {
    const { container } = render(
      <UnexploredSpecialtyPanel
        unlocked={false}
        initialMode={{ mode: "standard" }}
      />,
    );

    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);
    expect(screen.getByText(/깊이 79/)).toBeTruthy();
    expect(container.firstElementChild?.className).toContain(SURFACE_CARD.split(" ")[0]);
    expect(container.firstElementChild?.className).not.toContain("opacity-");
  });

  it("같은 화면에서 깊이 79를 개척하면 선택을 즉시 해금한다", () => {
    const view = render(
      <UnexploredSpecialtyPanel
        unlocked={false}
        initialMode={{ mode: "standard" }}
      />,
    );
    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(true);

    view.rerender(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
      />,
    );

    expect(screen.getAllByRole("radio").every((radio) => radio.matches(":disabled"))).toBe(false);
  });

  it("GET 도중 언마운트되면 완료와 정리 단계가 이전 부모 callback을 다시 호출하지 않는다", async () => {
    let resolveGet!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveGet = resolve;
    })));
    const onSavingChange = vi.fn();
    const view = render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        loadFromServer
        onSavingChange={onSavingChange}
      />,
    );
    expect(onSavingChange).toHaveBeenCalledTimes(1);
    expect(onSavingChange).toHaveBeenLastCalledWith(true);

    view.unmount();
    resolveGet(Response.json({
      ok: true,
      unlocked: true,
      mode: { mode: "focused", poolId: "iron_legion" },
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onSavingChange).toHaveBeenCalledTimes(1);
  });

  it("POST 도중 언마운트되면 이전 성공 결과와 busy callback을 폐기한다", async () => {
    let resolvePost!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolvePost = resolve;
    })));
    const onSavingChange = vi.fn();
    const onModeChange = vi.fn();
    const view = render(
      <UnexploredSpecialtyPanel
        unlocked
        initialMode={{ mode: "standard" }}
        onSavingChange={onSavingChange}
        onModeChange={onModeChange}
      />,
    );

    onSavingChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: /무작위 특화/ }));
    expect(onSavingChange).toHaveBeenCalledTimes(1);
    expect(onSavingChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    resolvePost(Response.json({ ok: true, mode: { mode: "random" } }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSavingChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
