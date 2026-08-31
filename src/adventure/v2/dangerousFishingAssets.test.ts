import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const encounterBackgrounds = [
  "public/images/ui/dangerous-fishing-shattered-reef-encounter.webp",
  "public/images/ui/dangerous-fishing-storm-trench-encounter.webp",
  "public/images/ui/dangerous-fishing-abyssal-rift-encounter.webp",
] as const;

const struggleSheets = [
  "public/images/fish/tidal_colossus-struggle.webp",
  "public/images/fish/abyss_kraken-struggle.webp",
] as const;

const STRUGGLE_FRAME_SIZE = 256;
const STRUGGLE_FRAME_PADDING = 12;
const MAX_NEON_GREEN_BOUNDARY_RATIO = 0.08;
const MAX_DETACHED_ALPHA_COMPONENT_AREA = 20;
const MIN_NEUTRAL_BLOCK_AREA = 64;
const MIN_NEUTRAL_BLOCK_DENSITY = 0.75;

type MatteDefects = {
  detachedAlphaComponentAreas: number[];
  neutralBlockAreas: number[];
};

function findFrameMatteDefects(
  data: Buffer,
  sheetWidth: number,
  channels: number,
  frame: number,
): MatteDefects {
  type Component = { area: number; boundingBoxArea: number };
  const collectComponents = (
    isMember: (pixel: number) => boolean,
  ): Component[] => {
    const seen = new Uint8Array(STRUGGLE_FRAME_SIZE ** 2);
    const components: Component[] = [];

    for (let start = 0; start < seen.length; start += 1) {
      if (seen[start]) continue;
      const startX = start % STRUGGLE_FRAME_SIZE;
      const startY = Math.floor(start / STRUGGLE_FRAME_SIZE);
      const startPixel =
        (startY * sheetWidth + frame * STRUGGLE_FRAME_SIZE + startX) *
        channels;
      if (!isMember(startPixel)) continue;

      const pending = [start];
      seen[start] = 1;
      let area = 0;
      let minX = STRUGGLE_FRAME_SIZE;
      let minY = STRUGGLE_FRAME_SIZE;
      let maxX = 0;
      let maxY = 0;

      while (pending.length > 0) {
        const current = pending.pop()!;
        const x = current % STRUGGLE_FRAME_SIZE;
        const y = Math.floor(current / STRUGGLE_FRAME_SIZE);
        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        for (const [nextX, nextY] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]) {
          if (
            nextX < 0 ||
            nextX >= STRUGGLE_FRAME_SIZE ||
            nextY < 0 ||
            nextY >= STRUGGLE_FRAME_SIZE
          ) {
            continue;
          }
          const next = nextY * STRUGGLE_FRAME_SIZE + nextX;
          if (seen[next]) continue;
          const nextPixel =
            (nextY * sheetWidth +
              frame * STRUGGLE_FRAME_SIZE +
              nextX) *
            channels;
          if (!isMember(nextPixel)) continue;
          seen[next] = 1;
          pending.push(next);
        }
      }

      components.push({
        area,
        boundingBoxArea: (maxX - minX + 1) * (maxY - minY + 1),
      });
    }

    return components;
  };

  const alphaComponents = collectComponents((pixel) => data[pixel + 3] > 0)
    .sort((left, right) => right.area - left.area)
    .slice(1);
  const neutralComponents = collectComponents((pixel) => {
    if (data[pixel + 3] === 0) return false;
    const red = data[pixel];
    const green = data[pixel + 1];
    const blue = data[pixel + 2];
    return (
      Math.min(red, green, blue) >= 180 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 30
    );
  });

  return {
    detachedAlphaComponentAreas: alphaComponents
      .filter(({ area }) => area > MAX_DETACHED_ALPHA_COMPONENT_AREA)
      .map(({ area }) => area),
    neutralBlockAreas: neutralComponents
      .filter(
        ({ area, boundingBoxArea }) =>
          area >= MIN_NEUTRAL_BLOCK_AREA &&
          area / boundingBoxArea >= MIN_NEUTRAL_BLOCK_DENSITY,
      )
      .map(({ area }) => area),
  };
}

