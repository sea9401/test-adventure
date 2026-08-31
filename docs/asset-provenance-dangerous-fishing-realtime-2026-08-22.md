# Dangerous-fishing realtime artwork provenance — 2026-08-22

This tracked record preserves the exact prompts, generation history,
post-processing, deployed paths, and verification evidence for the five assets
listed below. They were created for this repository on 2026-08-22 through the
operator-controlled Codex/OpenAI built-in image-generation session described in
this document.

## Result

Built-in mode: OpenAI/Codex built-in image generation and edit/reference calls. No CLI/API fallback was used.

Final saved assets:

- `public/images/ui/dangerous-fishing-shattered-reef-encounter.webp` — 1664×936, 16:9
- `public/images/ui/dangerous-fishing-storm-trench-encounter.webp` — 1664×936, 16:9
- `public/images/ui/dangerous-fishing-abyssal-rift-encounter.webp` — 1664×936, 16:9
- `public/images/fish/tidal_colossus-struggle.webp` — 1024×256, RGBA, four 256×256 frames
- `public/images/fish/abyss_kraken-struggle.webp` — 1024×256, RGBA, four 256×256 frames

Exact deployed SHA-256 values:

| Path | SHA-256 |
| --- | --- |
| `public/images/ui/dangerous-fishing-shattered-reef-encounter.webp` | `11c22bc8d226d1e185d9df08c28cb8f1e9cbc2dcffd758146d52865ae0e0c052` |
| `public/images/ui/dangerous-fishing-storm-trench-encounter.webp` | `6fe9a0c52085934856a2073a64df657d24275b7cffc95a40e363156b96ed3e76` |
| `public/images/ui/dangerous-fishing-abyssal-rift-encounter.webp` | `37f1c33bd953f3570a485d0b8b4dc5338043b2e6b713e583296b4d9f559a321c` |
| `public/images/fish/tidal_colossus-struggle.webp` | `1e2861b738829b7c9a54892e6d957e32891105a2a56261b17064a4b6d46c66f9` |
| `public/images/fish/abyss_kraken-struggle.webp` | `0e5cbba164a2571bd040fecf64db45f338c85b3a7182176158349e4a54d0be55` |

The generated PNGs were copied into the workspace under the exact requested names, normalized to the exact delivery aspect/dimensions, converted by `npm run optimize-images`, and deleted by that script after WebP output was written. No existing asset was overwritten. The ordinary `imageSrc` fields remain unchanged; the realtime-specific fields are additional literals.

## Input image roles

- `public/images/fish/tidal_colossus.webp`: Tidal Colossus identity/style source and edit reference.
- `public/images/fish/abyss_kraken.webp`: Abyss Kraken identity/style source and edit reference.
- `/mnt/c/Users/sea94/OneDrive/바탕 화면/golem-walk-8frames.png`: motion spacing/shared-anchor reference only. Its golem identity, pixel-art style, palette, anatomy, and frame count were explicitly excluded.

The golem sheet was supplied by the user/operator in the task conversation. It
was never copied into this repository, never deployed, and was used only to
communicate generic equal-cell spacing, a shared baseline/anchor, and readable
pose progression. Its author and license are not established by the retained
evidence, so this record makes no ownership or license claim about it. No pixels
were copied from that sheet. The prompts explicitly excluded its character
identity, palette, anatomy, pixel-art style, and eight-frame design; the two
deployed sheets instead derive fish/boss identity, palette, anatomy, and
painterly style from the already-cleared repository sources
`public/images/fish/tidal_colossus.webp` and
`public/images/fish/abyss_kraken.webp`.

Both boss sources and the motion reference were inspected with `view_image` immediately before their respective edit/reference calls. The selected generated sheets and the final processed PNG sheets were also inspected with `view_image`.

## Final prompt log

All image-generation calls used the built-in mode. The complete prompt set used to reach the selected final assets follows.

### 1. Shattered Reef background

