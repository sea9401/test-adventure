# 전투 준비물 아이콘 출처

- 제작: 2026-11-13, Codex 내장 imagegen(`codex exec`, 세션 `01a1d1e6-5242-7870-953f-12225892f3d1`).
- 화풍 참고: `public/images/items/life-aids/`의 벌목 쐐기 3종과 광맥 탐침 3종을 한 장으로 붙인 견본만 참고한다.
  기존 파일은 변경하지 않았다.
- 생성 원본: `/home/sea9401/.codex/generated_images/01a1d1e6-5242-7870-953f-12225892f3d1/` 아래 PNG 8장(1254x1254,
  Codex가 1024x1024로 줄여 저장).
- 프로젝트 저장: `public/images/items/battle-prep/` 아래 8장. 파일명은 품목 id와 같다. 기존 `items` 프로필(최대 가로 256px,
  품질 85)로 WebP 변환한다.
  - `v2_prep_whetstone_{1,2,3,master}.webp`, `v2_prep_brace_{1,2,3,master}.webp`
  - 단색 초록 배경(#00FF00)을 따냈다. 초록 우세도(G - max(R, B))가 24 이하면 물체, 200 이상이면 배경으로 보고 그 사이는
    반투명으로 처리했으며, 확실한 배경 픽셀이 들어 있는 덩어리만 지웠다. 가장자리의 초록 번짐은 걷어 냈다.
  - 여백을 잘라 256x256(안쪽 여백 6%)으로 다시 앉혔다.
- 용도: 생활 공방 제작 탭의 전투 준비물 행, 인벤토리 소모품·재료 탭과 길드 창고의 품목 아이콘(`InventoryItemIcon`).
- 검수: 문자·숫자·로고·인물 없음, 기존 보조품 아이콘과 같은 화풍, 등급이 오를수록 장식이 늘어 네 등급이 구분되는지,
  투명 배경이 라이트·다크 표면 양쪽에서 초록 테두리 없이 보이는지 확인. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 생성 프롬프트

```text
Generate 8 game item icons with your image generation tool and save them as PNG files in the `out/` folder of the current directory. Do not write any code other than what is needed to save the files. Do not modify anything outside `out/`.

## Style

Look at `ref/life-aids-style.png` first. It shows six existing item icons from the same game (three gauge probes on top, three wood-splitting wedges below). The new icons must look like they belong to the same set:

- Hand-painted fantasy RPG item icon, semi-realistic, warm lighting from the upper left, crisp painted edges, rich material detail (stone grain, wood grain, brushed metal).
- One single object per image, shown at a diagonal three-quarter angle, filling about 80% of the frame, centered.
- Tier progression like the reference: tier 1 is plain and humble, tier 2 adds iron or steel fittings, tier 3 adds brass and a small amber gem, master tier adds gold trim, a blue sapphire and faint violet engraved rune lines.

## Hard requirements for every image

- Square, 1024x1024.
- Background is one perfectly flat solid pure green, exactly #00FF00, edge to edge. No gradient, no vignette, no floor, no cast shadow, no glow, no sparkles or particles outside the object. The object must not contain any green.
- No text, no letters, no numbers, no border, no frame, no hands, no people.
- The object must not touch the image edges.

## The 8 icons

Whetstones (sharpening stones used to hone a weapon). Each is a rectangular sharpening stone block; higher tiers sit in a fitted holder.

1. `out/v2_prep_whetstone_1.png` : a plain rough grey rectangular whetstone block, slightly chipped corners, coarse grain, a few pale scratch marks on the top face. Nothing else.
2. `out/v2_prep_whetstone_2.png` : a two-layer whetstone (dark grey coarse layer under a lighter fine layer) seated in a simple dark wooden base held by two iron bands with rivets.
3. `out/v2_prep_whetstone_3.png` : a smooth blue-grey fine whetstone in a polished hardwood holder with brass corner fittings and one small amber gem set in the front fitting.
4. `out/v2_prep_whetstone_master.png` : a master craftsman's whetstone, a deep black polished stone with fine silver flecks, in an ornate gold-trimmed holder with a blue sapphire and faint violet engraved rune lines along the holder.

Armor braces (reinforcement plates made of processed wood that are strapped onto armor).

5. `out/v2_prep_brace_1.png` : a simple curved armor reinforcement plate made of pale planed wood slats, with two plain leather straps and a few iron rivets.
6. `out/v2_prep_brace_2.png` : a curved reinforcement plate of dark hardwood with steel band edging, steel rivets, and two buckled leather straps.
7. `out/v2_prep_brace_3.png` : a finely crafted curved reinforcement plate of rich reddish masterwood with brass edging, ornate brass rivets, a small amber gem at the center, and neat leather straps.
8. `out/v2_prep_brace_master.png` : a masterwork curved reinforcement plate of very dark wood with gold trim, a blue sapphire at the center, faint violet engraved rune lines across the wood, and fine dark leather straps.

When done, list the files in `out/` with their pixel sizes.
```
