# 요리 특화 전용 요리 그림 출처

- 제작: 2026-11-13, Codex 내장 imagegen(`codex exec`). 세 묶음으로 나눠 생성했다.
  - 화덕·냄비 15장: 세션 `01a1d49c-c2d1-7362-82f4-50d10743446e`
  - 제과·해산물 14장: 세션 `01a1d49c-cc31-75d3-955f-15098a249b87`
  - 해산물·약선 13장: 세션 `01a1d49c-d64b-7d41-8263-e891fbcb0880`
- 화풍 참고: `public/images/items/cooking/`의 기존 요리 그림 8장(`golden_rice_congee`, `royal_cacao_tart`, `herb_tea`,
  `fish_skewer`, `simple_tomato_soup`, `grilled_corn`, `sugar_cookie`, `boiled_egg`)을 한 장으로 붙인 견본만 참고했다.
  기존 파일은 변경하지 않았다.
- 생성 원본: `~/.codex/generated_images/<세션>/` 아래 PNG 42장(1254x1254로 생성되며, 대부분 1024x1024로 줄여 받았다).
- 프로젝트 저장: `public/images/items/cooking/branch_<특화 id>_<1|2|3>.webp` 42장. 파일명은 전용 요리 id와 같다.
  - 단색 마젠타 배경(#FF00FF)을 따냈다. 요리에 초록 채소와 허브가 많아 초록 배경 대신 마젠타를 썼다.
    마젠타 우세도(min(R, B) - G)가 24 이하면 물체, 200 이상이면 배경으로 보고 그 사이는 반투명으로 처리했다.
    가장자리나 확실한 배경 픽셀에서 이어진 덩어리만 지워, 냄비 손잡이 구멍처럼 닫힌 배경도 함께 지웠다.
    가장자리의 마젠타 번짐은 걷어 냈다.
  - 여백을 잘라 256x256(안쪽 여백 6%) 투명 WebP(품질 90)로 다시 앉혔다. 기존 요리 그림과 같은 크기다.
- 용도: 주방 특화 화면의 전용 요리 줄, 인벤토리·거래소·납품 화면의 음식 그림.
- 검수: 42장 모두 문자·숫자·로고·인물 없음, 기존 요리 그림과 같은 화풍, 랭크가 오를수록 그릇과 차림이 화려해지는지,
  투명 배경이 라이트·다크 표면 양쪽에서 마젠타 테두리 없이 보이는지 확인했다. `branchRecipes.test.ts`가 42장의 크기,
  투명 배경, 네 모서리 투명 여부를 검사한다. 최종 파일 해시는 `docs/asset-rights.json`에서 관리한다.

## 생성 프롬프트

세 묶음에 같은 머리말을 쓰고 목록만 나눴다(N은 15, 14, 13).

```text
Generate N game food icons with your image generation tool and save them as PNG files in the `out/` folder of the current directory. Do not write any code other than what is needed to save the files. Do not modify anything outside `out/`. Generate every image separately (one dish per image, never a sheet).

## Style

Look at `ref/cooking-style.png` first. It shows eight existing food icons from the same game. The new icons must look like they belong to the same set:

- Hand-painted fantasy RPG food icon, semi-realistic and appetizing, warm soft lighting from the upper left, crisp painted edges, rich texture detail, the same level of detail and the same slightly-from-above three-quarter view as the reference.
- One single dish per image (with its plate, bowl, board or pot), centered, filling about 80% of the frame.
- Rank feel: dishes marked "humble" are simple home cooking on plain tableware; "refined" dishes are richer with nicer tableware; "masterwork" dishes are lavish signature dishes on ornate tableware with small gold or brass accents.

## Hard requirements for every image

- Square, 1024x1024.
- Background is one perfectly flat solid pure magenta, exactly #FF00FF, edge to edge. No gradient, no vignette, no table, no floor, no cast shadow on the background, no glow, no steam, no sparkles or particles outside the dish.
- The dish and tableware must not contain any magenta, hot pink or purple.
- No text, no letters, no numbers, no border, no frame, no hands, no people, no cutlery floating separately.
- The dish must not touch the image edges.

## The N icons

1. `out/branch_hearth_grill_1.png` (humble): a rustic wood-fire roasted pork shoulder on a simple wooden board, dark charred crust, a few sliced onion rings and green herb sprigs beside it.
2. `out/branch_hearth_grill_2.png` (refined): a rack of charcoal-grilled pork ribs glazed with dark glossy sauce, sprinkled with chopped herbs and cracked pepper, on a dark iron platter.
3. `out/branch_hearth_grill_3.png` (masterwork): a lavish roast feast: a whole roasted pork loin with golden crackling surrounded by grilled corn cobs and golden roasted potatoes on an ornate brass-rimmed serving tray.
4. `out/branch_hearth_fry_1.png` (humble): a paper-lined wicker basket of mixed crispy golden potato fries and fried onion rings.
5. `out/branch_hearth_fry_2.png` (refined): three golden breaded croquettes on a small plate, one cut open showing a yellow egg, potato and corn filling.
6. `out/branch_hearth_fry_3.png` (masterwork): a grand fried platter on a dark lacquered tray with gold trim: sliced breaded pork cutlet, golden egg fritters and small fried pearl onions neatly arranged, with a tiny dipping sauce bowl.
7. `out/branch_hearth_stir_1.png` (humble): wok-fried vegetables on a plain ceramic plate: onion slices, red tomato wedges and soybeans, glistening with oil.
8. `out/branch_hearth_stir_2.png` (refined): a sizzling round cast-iron skillet of stir-fried pork slices, soybeans and onions in a dark savory sauce.
9. `out/branch_hearth_stir_3.png` (masterwork): a large ornate platter heaped high with wok-charred fried rice mixed with pork pieces, scrambled egg and black soybeans, gold-rimmed plate.
10. `out/branch_pot_soup_1.png` (humble): a plain earthenware bowl of clear brown meat-and-potato soup with potato chunks, pork pieces and onion.
11. `out/branch_pot_soup_2.png` (refined): a deep stoneware bowl of thick rich red-brown stew with big chunks of pork, potato and tomato.
12. `out/branch_pot_soup_3.png` (masterwork): a wide ornate bronze hot pot with two ring handles, filled with neatly arranged pork slices, onions and golden rice in a rich broth.
13. `out/branch_pot_steam_1.png` (humble): a small plain ceramic pot of fluffy pale-yellow steamed egg custard dotted with yellow corn kernels.
14. `out/branch_pot_steam_2.png` (refined): thick slices of steamed boiled pork fanned out on a round plate with steamed onion and soybeans beside them.
15. `out/branch_pot_steam_3.png` (masterwork): a large round bamboo steamer basket with brass bands, packed with steamed pork slices, potatoes and bright yellow sweet corn, with a small bowl of white cream sauce inside.
16. `out/branch_baking_pastry_1.png` (humble): a small open wooden box filled with assorted golden butter cookies.
17. `out/branch_baking_pastry_2.png` (refined): a round tart with a golden crust, white whipped cream and glossy red sliced strawberries on top.
18. `out/branch_baking_pastry_3.png` (masterwork): an elegant multi-layer dark chocolate cake on a gold-rimmed cake stand, decorated with whole cacao beans and a little gold leaf.
19. `out/branch_baking_bread_1.png` (humble): a round rustic country bread loaf with a floured, cross-scored brown crust.
20. `out/branch_baking_bread_2.png` (refined): a sandwich bread loaf with two slices cut, showing swirls of melted yellow cheese inside, on a small board.
21. `out/branch_baking_bread_3.png` (masterwork): a tall glossy golden braided brioche crown on a fine gold-rimmed plate, with a few golden wheat ears lying beside it on the plate.
22. `out/branch_baking_steamed_1.png` (humble): a wobbly pale cream-colored milk pudding with a brown caramel top on a small plain saucer.
23. `out/branch_baking_steamed_2.png` (refined): several white fluffy steamed rice cakes topped with red strawberry slices and a drizzle of golden honey on a small bamboo tray.
24. `out/branch_baking_steamed_3.png` (masterwork): an exquisite layered chocolate-and-milk pudding in a faceted clear crystal glass dish, topped with clear crystalline sugar shards, on a small gold-rimmed saucer.
25. `out/branch_seafood_fire_1.png` (humble): a whole salt-grilled silver fish with dark grill marks on a simple oval plate with one green herb sprig.
26. `out/branch_seafood_fire_2.png` (refined): a hot round iron plate of spicy red stir-fried shrimp and fish pieces with onion and tomato.
27. `out/branch_seafood_fire_3.png` (masterwork): a large boat-shaped wooden platter with brass trim, loaded with charcoal-grilled seafood: a big whole fish, prawns and shellfish, with grilled corn and potatoes.
28. `out/branch_seafood_stew_1.png` (humble): a plain bowl of clear fish soup with white fish pieces, onion and a little rice.
29. `out/branch_seafood_stew_2.png` (refined): a black iron pot of spicy red seafood hot pot with fish pieces, soybean curd cubes and onions.
30. `out/branch_seafood_stew_3.png` (masterwork): a big festive round platter with gold rim holding steamed seafood (a red crab, a whole fish and shellfish) over rice and soybeans, garnished with a few silvery-white leaves.
31. `out/branch_seafood_pickle_1.png` (humble): a small clear glass dish of vinegar-pickled silver fish fillets with thin white onion slices and green herbs.
32. `out/branch_seafood_pickle_2.png` (refined): a small brown ceramic crock of reddish-orange salted fermented seafood with a small wooden spoon resting in it.
33. `out/branch_seafood_pickle_3.png` (masterwork): a dark-glazed aged clay jar sealed with a cloth-and-rope lid and a small gold seal tag, with a tiny dish of amber fish sauce beside it.
34. `out/branch_medicinal_tea_1.png` (humble): a simple ceramic cup of golden herb tea with a wooden honey dipper resting on the rim and one red strawberry slice floating.
35. `out/branch_medicinal_tea_2.png` (refined): a tall ceramic mug of light-brown cacao herbal tea topped with white cream and a dusting of brown spice.
36. `out/branch_medicinal_tea_3.png` (masterwork): an elegant white porcelain teapot with gold trim and a small matching cup of pale golden tea with a few silvery-white leaves floating, on a dark lacquer tray.
37. `out/branch_medicinal_ferment_1.png` (humble): a glass jar of red strawberry syrup preserve with strawberry pieces inside, a cloth cover tied with twine.
38. `out/branch_medicinal_ferment_2.png` (refined): a dark stoneware bottle of dark-red fermented soybean tonic with a small ceramic cup filled with the dark red liquid.
39. `out/branch_medicinal_ferment_3.png` (masterwork): an ornate apothecary glass decanter of deep amber-brown aged tonic with a red wax seal on the stopper, gold filigree on the glass and a small dried herb bundle tied to its neck.
40. `out/branch_medicinal_meal_1.png` (humble): a plain bowl of pale rice porridge with soybeans and chopped green herbs on top.
41. `out/branch_medicinal_meal_2.png` (refined): a small lidded ceramic steamer bowl, lid half open, showing steamed rice with green herbs and red tomato pieces.
42. `out/branch_medicinal_meal_3.png` (masterwork): an ornate bronze bowl with gold inlay holding golden-yellow rice porridge topped with soybeans and green herbs, its lid set beside it.

When done, list the files in `out/` with their pixel sizes.
```

## 배경 따내기 스크립트

```js
// 단색 마젠타(#FF00FF) 배경을 따내 256x256 투명 WebP 로 만든다.
// 마젠타 우세도 m = min(R, B) - G. 가장자리나 확실한 배경색(m >= HIGH)에서 이어진 덩어리만 지우고(m > LOW), LOW~HIGH 는 반투명으로 둔다.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const LOW = 24, HIGH = 200, SIZE = 256, PAD = 0.06;

async function keyOne(src, dst) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const m = new Int16Array(w * h);
  for (let i = 0; i < w * h; i += 1) m[i] = Math.min(data[i * 4], data[i * 4 + 2]) - data[i * 4 + 1];
  const reached = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (reached[i] || m[i] <= LOW) return;
    reached[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
  // 손잡이 구멍처럼 가장자리와 이어지지 않은 배경도 지운다: 확실한 배경색(m >= HIGH) 픽셀을 씨앗으로 더한다.
  for (let i = 0; i < w * h; i += 1) if (m[i] >= HIGH) push(i % w, (i - (i % w)) / w);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < w * h; i += 1) {
    if (reached[i]) {
      const alpha = Math.max(0, Math.min(1, (HIGH - m[i]) / (HIGH - LOW)));
      // 배경색 번짐 걷어 내기: R, B 를 G 쪽으로 당긴다.
      const g = data[i * 4 + 1];
      data[i * 4] = Math.min(data[i * 4], g + LOW);
      data[i * 4 + 2] = Math.min(data[i * 4 + 2], g + LOW);
      data[i * 4 + 3] = Math.round(alpha * 255);
    }
    if (data[i * 4 + 3] > 16) {
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const inner = Math.round(SIZE * (1 - PAD * 2));
  const cut = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cut, gravity: "center" }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(dst);
  const touches = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
  return { w, h, touches, coverage: ((maxX - minX + 1) * (maxY - minY + 1)) / (w * h) };
}

(async () => {
  const [srcDir, dstDir] = process.argv.slice(2);
  fs.mkdirSync(dstDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".png")).sort()) {
    const id = path.basename(file, ".png");
    const info = await keyOne(path.join(srcDir, file), path.join(dstDir, id + ".webp"));
    console.log(id, `${info.w}x${info.h}`, info.touches ? "TOUCHES_EDGE" : "ok", info.coverage.toFixed(2));
  }
})();
```