~~~text
Use case: stylized-concept
Asset type: 16:9 realtime fishing encounter game background
Primary request: Shattered Reef — a shallow turquoise dangerous reef, fractured pale rock shelves confined to the outer edges and bottom, sun caustics, sparse coral, energetic but readable.
Scene/backdrop: underwater environment only.
Style/medium: painterly fantasy watercolor-and-ink game background matching a polished adventure RPG.
Composition/framing: exact 16:9 landscape. Reserve the entire central 60% as an open, uncluttered water gameplay field. Keep the upper-right diagonal line corridor open and visually quiet. Put rock shelves, coral, foam, and texture only around the outer edges and along the bottom; no central focal subject.
Lighting/mood: bright turquoise sun caustics with a dangerous, lively current.
Constraints: background only; no text, no UI, no fish, no creatures, no person, no boat, no fishing rod, no fishing line, no hook, no lure, no watermark. The central 60% and upper-right line corridor must stay empty enough for overlaid gameplay sprites and line rendering.
Avoid: any object crossing the central gameplay field; busy particles in the upper right; frame, border, lettering, icons.
~~~

### 2. Storm Trench background

~~~text
Use case: stylized-concept
Asset type: 16:9 realtime fishing encounter game background
Primary request: Storm Trench — a storm-dark underwater trench with teal and slate-blue current bands, distant lightning glow filtering through the surface, edge rocks and bubbles, with the central water column calm enough for an overlaid fish sprite.
Scene/backdrop: underwater storm trench environment only.
Style/medium: painterly fantasy watercolor-and-ink game background matching a polished adventure RPG.
Composition/framing: exact 16:9 landscape. Reserve the entire central 60% as an open, uncluttered water gameplay field. Keep the upper-right diagonal line corridor open and visually quiet. Confine trench rocks, bubbles, turbulent current accents, and strong light detail to the outer edges, surface band, and bottom; no central focal subject.
Lighting/mood: storm-dark teal and slate blue, distant cool lightning glow, dangerous currents but readable gameplay contrast.
Constraints: background only; no text, no UI, no fish, no creatures, no person, no boat, no fishing rod, no fishing line, no hook, no lure, no watermark. The central 60% and upper-right line corridor must stay empty enough for overlaid gameplay sprites and line rendering.
Avoid: any object crossing the central gameplay field; busy bubbles or lightning in the upper right; frame, border, lettering, icons.
~~~

### 3. Abyssal Rift background

~~~text
Use case: stylized-concept
Asset type: 16:9 realtime fishing encounter game background
Primary request: Abyssal Rift — a deep indigo abyss with violet bioluminescent crystals and jagged shelves at the edges and bottom, a narrow visible surface strip, restrained light shafts, mysterious fantasy atmosphere.
Scene/backdrop: underwater abyssal rift environment only.
Style/medium: painterly fantasy watercolor-and-ink game background matching a polished adventure RPG.
Composition/framing: exact 16:9 landscape. Reserve the entire central 60% as an open, uncluttered deep-water gameplay field. Keep the upper-right diagonal line corridor open and visually quiet. Confine crystals, jagged shelves, rock silhouettes, and bright accents to the outer edges and bottom; keep only a narrow surface strip; no central focal subject.
Lighting/mood: deep indigo, restrained violet bioluminescence, subtle light shafts, mysterious and dangerous but readable.
Constraints: background only; no text, no UI, no fish, no creatures, no tentacles, no person, no boat, no fishing rod, no fishing line, no hook, no lure, no watermark. The central 60% and upper-right line corridor must stay empty enough for overlaid gameplay sprites and line rendering.
Avoid: any object crossing the central gameplay field; busy crystals or particles in the upper right; frame, border, lettering, icons.
~~~

### 4. Tidal Colossus four-pose identity/reference edit

