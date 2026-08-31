export const UNEXPLORED_MIN_SCALE = 0.5;
export const UNEXPLORED_MAX_SCALE = 2.5;
export const UNEXPLORED_SCALE_STEP = 0.25;

export type ViewportPoint = {
  x: number;
  y: number;
};

export type ViewportTransform = ViewportPoint & {
  scale: number;
};

export function clampUnexploredScale(scale: number): number {
  return Math.min(
    UNEXPLORED_MAX_SCALE,
    Math.max(UNEXPLORED_MIN_SCALE, scale),
  );
}

export function zoomUnexploredAt(
  transform: ViewportTransform,
  nextScale: number,
  anchor: ViewportPoint,
): ViewportTransform {
  const scale = clampUnexploredScale(nextScale);
  const ratio = scale / transform.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio,
  };
}

export function panUnexploredBy(
  transform: ViewportTransform,
  delta: ViewportPoint,
): ViewportTransform {
  return {
    ...transform,
    x: transform.x + delta.x,
    y: transform.y + delta.y,
  };
}
