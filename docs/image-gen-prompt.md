# 이미지 생성 프롬프트 — 게임 에셋 아트 디렉션

> 상태: 📌 살아있는 문서. 새 게임 이미지(몬스터·보스·NPC·지역 등)를 생성할 때 **항상 이 스타일 프롬프트**를 쓴다. (2026-06-09 사용자 확정 — 이전 "soft crayon + watercolor / round chibi" 톤을 대체.)

## 표준 스타일 프롬프트 (고정)

이 블록은 그대로 유지하고, **대상 묘사만** 앞/뒤에 붙여 쓴다.

```
Cute watercolor storybook RPG asset, hand-painted watercolor texture, colored pencil sketch details, soft paper grain texture, warm beige and brown palette, low saturation colors, round chibi proportions, cute oversized head, soft plush toy feeling, children's picture book illustration, minimal background, isolated character, transparent background, thin sketch outlines, gentle watercolor edges, cozy and heartwarming atmosphere, no dramatic lighting, no strong shadows, no reflections, no shiny surfaces, no rim light, not realistic, not anime, not 3D, not CGI game asset isolated character transparent background centered composition single subject
```

## 쓰는 법

1. **대상 한 줄을 덧붙인다.** 예: `Subject: a cute round wild dog, a plains monster.` → 위 스타일 블록과 합쳐 codex `image_generation` 으로 1장 생성.
2. **투명 배경 처리.** 위 프롬프트는 `transparent background` 를 요청하지만, 실전 파이프라인은 깔끔한 컷아웃을 위해 **평평한 단색 그린스크린(#00ff00, 피사체엔 #00ff00 금지)** 으로 받아 크로마키로 제거한다(codex imagegen 스킬의 chroma-key 또는 sharp 직접). 자세한 작동/함정은 작업 메모리 `codex-image-generation` 참고.
3. **파일 배치 + 최적화.** `public/images/<category>/` 에 두고 `npm run optimize-images` → WebP. 카테고리별 max-width 규격은 `scripts/optimize-images.mjs` 의 `PROFILES`. (AGENTS.md)
4. **파일명 = 코드 식별자 일치.** 몬스터=`Monster.image` 영문 short-name, 지역=`RegionId`, NPC=`Npc.portrait`. `npm run check-images` 로 참조↔파일 검증.

## 모델 주의

- codex 가 ChatGPT 구독 계정이면 `-m gpt-5.1` 등 모델 지정이 거부됨 → **기본 모델**로 둔다.