~~~text
Use case: identity-preserve
Asset type: realtime fishing boss struggle animation sprite sheet
Input images: Image 1 is the exact Tidal Colossus identity/style source and the edit target; Image 2 is only a motion-spacing and shared-anchor reference. Do not copy Image 2's golem identity, pixel-art style, colors, anatomy, or frame count.
Primary request: Create a single exact 1024×256 horizontal sprite sheet of the Tidal Colossus from Image 1, divided into four equal 256×256 frames in this left-to-right order: (1) neutral wind-up, (2) strong left bend, (3) strong right thrash, (4) recovery toward neutral.
Subject: preserve Image 1's unmistakable whale-like sea colossus identity, turquoise/teal/blue palette, pale armored ridges, fins, facial structure, scale texture, painterly fantasy rendering, and left-facing orientation.
Composition/framing: exactly four non-overlapping square cells across one horizontal row; one complete creature per cell; identical apparent creature scale; consistent canvas position and gameplay anchor across all four frames; enough transparent padding so no fin or tail is clipped. Use Image 2 only to understand consistent baseline/anchor and sequential pose readability.
Scene/backdrop: genuinely transparent RGBA background in every pixel outside the creature; no checkerboard, no matte color, no shadow plane.
Constraints: change only the pose between frames; preserve identity, colors, anatomy, detailing, lighting, rendering style, and orientation. Exactly four creatures and exactly four frames. No text, labels, separators, borders, UI, water, bubbles, splash, fishing rod, fishing line, hook, logo, or watermark.
Avoid: redesigning the boss; converting to pixel art; copying the golem; opaque or fake transparent background; uneven cell widths; overlapping frames; cropped anatomy; changing size or anchor between frames.
~~~

### 5. Tidal Colossus selected alpha/layout correction

~~~text
Use case: background-extraction
Asset type: corrected realtime boss struggle sprite sheet
Input images: Image 1 is the generated four-pose Tidal Colossus sheet to correct.
Primary request: change only the sheet canvas/layout and background. Preserve all four existing Tidal Colossus poses, their exact identity, colors, anatomy, painterly style, left-facing orientation, and left-to-right action order. Re-layout them into an exact 4:1 horizontal strip intended as 1024×256: four equal square cells, one pose centered in each cell, consistent scale and gameplay anchor.
Scene/backdrop: remove the visible white/gray checker pattern completely and replace it with genuine RGBA transparency (alpha 0) everywhere outside the creatures.
Constraints: exactly four creatures, exactly four equal cells; neutral wind-up, left bend, right thrash, recovery. No visible checkerboard, no white or gray matte, no background pixels, no dividers, no borders, no text, no UI, no water, no bubbles, no shadow, no watermark. Do not redesign or restyle any creature. Do not crop any fin or tail.
Avoid: fake transparency; 2:1 canvas; extra padding above/below; changing poses or identity.
~~~

### 6. Abyss Kraken four-pose identity/reference edit

~~~text
Use case: identity-preserve
Asset type: realtime fishing boss struggle animation sprite sheet
Input images: Image 1 is the exact Abyss Kraken identity/style source and the edit target; Image 2 is only a motion-spacing and shared-anchor reference. Do not copy Image 2's golem identity, pixel-art style, colors, anatomy, or eight-frame count.
Primary request: Create one horizontal four-pose sprite strip of the Abyss Kraken from Image 1, intended for exact final delivery at 1024×256, with four equal 256×256 frames in this left-to-right order: (1) neutral wind-up, (2) strong left bend with tentacles pulled left, (3) strong right thrash with tentacles sweeping right, (4) recovery toward neutral.
Subject: preserve Image 1's unmistakable many-tentacled kraken identity, deep indigo/blue/violet palette, bright cyan suction cups, gold-edged highlights, central head/eye structure, ornate painterly fantasy rendering, and front-facing gameplay readability.
Composition/framing: exactly four non-overlapping square cells across one horizontal row; one complete kraken per cell; identical apparent creature scale; consistent canvas position, central body anchor, and baseline across all four frames; enough transparent padding so no tentacle is clipped. Use Image 2 only to understand consistent anchor and sequential pose readability.
Scene/backdrop: genuinely transparent RGBA background (alpha 0) everywhere outside each kraken; no checkerboard pattern, no black/white/gray matte, no shadow plane.
Constraints: change only the pose between frames; preserve identity, colors, anatomy, tentacle count/readability, detailing, lighting, and rendering style. Exactly four creatures and exactly four frames. No text, labels, separators, borders, UI, water, bubbles, splash, fishing rod, fishing line, hook, logo, or watermark.
Avoid: redesigning the boss; converting to pixel art; copying the golem; fake transparency; uneven cell widths; overlapping frames; cropped tentacles; changing size or anchor between frames.
~~~

