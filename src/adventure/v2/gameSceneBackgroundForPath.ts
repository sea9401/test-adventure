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

// 사냥터 단계의 지역 그림 — 6단계마다 한 지역. 정해진 범위 밖은 기본 사냥터 그림.
//   전투 화면 배경과 사냥터 목록 카드가 같은 그림을 쓰도록 여기서만 정한다.
export function huntingGroundImageForDepth(depth: number): string {
  const maxMappedDepth =
    HUNTING_GROUND_BACKGROUNDS.length * HUNTING_GROUND_DEPTHS_PER_THEME;
  if (Number.isInteger(depth) && depth >= 1 && depth <= maxMappedDepth) {
    return HUNTING_GROUND_BACKGROUNDS[
      Math.floor((depth - 1) / HUNTING_GROUND_DEPTHS_PER_THEME)
    ];
  }
  return "/images/ui/hunt.webp";
}

export function gameSceneBackgroundForPath(
  pathname: string,
): GameSceneBackgroundSource | null {
  if (!pathname.startsWith("/battle/dungeon")) return null;

  const match = /^\/battle\/dungeon\/(\d+)\/?$/.exec(pathname);
  const depth = match ? Number(match[1]) : 0;
  return { src: huntingGroundImageForDepth(depth) };
}
