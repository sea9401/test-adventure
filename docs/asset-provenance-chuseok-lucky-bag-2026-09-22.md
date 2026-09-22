# 추석 복주머니 이미지 출처

- 제작: 2026-09-22, Codex 내장 imagegen.
- 화풍 참고: `public/images/monster/v2/sangoon.webp`의 수채화 질감과 색감만 참고한다. 기존 산군 파일은 변경하지 않았다.
- 수정 입력: 기존 `public/images/monster/v2/chuseok-lucky-bag.webp`. 첫 시안의 호랑이 문양은 사용자 의도를 잘못 해석한 것으로, 최종 이미지에서는 완전히 제거했다.
- 최종 생성 원본: `/home/sea9401/.codex/generated_images/01a0c8c6-9f1d-7a01-8f02-97ef6365ad33/exec-5943a489-b48e-404b-8136-e97a302feac7.png`
- 프로젝트 저장: `public/images/monster/v2/chuseok-lucky-bag.webp`. 기존 `monster` 프로필(최대 가로 512px, 품질 85)로 리사이즈·WebP 변환하며 투명도를 유지한다.
- 용도: 추석 복주머니 탭과 `CHUSEOK_LUCKY_BAG.image` 전투/리플레이 이미지.
- 검수: 호랑이·얼굴·동물 문양 없음, 구름·꽃 자수와 전통 매듭, 수채화 질감, 투명 배경, 문자 없음 확인. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 최종 수정 프롬프트

```text
Edit the supplied Korean Chuseok lucky pouch illustration. The user intended only the watercolor painting STYLE of the game's Sangoon illustration, NOT a tiger theme. REMOVE the tiger face completely, including the eyes, nose, mouth, ears, tiger stripes and any animal imagery. Replace the central tiger motif with plain softly shaded golden-ochre fabric and a small restrained traditional Korean cloud-and-flower embroidered ornament. The result must unmistakably be a beautiful traditional Korean drawstring lucky pouch, with NO face and NO animal. Preserve the existing overall rounded pouch silhouette, elegant red drawstrings, knots and tassels, muted sage green and ochre gold palette, hand-painted watercolor washes, delicate ink contours, subtle fabric texture, balanced centered composition and high-quality Korean fantasy RPG item art. Avoid a large central medallion; let watercolor fabric and a few tasteful botanical stitches carry the design. One isolated pouch, fully visible, generous transparent padding, genuine transparent alpha background. No scenery, text, lettering, logo, border or shadow rectangle. Output a polished square PNG with transparent background.
```
