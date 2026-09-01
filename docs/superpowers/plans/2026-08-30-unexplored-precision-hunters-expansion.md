# Unexplored Precision Hunters Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정밀 척후병·치명 저격수·갑옷 사냥꾼을 실제 미개척지 사냥에 균등 출현시키고 적중·치명타·관통·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 정밀 사냥단을 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과, 풀 공통 보상은 기존 공통 경로를 따른다. 전투는 이미 배선된 `accuracy`, `critPct`, `pierce`, `playerDefVulnerable`을 변경 없이 사용한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 여섯 특수 풀만 `expanded`; 폭주 기계 이후 6개 풀은 `launch` 상태를 유지한다.
- 정밀 사냥단 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 자동 전투와 적중·치명타·관통 필드를 사용하며 새 조준 규칙을 추가하지 않는다.
- 집중은 적중 +15, 치명타 +8%p, 플레이어 방어 5% 비율 관통을 적용한다.
- 세 몬스터는 같은 `v2_unexplored_precision_hunters_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 짙은 녹색 천·어두운 가죽과 금속·황동 장식·주황색 렌즈의 어두운 판타지 사냥꾼 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 정밀 사냥단 활성화와 런타임 배선

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

**Interfaces:**
- Consumes: `UnexploredMonsterPool.releaseStage`, `activeMonsters`, `pickUnexploredMonster()`, `unexploredMonsterAtDifficulty()`, `unexploredCommonBaseline()`
- Produces: 정밀 사냥단의 활성 ID `precision_scout | lethal_sniper | armor_hunter`
- Produces: `SPECIAL_IMAGE_PATHS.lethal_sniper`, `SPECIAL_IMAGE_PATHS.armor_hunter`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.precision_hunters.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.precision_hunters.activeMonsters.map(({ id }) => id),
).toEqual(["precision_scout", "lethal_sniper", "armor_hunter"]);

expect(pickPrecisionMonster(0)?.monsterId).toBe("precision_scout");
expect(pickPrecisionMonster(0.34)?.monsterId).toBe("lethal_sniper");
expect(pickPrecisionMonster(0.67)?.monsterId).toBe("armor_hunter");
```

시뮬레이션 테스트는 난이도 90 공통 적중 기준을 독립적으로 구하고 실제 생성 결과를 검사한다.

```ts
const accuracy = unexploredCommonBaseline(90).accuracy;
expect(byId.precision_scout.monster.accuracy).toBe(accuracy + 20);
expect(byId.lethal_sniper.monster).toMatchObject({
  accuracy: accuracy + 30,
  critPct: 38,
});
expect(byId.armor_hunter.monster.accuracy).toBe(accuracy + 30);
expect(byId.armor_hunter.monster.skill).toMatchObject({
  kind: "pierce",
  armorPierce: 11,
});
```

런타임 카탈로그는 활성 특수 몬스터 24종과 전체 29종을 기대한다. 치명 저격수와 갑옷 사냥꾼의 이미지 파일명과 전투 필드를 검사한다. 집중 전후에는 적중이 정확히 15, 치명타가 정확히 8 증가하고 `playerDefVulnerable`이 0.05인지 확인한다. 갑옷 사냥꾼의 고정 관통 11은 집중 후에도 유지되어야 한다.

서버 테스트는 정밀 사냥단 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `lethal_sniper`, `armor_hunter`로 보존되는지 확인한다. 미출시 거부 테스트는 `runaway_machines/combo_automaton`으로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_precision_hunters_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 치명 저격수·갑옷 사냥꾼이 활성 목록과 런타임에 없고 활성 개수가 24종에 미달해 FAIL

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 정밀 사냥단 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
lethal_sniper: "/images/monster/v2/unexplored-lethal-sniper.webp",
armor_hunter: "/images/monster/v2/unexplored-armor-hunter.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate precision hunters monster roster"
```

### Task 2: 치명 저격수와 갑옷 사냥꾼 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-lethal-sniper.webp`
- Create: `public/images/monster/v2/unexplored-armor-hunter.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 정밀 척후병을 스타일 참조로 치명 저격수를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 짙은 녹색 후드와 어두운 가죽 경갑, 황동 장식, 크게 강조된 주황색 조준 렌즈, 길고 정교한 저격용 석궁, 낮고 안정적인 조준 자세, 전신 표시, 정밀 척후병의 사실적 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 정밀 척후병을 스타일 참조로 갑옷 사냥꾼을 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 짙은 녹색 천과 두꺼운 어두운 판금·가죽 장비, 황동 장식, 굵은 철갑 관통 볼트를 장전한 거대한 공성 석궁, 넓고 견고한 체형, 전신 표시, 정밀 척후병의 사실적 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 출력한 두 절대 저장 경로를 `file`과 이미지 메타데이터 검사에 사용한다. 두 파일 모두 RGBA여야 하며, 체크무늬가 실제 픽셀이면 built-in image generation의 배경 추출 편집으로 사냥꾼을 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

```bash
node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-lethal-sniper.webp','public/images/monster/v2/unexplored-armor-hunter.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"
npm run check-images
```

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 저격형과 중장 관통형 실루엣을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-lethal-sniper.webp public/images/monster/v2/unexplored-armor-hunter.webp
git commit -m "feat: add precision hunters variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify: Tasks 1–2의 소스, 테스트, 이미지 자산

**Interfaces:**
- Consumes: 정밀 사냥단 활성 카탈로그와 이미지
- Produces: 현재 브랜치의 로컬 검증 증거

- [x] **Step 1: 미개척지 관련 테스트를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 2: 타입과 변경 파일 린트를 검사한다**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 두 명령 모두 exit 0

- [x] **Step 3: 이미지 검사와 전체 테스트를 실행한다**

Run: `npm run check-images`

Run: `npm test`

Expected: 누락 이미지 없음, 전체 테스트 PASS

- [x] **Step 4: 미개척지 기능 플래그 production build를 실행한다**

Run: `V2_UNEXPLORED=true npm run build`

Expected: prebuild 이미지 검사와 Next production build PASS

- [x] **Step 5: 작업 범위와 커밋을 확인한다**

Run: `git diff --check && git status --short --branch && git log -8 --oneline`

Expected: 정밀 사냥단 작업 파일은 모두 커밋되고 설계·계획·구현·이미지 커밋이 확인됨. 다른 세션 변경이 있으면 그대로 보존됨.
