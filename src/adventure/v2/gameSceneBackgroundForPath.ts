export type GameSceneBackgroundSource = {
  src: string;
  fallbackSrc?: string;
};

const STAR_GRAVE_MIN_DEPTH = 79;
const STAR_GRAVE_MAX_DEPTH = 84;

export function gameSceneBackgroundForPath(
  pathname: string,
): GameSceneBackgroundSource | null {
  if (!pathname.startsWith("/battle/dungeon")) return null;

  const match = /^\/battle\/dungeon\/(\d+)\/?$/.exec(pathname);
  const depth = match ? Number(match[1]) : null;
  if (
    depth != null &&
    depth >= STAR_GRAVE_MIN_DEPTH &&
    depth <= STAR_GRAVE_MAX_DEPTH
  ) {
    return { src: "/images/ui/star_grave.webp" };
  }

  return { src: "/images/ui/hunt.webp" };
}