### 7. Abyss Kraken first targeted extraction/layout correction

~~~text
Use case: background-extraction
Asset type: corrected realtime boss struggle sprite sheet
Input images: Image 1 is the generated four-pose Abyss Kraken sheet to correct.
Primary request: change only the sheet canvas/layout and background. Preserve all four existing Abyss Kraken poses, their exact identity, colors, anatomy, tentacle shapes, painterly style, and left-to-right action order. Re-layout them into one compact horizontal strip intended for exact 1024×256 final delivery: four equal square cells, one pose centered in each cell, consistent scale, central-body gameplay anchor, and baseline.
Scene/backdrop: remove the visible white/gray checker pattern completely and replace it with genuine RGBA transparency (alpha 0) everywhere outside the creatures.
Constraints: exactly four krakens, exactly four equal cells; neutral wind-up, left bend, right thrash, recovery. No visible checkerboard, no black/white/gray matte, no background pixels, no dividers, no borders, no text, no UI, no water, no bubbles, no shadow, no watermark. Do not redesign or restyle any kraken. Do not crop any tentacle.
Avoid: fake transparency; tall canvas; extra padding above/below; changing poses, identity, colors, or anchors.
~~~

### 8. Abyss Kraken selected targeted extraction

~~~text
Use case: background-extraction
Asset type: transparent game sprite sheet cutout
Input images: Image 1 is the four-pose Abyss Kraken sheet. It currently has a drawn light-gray checker pattern that is NOT transparency.
Primary request: remove every background checker square and all background color from Image 1, producing an actual PNG with an alpha channel. All pixels outside the four krakens must have alpha value 0. Keep the four krakens exactly as they are.
Composition/framing: preserve the same left-to-right four poses and compact horizontal arrangement; crop excess empty space while keeping transparent padding around every tentacle.
Constraints: CHANGE ONLY THE BACKGROUND. Preserve every kraken's identity, pose, color, anatomy, scale, anchor, lighting, outlines, and action order exactly. The returned file must be RGBA, not RGB. Do not visually depict transparency. No checker pattern, no matte, no backdrop, no shadows, no text, no border, no divider, no added elements.
Avoid: painting white or gray squares; fake transparency; redesigning or regenerating the krakens; losing fine tentacle edges.
~~~

The selected Tidal correction returned a real alpha-enabled 2172×724 PNG. It was cropped to four 543×543 cells, its generated alpha mask was cleaned before downsampling, and it was resized to 1024×256 without changing the four generated poses. The final WebP contains 187,143 fully transparent pixels.

The built-in Kraken calls preserved the requested identity and four poses but returned the checker pattern as RGB pixels even after two targeted background-extraction iterations. The final selected built-in raster was therefore locally cropped to four 443×443 cells, the neutral checker pixels were converted to a clean alpha mask without changing the colored creature pixels, and the sheet was resized to 1024×256. The resulting PNG and WebP both report `hasAlpha: true`; the final WebP contains 158,721 fully transparent pixels.

## RED / GREEN and verification

RED:

- Command: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingAssets.test.ts && npm run check-images`
- Result: exit 1; 2 test files failed, 6 tests failed and 6 passed.
- Expected failures: undefined `encounterImageSrc` and five missing WebP files. This was captured before catalog fields or image files were added.

GREEN:

- Command: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingAssets.test.ts && npm run check-images`
- Result: exit 0; 2 test files passed, 12 tests passed; all image references consistent.
- Metadata: encounter backgrounds 1664×936; boss sheets 1024×256 with `hasAlpha: true`.
- PNG deletion: confirmed all five workspace PNG originals were removed after `npm run optimize-images`.
- Rights pre-check correctly reported the five new files as unregistered.
- `npm run update-asset-rights` wrote `docs/asset-rights.json` with 464 assets.
- `npm run check-asset-rights` then passed: 15 repository-authored vectors, 441 operator-cleared game-art assets, and 8 operator-cleared brand-art assets.
- `git diff --check` and targeted ESLint for the changed TypeScript/test/optimizer files passed with no output.
- Full `npm test` passed: 894 test files and 7,199 tests passed; 4 files and 22 tests were skipped; exit 0.

