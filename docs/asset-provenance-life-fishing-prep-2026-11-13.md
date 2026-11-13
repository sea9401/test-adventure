# 어유 아이콘 출처

- 제작: 2026-11-13, Codex 내장 imagegen(`codex exec`, 세션 `01a1d491-de4f-7bf2-8cf1-758ccc128b90`).
- 화풍 참고: `public/images/items/battle-prep/`의 숫돌 4종과 보강재 4종을 한 장으로 붙인 견본만 참고한다.
  기존 파일은 변경하지 않았다.
- 생성 원본: PNG 4장(1024x1024).
- 프로젝트 저장: `public/images/items/battle-prep/` 아래 4장. 파일명은 품목 id와 같다. 기존 `items` 프로필(최대 가로 256px,
  품질 85)에 맞춰 WebP로 저장했다.
  - `v2_prep_fishoil_{1,2,3,master}.webp`
  - 단색 초록 배경(#00FF00)을 따냈다. 초록 우세도(G - max(R, B))가 24 이하면 물체, 200 이상이면 배경으로 보고 그 사이는
    반투명으로 처리했으며, 확실한 배경 픽셀에서 이어진 영역만 지웠다. 가장자리의 초록 번짐은 걷어 냈다.
  - 여백을 잘라 256x256(안쪽 여백 6%)으로 다시 앉혔다.
- 용도: 생활 공방 제작 탭의 전투 준비물 행, 인벤토리 소모품·재료 탭과 길드 창고의 품목 아이콘(`InventoryItemIcon`).
- 검수: 문자·숫자·로고·인물 없음, 숫돌·보강재 아이콘과 같은 화풍, 등급이 오를수록 장식이 늘어 네 등급이 구분되는지,
  투명 배경이 라이트·다크 표면 양쪽에서 초록 테두리 없이 보이는지 확인. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 생성 프롬프트

```text
Generate 4 game item icons with your image generation tool and save them as PNG files in the `out/` folder of the current directory. Do not write any code other than what is needed to save the files. Do not modify anything outside `out/`.

## Style

Look at `ref/battle-prep-style.png` first. It shows eight existing item icons from the same game (four whetstones on top, four armor braces below, each row ordered from tier 1 to master tier). The new icons must look like they belong to the same set:

- Hand-painted fantasy RPG item icon, semi-realistic, warm lighting from the upper left, crisp painted edges, rich material detail (glass, cork, clay, brushed metal).
- One single object per image, shown at a slight three-quarter angle, filling about 80% of the frame, centered.
- Tier progression like the reference: tier 1 is plain and humble, tier 2 adds iron or steel fittings, tier 3 adds brass and a small amber gem, master tier adds gold trim, a blue sapphire and faint violet engraved rune lines.

## Hard requirements for every image

- Square, 1024x1024.
- Background is one perfectly flat solid pure green, exactly #00FF00, edge to edge. No gradient, no vignette, no floor, no cast shadow, no glow, no sparkles or particles outside the object. The object must not contain any green.
- No text, no letters, no numbers, no labels, no border, no frame, no hands, no people.
- The object must not touch the image edges.

## The 4 icons

Fish oil tonics (a restorative oil pressed from fish, drunk to restore vigor). Each is a single stoppered vessel holding golden-amber oil. The oil is always a warm golden amber, never green.

1. `out/v2_prep_fishoil_1.png` : a small plain squat clay jar with a cork stopper tied down with rough twine, a little golden oil visible at the rim, a tiny dried fish charm made of pale wood hanging from the twine. Nothing else.
2. `out/v2_prep_fishoil_2.png` : a round-bellied clear glass bottle of golden-amber oil with a cork stopper, held in a simple iron band cage with rivets, a small iron fish-shaped tag on the neck.
3. `out/v2_prep_fishoil_3.png` : an elegant teardrop glass flask of rich deep amber oil with a polished brass collar and brass base, a brass fish-fin ornament on the stopper, and one small amber gem set in the collar.
4. `out/v2_prep_fishoil_master.png` : a master craftsman's flask, faceted crystal holding luminous golden oil, with ornate gold trim, a gold fish-scale patterned base, a blue sapphire set in the stopper, and faint violet engraved rune lines along the gold collar.

When done, list the files in `out/` with their pixel sizes.
```
