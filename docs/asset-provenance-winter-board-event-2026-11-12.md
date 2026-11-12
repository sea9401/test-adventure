# 겨울 이벤트 말판 이미지 출처

- 제작: 2026-11-12, Codex 내장 imagegen(`codex exec`, 세션 `01a1cd25-36c0-74d1-aece-a6afb1907ae1`).
- 화풍 참고: `public/images/ui/village.webp`의 수채화 질감과 잉크 선, 색감만 참고한다. 기존 마을 파일은 변경하지 않았다.
- 생성 원본: `/home/sea9401/.codex/generated_images/01a1cd25-36c0-74d1-aece-a6afb1907ae1/` 아래 PNG 7장(배너 1536x1024, 말판 삽화 1024x1536, 칸 아이콘 5장 1254x1254).
- 프로젝트 저장: `public/images/event/` 아래 7장. 새 `event` 프로필(최대 가로 1280px, 품질 84)로 WebP 변환한다.
  - `winter-banner.webp`: 원본의 세로 262~701px 구간(1536x439)만 잘라 쓴다.
  - `winter-board.webp`: 가로 640px로 줄인다.
  - `winter-tile-{start,coins,potion,again,forward}.webp`: 단색 배경(#EAF3FA 근처)을 가장자리에서 이어진 영역만 투명하게
    따내고(배경과의 색 거리 10 이하는 투명, 34 이상은 불투명), 여백을 잘라 192x192로 다시 앉혔다. 물체 안쪽의 눈과 그림자는 남긴다.
- 용도: 이벤트 메뉴 겨울 이벤트 탭의 머리 배너, 말판 가운데 삽화, 말판 칸 아이콘(`V2WinterBoardView`).
- 검수: 문자·숫자·로고·인물 없음, 수채화 질감, 칸 아이콘 5종이 한 세트로 읽히는지, 투명 배경이 라이트·다크 표면 양쪽에서
  테두리 없이 보이는지 확인. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 생성 프롬프트

```text
You are producing game art assets with your built-in image generation tool. Do NOT write code or draw with scripts; every asset must come from the image generation tool. Generate each asset as its own image and save it as a PNG under ./out/ with the exact filename given. If a generated file lands elsewhere (for example under ~/.codex/generated_images), copy it into ./out/ with the right name. When all seven files exist, list them with their pixel sizes and stop.

Look at ./ref-village.png first. It is an existing background from the same game (a text-based fantasy RPG). Match its style in every asset: hand-painted watercolor with fine ink linework on warm paper, storybook European-fantasy village, soft muted palette, gentle light. All assets are for a winter event, so the same world is now covered in snow: cool blue-white snow, warm orange lantern light, dark green pines, orange-tiled roofs under snow.

Rules for every asset: no text, no letters, no numbers, no logos, no UI frames, no watermark, no people or faces. Paint to the full edge of the canvas (no torn-paper border, no vignette, no white margin).

1. out/winter-banner.png — landscape 3:2 (about 1536x1024). A snowy fantasy village square at dusk: snow-capped cottages with glowing windows, lantern posts, pine trees, a stone bridge over a frozen stream, falling snow. In the centre foreground, on a snowy path, sit a pair of large carved wooden dice and a small pile of silver-blue coins stamped with a snowflake. This will be cropped to a wide thin strip (about 3:1) through the vertical middle, so keep the dice, coins and the most attractive buildings inside the middle third of the height, and keep the top and bottom thirds calm (sky above, plain snow below).

2. out/winter-board.png — portrait 2:3 (about 1024x1536). Looking down at a slight angle on a frozen pond in the same snowy village: a snowman with a red scarf, lantern posts with warm light, snow-laden pines, a small wooden sled, footprints in the snow, a wooden jetty. Everything of interest must be in the lower two thirds. The top third must be calm and plain (pale snowy sky with soft snowfall and distant treetops only), because a UI panel will cover it.

3-7. Five square icons, 1:1 (about 1024x1024 each). Each shows ONE object, centred, filling about 70 percent of the canvas, with a soft small shadow, on the SAME flat uniform pale icy-blue background (#EAF3FA) with no scenery, no border and no texture, so the five read as one set. Bold clear silhouettes that still read at 32 pixels.
3. out/tile-start.png — a wooden signpost planted in a small mound of snow with a red pennant flag.
4. out/tile-coins.png — a short stack of three silver-blue coins, the top coin stamped with a snowflake.
5. out/tile-potion.png — a round corked glass flask of glowing green potion, a little snow on the cork.
6. out/tile-again.png — a single carved wooden die with white pips, a cap of snow on top.
7. out/tile-forward.png — a small wooden sled with red runners, angled as if sliding to the right, with two short speed streaks behind it.
```