## Self-review

- Exact requested new filenames are used; no pre-existing asset was overwritten.
- Backgrounds contain no text, UI, fish, creature, rod, line, hook, or lure; central gameplay space and the upper-right line corridor remain visually quiet.
- Each boss sheet has exactly four horizontally ordered poses: neutral wind-up, left bend, right thrash, recovery.
- Boss identity, palette, and painterly fantasy style remain derived from each corresponding repository source, not from the golem motion reference.
- Existing normal-fishing `imageSrc` values remain intact; only `encounterImageSrc` and `struggleSpriteSrc` were added.
- Fish optimization now retains 1024px-wide four-frame sheets while `withoutEnlargement` prevents smaller fish assets from being enlarged.
- No deployment, maintenance-mode command, push, or external write was performed.

## Fix round 1: transparent padding and matte cleanup

Reviewer findings were reproduced against commit `f2c3f6bf`: Tidal frame 1 had 17 nontransparent pixels on its right edge and frame 2 had 16 on its left edge; Kraken frame 2 had 11 on its right edge and frame 3 had 2 on its left edge. The root cause was whole-sheet resizing without independently normalizing each pose inside its own 256×256 cell. The previous built-in transparency attempts also made fake-checker diagnosis difficult, so this round used an intentionally opaque chroma intermediate.

### Fix-round Tidal prompt

~~~text
Use case: precise-object-edit
Asset type: four-frame realtime fishing boss sprite-sheet intermediate for chroma-key extraction
Input images: Image 1 is the exact Tidal Colossus four-pose sheet to preserve.
Primary request: replace only the background outside all four creatures with one perfectly uniform, flat chroma-key green color #00FF00.
Subject invariants: keep the four existing Tidal Colossus creatures exactly recognizable and unchanged: same identity, turquoise/teal/blue and pale-gold colors, anatomy, facial structure, fins, scale detail, painterly fantasy style, pose shapes, apparent scale, left-facing orientation, and left-to-right order (neutral wind-up, left bend, right thrash, recovery).
Composition/framing: retain exactly four separate creatures in one horizontal row with no overlap. Keep each full creature intact with every fin and tail visible. Do not add or remove anatomy.
Background: solid RGB #00FF00 across every background pixel, including holes between fins and curled tail spaces. Absolutely uniform and opaque for later color-key extraction.
Constraints: change only the background; exactly four poses; no transparency checkerboard, no white or gray pixels, no gradient, texture, lighting, shadow, halo, outline, border, divider, text, UI, water, bubbles, splash, rod, line, hook, logo, or watermark.
Avoid: fake transparency; checker pattern; white/light-gray matte rectangles; green spill on creature edges; redesigning, recoloring, moving, cropping, or merging creatures.
~~~

### Fix-round Abyss Kraken prompt

~~~text
Use case: precise-object-edit
Asset type: four-frame realtime fishing boss sprite-sheet intermediate for chroma-key extraction
Input images: Image 1 is the exact Abyss Kraken four-pose sheet to preserve.
Primary request: replace only the background outside all four creatures with one perfectly uniform, flat chroma-key green color #00FF00.
Subject invariants: keep the four existing Abyss Kraken creatures exactly recognizable and unchanged: same identity, deep indigo/blue/violet palette, cyan suction cups, gold-edged highlights, anatomy, tentacle shapes and count, central head/eye structure, painterly fantasy style, pose shapes, apparent scale, front-facing readability, and left-to-right order (neutral wind-up, left bend, right thrash, recovery).
Composition/framing: retain exactly four separate creatures in one horizontal row with no overlap. Keep each full creature intact with every curled tentacle visible. Do not add or remove anatomy.
Background: solid RGB #00FF00 across every background pixel, including every enclosed hole inside curled tentacles and spaces between tentacles. Absolutely uniform and opaque for later color-key extraction.
Constraints: change only the background; exactly four poses; no transparency checkerboard, no white or gray pixels, no gradient, texture, lighting, shadow, halo, outline, border, divider, text, UI, water, bubbles, splash, rod, line, hook, logo, or watermark.
Avoid: fake transparency; checker pattern; white/light-gray matte rectangles; leaving checker pixels inside tentacle curls; green spill on creature edges; redesigning, recoloring, moving, cropping, or merging creatures.
~~~

