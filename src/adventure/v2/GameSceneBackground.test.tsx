import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GAME_BACKGROUND_CROSSFADE_MS,
  GameSceneBackground,
  gameSceneBackgroundReducer,
  initialGameSceneBackgroundState,
} from "./GameSceneBackground";
import { gameSceneBackgroundForPath } from "./gameSceneBackgroundForPath";

describe("게임 경로별 장면 배경", () => {
  const huntingGrounds = [
    { depths: [1, 6], src: "/images/ui/plains.webp" },
    { depths: [7, 12], src: "/images/ui/canyon.webp" },
    { depths: [13, 18], src: "/images/ui/lake.webp" },
    { depths: [19, 24], src: "/images/ui/deep_cave.webp" },
    { depths: [25, 30], src: "/images/ui/forgotten_seal.webp" },
    { depths: [31, 36], src: "/images/ui/forest.webp" },
    { depths: [37, 42], src: "/images/ui/cave.webp" },
    { depths: [43, 48], src: "/images/ui/oldwall_keep.webp" },
    { depths: [49, 54], src: "/images/ui/volcanic_badlands.webp" },
    { depths: [55, 60], src: "/images/ui/bone_marches.webp" },
    { depths: [61, 66], src: "/images/ui/ashen_pass.webp" },
    { depths: [67, 72], src: "/images/ui/starlit_reef.webp" },
    { depths: [73, 78], src: "/images/ui/star_corridor.webp" },
    { depths: [79, 84], src: "/images/ui/star_grave.webp" },
  ] as const;

  it.each(huntingGrounds)(
    "$depths 사냥터는 시작과 끝 단계에서 $src 배경을 사용한다",
    ({ depths, src }) => {
      for (const depth of depths) {
        expect(gameSceneBackgroundForPath(`/battle/dungeon/${depth}`)).toEqual(
          { src },
        );
      }
    },
  );

  it.each([
    "/battle/dungeon",
    "/battle/dungeon/",
    "/battle/dungeon/not-a-depth",
    "/battle/dungeon/0",
    "/battle/dungeon/85",
  ])("유효한 사냥 단계가 아닌 %s 경로는 공용 사냥 배경을 사용한다", (path) => {
    expect(gameSceneBackgroundForPath(path)).toEqual({
      src: "/images/ui/hunt.webp",
    });
  });
});

describe("게임 장면 배경 교차 페이드", () => {
  it("새 이미지가 로드되고 180ms 전환이 끝날 때까지 이전 배경을 유지한다", () => {
    const village = { src: "/images/ui/village.webp" };
    const hunt = { src: "/images/ui/hunt.webp" };
    const initial = initialGameSceneBackgroundState(village);
    const loading = gameSceneBackgroundReducer(initial, {
      type: "request",
      background: hunt,
    });

    expect(GAME_BACKGROUND_CROSSFADE_MS).toBe(180);
    expect(loading.displayed.src).toBe(village.src);
    expect(loading.incoming?.src).toBe(hunt.src);
    expect(loading.incomingReady).toBe(false);

    const fading = gameSceneBackgroundReducer(loading, {
      type: "loaded",
      requestedSrc: hunt.src,
    });
    expect(fading.displayed.src).toBe(village.src);
    expect(fading.incoming?.src).toBe(hunt.src);
    expect(fading.incomingReady).toBe(true);

    const completed = gameSceneBackgroundReducer(fading, {
      type: "complete",
      requestedSrc: hunt.src,
    });
    expect(completed.displayed.src).toBe(hunt.src);
    expect(completed.incoming).toBeNull();
    expect(completed.incomingReady).toBe(false);
  });

  it("첫 렌더에서는 배경 한 장과 기존 불투명 딤을 표시한다", () => {
    const html = renderToStaticMarkup(
      <GameSceneBackground src="/images/ui/village.webp" />,
    );

    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('src="/images/ui/village.webp"');
    expect(html).toContain("bg-zinc-100/80");
    expect(html).toContain("dark:bg-zinc-950/80");
    expect(html).toContain('aria-hidden="true"');
  });

  it("새 배경을 받기 전에 원래 장소로 돌아오면 대기 중 전환을 취소한다", () => {
    const village = { src: "/images/ui/village.webp" };
    const hunt = { src: "/images/ui/hunt.webp" };
    const loading = gameSceneBackgroundReducer(
      initialGameSceneBackgroundState(village),
      { type: "request", background: hunt },
    );
    const returned = gameSceneBackgroundReducer(loading, {
      type: "request",
      background: village,
    });

    expect(returned.displayed.src).toBe(village.src);
    expect(returned.incoming).toBeNull();
    expect(returned.incomingReady).toBe(false);
  });
});
