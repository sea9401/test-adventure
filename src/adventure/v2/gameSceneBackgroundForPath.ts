export type GameSceneBackgroundSource = {
  src: string;
  fallbackSrc?: string;
};

const HUNTING_GROUND_DEPTHS_PER_THEME = 6;
const HUNTING_GROUND_BACKGROUNDS = [
  "/images/ui/plains.webp",
  "/images/ui/canyon.webp",
  "/images/ui/lake.webp",
  "/images/ui/deep_cave.webp",
  "/images/ui/forgotten_seal.webp",
  "/images/ui/forest.webp",
  "/images/ui/cave.webp",
  "/images/ui/oldwall_keep.webp",
  "/images/ui/volcanic_badlands.webp",
  "/images/ui/bone_marches.webp",
  "/images/ui/ashen_pass.webp",
  "/images/ui/starlit_reef.webp",
  "/images/ui/star_corridor.webp",
  "/images/ui/star_grave.webp",
] as const;

export function gameSceneBackgroundForPath(
  pathname: string,
): GameSceneBackgroundSource | null {
  if (!pathname.startsWith("/battle/dungeon")) return null;

  const match = /^\/battle\/dungeon\/(\d+)\/?$/.exec(pathname);
  const depth = match ? Number(match[1]) : null;
  const maxMappedDepth =
    HUNTING_GROUND_BACKGROUNDS.length * HUNTING_GROUND_DEPTHS_PER_THEME;
  if (depth != null && depth >= 1 && depth <= maxMappedDepth) {
    const themeIndex = Math.floor(
      (depth - 1) / HUNTING_GROUND_DEPTHS_PER_THEME,
    );
    return { src: HUNTING_GROUND_BACKGROUNDS[themeIndex] };
  }

  return { src: "/images/ui/hunt.webp" };
}
