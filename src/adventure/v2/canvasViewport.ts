/** Cache layout between resize notifications; DPR can change without a layout resize. */
export function observeCanvasViewport(wrap: HTMLElement) {
  let width = 1;
  let height = 1;
  const measure = () => {
    const rect = wrap.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
  };
  measure();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(wrap);
  window.addEventListener("resize", measure);
  return {
    read: () => ({ width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) }),
    dispose() {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    },
  };
}