Both prompts ran through built-in image generation/edit mode. The selected chroma intermediates were inspected before extraction. Their background colors were sampled from a subject-free top strip, removed by color-distance alpha matting, and decontaminated against the sampled chroma value. For each pose independently, only the largest connected subject component was retained, the alpha bounds were cropped, aspect ratio was preserved, the subject was constrained to at most 224×224, and it was centered on a stable 256×256 canvas anchor.

Fix-round RED:

- Command: `npx vitest run src/adventure/v2/dangerousFishingAssets.test.ts`
- Result: exit 1; 2 tests failed and 5 passed.
- The failures reproduced Tidal frame 1's 17 right-edge pixels and Kraken frame 1's 218 nontransparent pixels inside the required 12px gutter before either production WebP was replaced.

Fix-round GREEN and visual checks:

- The same targeted test passed: 7/7.
- Every frame contains actual alpha-zero pixels, has zero nontransparent pixels on all four cell edges, and has at least 16px transparent left/right padding.
- Final Tidal frame bounds: `(16,65)..(239,190)`, `(16,61)..(239,194)`, `(16,62)..(239,193)`, `(16,66)..(239,189)`.
- Final Kraken frame bounds: `(16,39)..(239,216)`, `(16,44)..(239,211)`, `(16,49)..(239,205)`, `(16,41)..(239,214)`.
- Both final PNGs and optimized WebPs were composited against black, white, and bright magenta backgrounds. Visual inspection found no checker rectangles, matte, halo, separated specks, frame-boundary collision, clipped fin, or clipped tentacle; identity, colors, and action order remain intact.
- `npm run optimize-images` replaced both PNGs with alpha-enabled 1024×256 WebPs; `npm run update-asset-rights` updated only the two changed asset hashes.
- Final targeted verification passed 14/14 across the catalog and asset suites; `git diff --check`, targeted ESLint, `npm run check-images`, and `npm run check-asset-rights` all exited 0.
- A full `npm test` run completed with 7,200 passes, 22 skips, and one unrelated `SanctionsSection.test.tsx` async-loading failure (`조회 중…` remained when history text was asserted). Immediate isolated rerun of that file passed 10/10, so no unrelated production or test file was changed.

## Fix round 2: chroma-spill regression and palette-safe extraction

Review found that the round-1 chroma-key extraction fixed padding but left a continuous green fringe. A raw-pixel regression was added before replacing either production asset. It considers every nontransparent pixel that directly touches transparency, classifies only strongly neon green pixels (`G >= 145`, `G - R >= 50`, and `G - B >= 25`), and applies a hand-checked ceiling of 8%. The ceiling allows the Tidal source's legitimate turquoise highlights while rejecting chroma spill.

Fix-round-2 RED:

- Command: `npx vitest run src/adventure/v2/dangerousFishingAssets.test.ts`
- Result: exit 1; 2 tests failed and 7 passed.
- Current round-1 Tidal sheet: 72.7136% neon-green boundary pixels (failed the 8% ceiling).
- Current round-1 Kraken sheet: 46.6828% neon-green boundary pixels (failed the 8% ceiling).

No new built-in image generation/edit call was made in this round, so there is no new image prompt. The final method deliberately returned to the selected pre-chroma built-in outputs to avoid another generative identity change:

- Tidal input: `/home/sea9401/.codex/generated_images/01a02787-ee7d-7772-ae74-04474551613e/exec-bec2f6bf-ca69-42a3-9246-7914c12e8c99.png` (the real-alpha generated sheet from the original built-in identity-preserving edit). Its original alpha was retained and colored pixels were not chroma-thresholded.
- Kraken input: `/home/sea9401/.codex/generated_images/01a02787-ee7d-7772-ae74-04474551613e/exec-e878629b-2a16-48ed-a6b2-c561c7844780.png` (the pre-chroma generated pose sheet). Neutral high-luminance checker components were identified by raw pixels. Border-connected components and enclosed components of at least 64 pixels were made transparent; small neutral components were retained as creature highlights. No global green-channel clamp or colored-pixel threshold was used.
- Each pose was processed independently. The largest connected subject component was cropped, resized aspect-preservingly to at most 224×224, and centered in its own 256×256 transparent cell. The exact saved outputs remain `public/images/fish/tidal_colossus-struggle.webp` and `public/images/fish/abyss_kraken-struggle.webp`.