describe("위험 해역 실시간 조우 이미지", () => {
  it.each(encounterBackgrounds)("%s 배경이 16:9 비율이다", async (assetPath) => {
    const metadata = await sharp(path.join(process.cwd(), assetPath)).metadata();

    expect(metadata.width).toBeDefined();
    expect(metadata.height).toBeDefined();
    expect(metadata.width! / metadata.height!).toBeCloseTo(16 / 9, 2);
  });

  it.each(struggleSheets)(
    "%s 시트가 투명한 256px 정사각 프레임 네 개를 가로로 담는다",
    async (assetPath) => {
      const metadata = await sharp(path.join(process.cwd(), assetPath)).metadata();

      expect(metadata).toMatchObject({
        width: 1024,
        height: 256,
        hasAlpha: true,
      });
    },
  );

  it.each(struggleSheets)(
    "%s 시트의 각 프레임이 실제 투명 배경과 사방 여백을 둔다",
    async (assetPath) => {
      const { data, info } = await sharp(path.join(process.cwd(), assetPath))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let frame = 0; frame < 4; frame += 1) {
        const frameLeft = frame * STRUGGLE_FRAME_SIZE;
        let transparentPixels = 0;
        let nonTransparentPaddingPixels = 0;
        const nonTransparentEdgePixels = {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        };

        for (let y = 0; y < STRUGGLE_FRAME_SIZE; y += 1) {
          for (let x = 0; x < STRUGGLE_FRAME_SIZE; x += 1) {
            const alpha =
              data[(y * info.width + frameLeft + x) * info.channels + 3];
            if (alpha === 0) transparentPixels += 1;
            if (
              alpha > 0 &&
              (x < STRUGGLE_FRAME_PADDING ||
                x >= STRUGGLE_FRAME_SIZE - STRUGGLE_FRAME_PADDING ||
                y < STRUGGLE_FRAME_PADDING ||
                y >= STRUGGLE_FRAME_SIZE - STRUGGLE_FRAME_PADDING)
            ) {
              nonTransparentPaddingPixels += 1;
            }
            if (alpha > 0 && y === 0) nonTransparentEdgePixels.top += 1;
            if (alpha > 0 && x === STRUGGLE_FRAME_SIZE - 1) {
              nonTransparentEdgePixels.right += 1;
            }
            if (alpha > 0 && y === STRUGGLE_FRAME_SIZE - 1) {
              nonTransparentEdgePixels.bottom += 1;
            }
            if (alpha > 0 && x === 0) nonTransparentEdgePixels.left += 1;
          }
        }

        expect(transparentPixels, `frame ${frame + 1}`).toBeGreaterThan(0);
        expect(nonTransparentEdgePixels, `frame ${frame + 1}`).toEqual({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        });
        expect(nonTransparentPaddingPixels, `frame ${frame + 1}`).toBe(0);
      }
    },
  );

  it.each(struggleSheets)(
    "%s 시트의 피사체 경계에 비자연적인 크로마 그린이 남지 않는다",
    async (assetPath) => {
      const { data, info } = await sharp(path.join(process.cwd(), assetPath))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let boundaryPixels = 0;
      let neonGreenBoundaryPixels = 0;

      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const pixel = (y * info.width + x) * info.channels;
          if (data[pixel + 3] === 0) continue;
          const touchesTransparency = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ].some(
            ([neighborX, neighborY]) =>
              neighborX < 0 ||
              neighborX >= info.width ||
              neighborY < 0 ||
              neighborY >= info.height ||
              data[
                (neighborY * info.width + neighborX) * info.channels + 3
              ] === 0,
          );
          if (!touchesTransparency) continue;

          boundaryPixels += 1;
          const red = data[pixel];
          const green = data[pixel + 1];
          const blue = data[pixel + 2];
          if (
            green >= 145 &&
            green - red >= 50 &&
            green - blue >= 25
          ) {
            neonGreenBoundaryPixels += 1;
          }
        }
      }

      expect(boundaryPixels).toBeGreaterThan(0);
      expect(neonGreenBoundaryPixels / boundaryPixels).toBeLessThanOrEqual(
        MAX_NEON_GREEN_BOUNDARY_RATIO,
      );
    },
  );

  it("실제 시트에 삽입한 불투명 체크 조각을 매트 결함으로 검출한다", async () => {
    const { data, info } = await sharp(
      path.join(process.cwd(), struggleSheets[0]),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mutated = Buffer.from(data);

    for (let y = 24; y < 32; y += 1) {
      for (let x = 96; x < 104; x += 1) {
        const pixel = (y * info.width + x) * info.channels;
        const gray = (x + y) % 2 === 0 ? 255 : 224;
        mutated[pixel] = gray;
        mutated[pixel + 1] = gray;
        mutated[pixel + 2] = gray;
        mutated[pixel + 3] = 255;
      }
    }

    const defects = findFrameMatteDefects(
      mutated,
      info.width,
      info.channels,
      0,
    );

    expect(defects.detachedAlphaComponentAreas).toContain(64);
    expect(defects.neutralBlockAreas).toContain(64);
  });

  it.each(struggleSheets)(
    "%s 시트의 각 프레임에 분리된 매트나 중립 체크 블록이 없다",
    async (assetPath) => {
      const { data, info } = await sharp(path.join(process.cwd(), assetPath))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let frame = 0; frame < 4; frame += 1) {
        expect(
          findFrameMatteDefects(data, info.width, info.channels, frame),
          `frame ${frame + 1}`,
        ).toEqual({
          detachedAlphaComponentAreas: [],
          neutralBlockAreas: [],
        });
      }
    },
  );
});
