import type {
  UnexploredNode,
  UnexploredNodeKind,
} from "@/adventure/data/v2/unexploredTree";

type Point = { x: number; y: number };

export type UnexploredEdgeRoute = {
  path: string;
  curved: boolean;
};

const TREE_CENTER: Point = { x: 900, y: 900 };
const EDGE_NODE_MARGIN = 8;
const MAX_CONTROL_DISTANCE = 1_200;

const NODE_RADIUS = {
  start: 34,
  small: 15,
  medium: 25,
  pool: 31,
  enhancer: 22,
  deep: 34,
} satisfies Record<UnexploredNodeKind, number>;

export function unexploredNodeRadius(
  node: Pick<UnexploredNode, "kind">,
): number {
  return NODE_RADIUS[node.kind];
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function linePath(left: Point, right: Point): string {
  return `M ${formatCoordinate(left.x)} ${formatCoordinate(left.y)} L ${formatCoordinate(right.x)} ${formatCoordinate(right.y)}`;
}

function quadraticPath(left: Point, control: Point, right: Point): string {
  return `M ${formatCoordinate(left.x)} ${formatCoordinate(left.y)} Q ${formatCoordinate(control.x)} ${formatCoordinate(control.y)} ${formatCoordinate(right.x)} ${formatCoordinate(right.y)}`;
}

function pointDistance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointToSegmentDistance(
  point: Point,
  left: Point,
  right: Point,
): number {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, left);
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - left.x) * dx + (point.y - left.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (left.x + position * dx),
    point.y - (left.y + position * dy),
  );
}

function quadraticPoint(
  left: Point,
  control: Point,
  right: Point,
  position: number,
): Point {
  const inverse = 1 - position;
  return {
    x:
      inverse * inverse * left.x +
      2 * inverse * position * control.x +
      position * position * right.x,
    y:
      inverse * inverse * left.y +
      2 * inverse * position * control.y +
      position * position * right.y,
  };
}

function quadraticSegments(
  left: Point,
  control: Point,
  right: Point,
): Array<readonly [Point, Point]> {
  const estimatedLength = pointDistance(left, control) + pointDistance(control, right);
  const segmentCount = Math.max(32, Math.min(512, Math.ceil(estimatedLength / 4)));
  const segments: Array<readonly [Point, Point]> = [];
  let previous = left;
  for (let index = 1; index <= segmentCount; index += 1) {
    const next = quadraticPoint(left, control, right, index / segmentCount);
    segments.push([previous, next]);
    previous = next;
  }
  return segments;
}

function routeClearsNodes(
  segments: readonly (readonly [Point, Point])[],
  obstacles: readonly UnexploredNode[],
): boolean {
  for (const node of obstacles) {
    const required = unexploredNodeRadius(node) + EDGE_NODE_MARGIN;
    for (const [left, right] of segments) {
      if (pointToSegmentDistance(node, left, right) < required) return false;
    }
  }
  return true;
}

function rotate(point: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function buildUnexploredEdgeRoute(
  left: UnexploredNode,
  right: UnexploredNode,
  nodes: readonly UnexploredNode[],
): UnexploredEdgeRoute {
  const obstacles = nodes.filter(
    (node) => node.id !== left.id && node.id !== right.id,
  );
  if (routeClearsNodes([ [left, right] ], obstacles)) {
    return { path: linePath(left, right), curved: false };
  }

  const midpoint = {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
  const outward = {
    x: midpoint.x - TREE_CENTER.x,
    y: midpoint.y - TREE_CENTER.y,
  };
  const outwardLength = Math.hypot(outward.x, outward.y);
  const baseDirection = outwardLength > 0.001
    ? { x: outward.x / outwardLength, y: outward.y / outwardLength }
    : (() => {
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: -dy / length, y: dx / length };
      })();
  const endpointRadius = Math.max(
    pointDistance(TREE_CENTER, left),
    pointDistance(TREE_CENTER, right),
  );
  const initialDistance = Math.max(
    48,
    endpointRadius + 80 - pointDistance(TREE_CENTER, midpoint),
  );
  const angleOffsets = [0, -12, 12, -24, 24, -36, 36, -54, 54, -72, 72, 180];

  for (
    let distance = initialDistance;
    distance <= MAX_CONTROL_DISTANCE;
    distance += 24
  ) {
    for (const angle of angleOffsets) {
      const direction = rotate(baseDirection, angle);
      const control = {
        x: midpoint.x + direction.x * distance,
        y: midpoint.y + direction.y * distance,
      };
      if (!routeClearsNodes(quadraticSegments(left, control, right), obstacles)) {
        continue;
      }
      return {
        path: quadraticPath(left, control, right),
        curved: true,
      };
    }
  }

  throw new Error(`Unable to route unexplored edge: ${left.id}|${right.id}`);
}
