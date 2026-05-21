import { memo } from "react";
import type { Region } from "./data/world";

const NODE_RADIUS = 24;

export const MapEdge = memo(function MapEdge({
  from,
  to,
  active,
}: {
  from: Region;
  to: Region;
  active: boolean;
}) {
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const x1 = from.position.x + ux * NODE_RADIUS;
  const y1 = from.position.y + uy * NODE_RADIUS;
  const x2 = to.position.x - ux * NODE_RADIUS;
  const y2 = to.position.y - uy * NODE_RADIUS;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      strokeWidth={2}
      strokeDasharray={active ? undefined : "4 6"}
      className={
        active
          ? "stroke-zinc-400 dark:stroke-zinc-500"
          : "stroke-zinc-300 dark:stroke-zinc-700"
      }
    />
  );
});