Fix-round-2 GREEN and visual checks:

- The targeted asset suite passed 9/9.
- Final WebP boundary ratios are Tidal 4.5846% and Kraken 0.0780%, both below 8%. With the same literal classifier, the identity sources are Tidal 2.5189% and Kraken 0.0976%; the result is again in the source-palette range instead of the round-1 chroma-dominated range.
- Boundary palette comparison also retained expected subject colors: source→final teal/cyan shares were Tidal 40.09%→47.30% and Kraken 22.96%→34.29%; source→final gold shares were Tidal 16.12%→13.48% and Kraken 18.20%→27.82%. These figures and visual inspection confirm that legitimate teal/cyan and gold detail was not globally suppressed.
- Final Tidal frame bounds are `(16,64)..(239,191)`, `(16,63)..(239,192)`, `(16,59)..(239,195)`, and `(16,66)..(239,188)`.
- Final Kraken frame bounds are `(16,41)..(239,214)`, `(16,49)..(239,206)`, `(16,50)..(239,205)`, and `(16,46)..(239,208)`.
- Every cell has zero nontransparent pixels on all four edges and at least 16px transparent padding. Black, white, and bright-magenta composites of both optimized WebPs were inspected at original detail. No neon fringe, gray checker block, matte halo, clipped anatomy, lost fin/tentacle, or missing cyan/gold detail was found.
- `npm run optimize-images` replaced the two temporary PNGs with alpha-enabled 1024×256 WebPs and deleted the PNGs. `npm run update-asset-rights` updated only the two asset hashes.
- Final verification passed 16/16 across the catalog and asset suites. Targeted ESLint, `git diff --check`, `npm run check-images`, and `npm run check-asset-rights` all exited 0.

## Fix round 3: detached checker/matte raw-pixel regression

This round changes tests only; the visually approved production WebPs and their rights hashes are unchanged. The new raw-pixel analyzer works independently inside each 256×256 frame:

- It finds four-neighbor-connected nontransparent components. The largest is treated as the creature; any detached component larger than the hand-checked 20px ceiling is rejected. Existing WebP resampling specks top out at 19px.
- It separately finds high-luminance, low-saturation neutral components (`min(R,G,B) >= 180`, channel range `<= 30`). A component is rejected as a rectangular matte/checker block when it covers at least 64px and at least 75% of its bounding box.
- The rectangular-density condition allows legitimate connected pale-gold/white creature highlights. The largest real Tidal neutral highlight is 117px but only 34.2% of its irregular bounding box; the largest real Kraken neutral highlight is 11px.

Fix-round-3 RED:

- The test copies the real Tidal WebP's decoded raw pixel buffer in memory, inserts an 8×8 alternating white/light-gray opaque checker fragment into a known transparent area, and runs the same analyzer used for the production assertions.
- Command: `npx vitest run src/adventure/v2/dangerousFishingAssets.test.ts`
- Result before implementing the analyzer: exit 1; 1 failed and 11 passed. The controlled behavior assertion failed with `expected [] to include 64`.
- The mutation is never written to disk and asserts both a detached 64px alpha component and a dense 64px neutral block, proving behavior rather than checking source text or a constant.

Fix-round-3 GREEN:

- After adding the minimal four-neighbor component analysis, the asset suite passed 12/12 on the controlled mutation and both real WebPs.
- Both real assets report no detached alpha component above 20px and no neutral block meeting the literal 64px/75% defect threshold.
- Final catalog plus asset verification passed 19/19. Targeted ESLint, `npm run check-images`, `npm run check-asset-rights`, and `git diff --check` all exited 0.
