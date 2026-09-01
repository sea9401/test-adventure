// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnexploredTreeViewport } from "./UnexploredTreeViewport";

afterEach(cleanup);

function renderViewport(
  children = <circle cx={100} cy={100} r={20} />,
) {
  render(
    <UnexploredTreeViewport ariaLabel="테스트 탐사망">
      {children}
    </UnexploredTreeViewport>,
  );
  const viewport = screen.getByLabelText("탐사망 지도 조작 영역");
  Object.defineProperty(viewport, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
      toJSON: () => ({}),
    }),
  });
  return viewport;
}

describe("UnexploredTreeViewport", () => {
  it("단순 노드 누르기를 지도 컨테이너로 재대상화하지 않는다", () => {
    const onSelect = vi.fn();
    const viewport = renderViewport(
      <g data-testid="test-node" onClick={onSelect}>
        <circle cx={100} cy={100} r={20} />
      </g>,
    );
    const node = screen.getByTestId("test-node");
    let capturedTarget: Element | null = null;
    Object.defineProperties(viewport, {
      setPointerCapture: {
        configurable: true,
        value: () => {
          capturedTarget = viewport;
        },
      },
      hasPointerCapture: {
        configurable: true,
        value: () => capturedTarget === viewport,
      },
      releasePointerCapture: {
        configurable: true,
        value: () => {
          capturedTarget = null;
        },
      },
    });

    fireEvent.pointerDown(node, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    const pointerUpTarget = capturedTarget ?? node;
    fireEvent.pointerUp(pointerUpTarget, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.click(pointerUpTarget);

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("버튼으로 25%씩 확대하고 화면 맞춤으로 초기화한다", () => {
    renderViewport();

    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "탐사망 확대" }));
    expect(screen.getByText("125%")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "탐사망 화면 맞춤" }),
    );
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("포인터 위치를 기준으로 휠 확대한다", () => {
    const viewport = renderViewport();

    fireEvent.wheel(viewport, {
      deltaY: -100,
      clientX: 500,
      clientY: 500,
    });

    expect(screen.getByText("125%")).toBeTruthy();
    expect(
      screen.getByTestId("unexplored-tree-transform").getAttribute("transform"),
    ).not.toBe("translate(0 0) scale(1)");
  });

  it("한 포인터 드래그로 지도를 이동한다", () => {
    const viewport = renderViewport();

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 200,
      clientY: 150,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 200,
      clientY: 150,
    });

    expect(
      screen.getByTestId("unexplored-tree-transform").getAttribute("transform"),
    ).not.toBe("translate(0 0) scale(1)");
  });

  it("두 터치 포인터 간격이 벌어지면 확대한다", () => {
    const viewport = renderViewport();

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 400,
      clientY: 500,
    });
    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 600,
      clientY: 500,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 800,
      clientY: 500,
    });

    expect(screen.getByText("200%")).toBeTruthy();
  });
});
