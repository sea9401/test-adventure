// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { observeCanvasViewport } from "./canvasViewport";

afterEach(() => vi.unstubAllGlobals());

it("measures at setup and resize, not on each frame, and disconnects", () => {
  let resize!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const wrap = document.createElement("div");
  const measure = vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue({ width: 100, height: 50 } as DOMRect);
  const viewport = observeCanvasViewport(wrap);
  for (let i = 0; i < 100; i++) expect(viewport.read()).toEqual({ width: 100, height: 50, dpr: 1 });
  expect(measure).toHaveBeenCalledTimes(1);
  measure.mockReturnValue({ width: 200, height: 80 } as DOMRect);
  resize();
  expect(viewport.read().width).toBe(200);
  expect(measure).toHaveBeenCalledTimes(2);
  viewport.dispose();
  expect(disconnect).toHaveBeenCalledOnce();
});

it("handles window resize without ResizeObserver and caps changing pixel ratio", () => {
  vi.stubGlobal("ResizeObserver", undefined);
  const wrap = document.createElement("div");
  const measure = vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue({ width: 0, height: 0 } as DOMRect);
  const viewport = observeCanvasViewport(wrap);
  vi.stubGlobal("devicePixelRatio", 3);
  expect(viewport.read()).toEqual({ width: 1, height: 1, dpr: 2 });
  window.dispatchEvent(new Event("resize"));
  expect(measure).toHaveBeenCalledTimes(2);
  viewport.dispose();
  window.dispatchEvent(new Event("resize"));
  expect(measure).toHaveBeenCalledTimes(2);
});
