# 문장 종류 그림 출처

- 제작: 2026-11-28, Codex 내장 imagegen(`codex exec`).
- 화풍 참고: 같은 날 같은 방식으로 만든 그림체 비교용 시안 두 장(육각 배지 안의 하트와 건틀릿 주먹, 납작한 단색 면과 굵은 남색
  외곽선)만 참고했다. 운영자가 일곱 가지 그림체 후보 가운데 이 그림체를 골랐다. 기존 게임 그림은 참고하지 않았다.
- 생성 원본: PNG 8장(1254x1254). 1024x1024를 요청했지만 생성기가 1254로 돌려주었다.
- 프로젝트 저장: `public/images/emblem/` 아래 8장. 파일명은 문장 종류(`EmblemKind`)와 같다. `emblem` 프로필(최대 가로 256px,
  품질 92)로 WebP 변환한다.
  - `hp.webp`(하트), `mp.webp`(물방울), `str.webp`(건틀릿 주먹), `dex.webp`(번개), `vit.webp`(방패), `int.webp`(마법서),
    `spi.webp`(연꽃), `luk.webp`(네잎클로버)
  - 단색 초록 배경(#00FF00)을 따냈다. 초록 우세도(G - max(R, B))가 24를 넘는 픽셀을 그림 가장자리에서부터 번져 들어가며
    지웠고, 굵은 남색 외곽선에서 멈추므로 네잎클로버 안쪽의 초록은 남는다. 24~200 사이는 반투명으로 처리하고 초록 번짐을 걷어 냈다.
  - 여백을 잘라 256x256에 맞춰 앉혔다.
- 육각 테두리와 바탕은 그림에 넣지 않았다. 화면(`EmblemBadge`)에서 SVG로 그리고 등급 색을 입힌다.
- 용도: 문장 화면의 장착 칸, 칸에 넣을 문장 목록, 보유 문장 격자.
- 검수: 문자·숫자·로고·인물 없음, 여덟 장의 외곽선 굵기와 단순화 정도가 한 벌로 보이는지, 48px로 줄였을 때 상징이 읽히는지,
  투명 배경이 밝은 바탕과 어두운 바탕 양쪽에서 초록 테두리 없이 보이는지 확인. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 생성 프롬프트

```text
Generate 8 game icon images with your image generation tool and save them as PNG files in the current directory. Do not write code or any other files; just generate and save the images.

Style reference: `reference-hp.png` and `reference-str.png` in this directory are two approved badges. Match the drawing style of the SYMBOL inside those badges exactly: modern flat vector icon for a mobile game UI, a bold simple geometric shape, 3 or 4 flat colors, one thick clean dark navy outline (#101a4a) of the same thickness as in the references, a single flat lighter highlight shape, no gradients, no texture, no shading other than flat color blocks.

IMPORTANT difference from the references: draw ONLY the symbol. Do NOT draw the hexagon badge, no frame, no cream background plate. The hexagon will be added later in software.

Requirements for every image:
- Square 1024x1024, one single symbol centered, filling about 70% of the canvas, viewed straight on.
- The symbol must be one closed shape fully enclosed by the thick dark navy outline, so that the outline separates it from the background everywhere. No detached floating parts except where listed below.
- Background: one perfectly flat solid pure green (#00FF00). No gradient, no shadow, no glow, no vignette.
- Do not use green close to #00FF00 anywhere inside the symbol.
- No text, no letters, no numbers, no people, no extra objects.
- The symbol must be readable when shrunk to 40 pixels: few large shapes, no fine detail.
- All 8 images must look like one icon set: same outline thickness, same highlight treatment, same level of simplification, similar visual weight.

Files and symbols:
1. `flat-hp.png` — a red heart (same as reference-hp, without the hexagon).
2. `flat-mp.png` — a blue water droplet.
3. `flat-str.png` — a clenched armored fist gauntlet in steel blue-grey (same as reference-str, without the hexagon).
4. `flat-dex.png` — a golden-yellow lightning bolt.
5. `flat-vit.png` — a sturdy kite shield in teal with a simple lighter cross band.
6. `flat-int.png` — an open spell book in violet with cream pages; a small yellow four-point star attached directly above the book, touching it.
7. `flat-spi.png` — a pink lotus flower with five large petals.
8. `flat-luk.png` — a four-leaf clover in deep forest green (#2e7d4f, clearly darker and bluer than the background green) with a short stem.

When done, list the files you saved.
```
