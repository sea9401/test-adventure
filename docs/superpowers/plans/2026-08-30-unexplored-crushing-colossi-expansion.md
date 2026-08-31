# Unexplored Crushing Colossi Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 암반 거수·철벽 분쇄자·지각 파괴자를 실제 미개척지 사냥에 균등 출현시키고 기존 관통·강타·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 파쇄 거수를 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과와 풀 공통 보상은 기존 공통 경로를 따른다. 이미 배선된 `heavy_blow`, `pierce`, `mob_crushing_blow`는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 12개 특수 풀 전부 `expanded`이고 모든 `expansionCandidates`는 빈 배열이다.
- 파쇄 거수 세 몬스터는 각각 1/3 확률로 출현한다.
- 새 관통·방어 파괴·강타 규칙을 만들거나 기존 스킬 수치를 변경하지 않는다.
- 집중은 세 몬스터의 공격력을 10% 높이고 `playerDefVulnerable`을 0.08 추가하며 기존 스킬과 MP를 보존한다.
- 세 몬스터는 같은 `v2_unexplored_crushing_colossi_material`과 드롭 확률을 사용한다.
- `slowKillRewardBonusPctRange: [10, 15]`는 메타데이터로 보존하고 실제 지급률은 이번 범위에서 적용하지 않는다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 암석·금속·마그마 균열·주황색 핵의 사실적인 어두운 판타지 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 파쇄 거수 활성화와 런타임 배선

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
- Consumes: `UnexploredMonsterPool.releaseStage`, `activeMonsters`, `pickUnexploredMonster()`, `unexploredMonsterAtDifficulty()`
- Produces: 파쇄 거수의 활성 ID `bedrock_colossus | ironwall_crusher | crust_destroyer`
- Produces: `SPECIAL_IMAGE_PATHS.ironwall_crusher`, `SPECIAL_IMAGE_PATHS.crust_destroyer`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

풀 카탈로그는 모든 풀을 `expanded`로 기대하고 파쇄 거수 활성 ID를 다음과 같이 고정한다.

```ts
expect(UNEXPLORED_POOL_BY_ID.crushing_colossi.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.crushing_colossi.activeMonsters.map(({ id }) => id),
).toEqual(["bedrock_colossus", "ironwall_crusher", "crust_destroyer"]);
for (const pool of UNEXPLORED_MONSTER_POOLS) {
  expect(pool.expansionCandidates, pool.id).toEqual([]);
}
```

조우 테스트의 RNG `0`, `0.34`, `0.67`은 암반 거수·철벽 분쇄자·지각 파괴자를 순서대로 선택한다. 시뮬레이션 테스트는 다음 실제 전투 필드를 검사한다.

```ts
expect(byId.bedrock_colossus.monster.skill).toMatchObject({
  kind: "heavy_blow",
  everyPhases: 3,
  multiplier: 2,
});
expect(byId.ironwall_crusher.monster.skill).toMatchObject({
  kind: "pierce",
  armorPierce: 11,
});
expect(byId.crust_destroyer.monster.v2Skills?.equipped).toEqual([
  "mob_crushing_blow",
]);
expect(byId.crust_destroyer.monster.v2MaxMp).toBe(60);
```

런타임 카탈로그는 활성 특수 36종과 전체 41종을 기대한다. 두 확장 몬스터의 이미지 파일명을 검사한다. 세 몬스터 모두 집중 후 공격력이 `Math.round(base * 1.1)`이고 `playerDefVulnerable`이 0.08이어야 하며 기존 스킬과 MP는 보존되어야 한다.

모든 후보가 활성화되므로 안전장치는 `poolId: "frozen_legion"`, `monsterId: "ironwall_crusher"`처럼 선택 풀 밖의 ID를 거부하는지 검사한다. 서버 테스트는 파쇄 거수 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `ironwall_crusher`, `crust_destroyer`로 보존되는지 확인한다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_crushing_colossi_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 철벽 분쇄자·지각 파괴자가 활성 목록과 런타임에 없고 활성 개수가 36종에 미달해 FAIL

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 파쇄 거수 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
ironwall_crusher: "/images/monster/v2/unexplored-ironwall-crusher.webp",
crust_destroyer: "/images/monster/v2/unexplored-crust-destroyer.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 6개 파일, 103개 테스트 PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate crushing colossi monster roster"
```

### Task 2: 철벽 분쇄자와 지각 파괴자 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-ironwall-crusher.webp`
- Create: `public/images/monster/v2/unexplored-crust-destroyer.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 암반 거수를 스타일 참조로 철벽 분쇄자를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 압축되고 공격적인 철갑 골렘, 암회색 금속 판과 바위 관절, 주황색 핵, 한쪽 또는 양쪽 팔의 길게 돌출된 쐐기형 관통 장치, 낮게 전진하는 자세, 전신 표시, 암반 거수의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 암반 거수를 스타일 참조로 지각 파괴자를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 산맥처럼 넓고 거대한 현무암 골렘, 두꺼운 지각 판과 붉은 마그마 균열, 밝은 주황색 핵, 거대한 망치형 양팔, 내리찍기 직전의 무거운 자세, 전신 표시, 암반 거수의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

두 파일 모두 RGBA여야 하며 체크무늬가 실제 픽셀이면 built-in image generation의 `background-extraction` 편집으로 골렘을 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

Run: `node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-ironwall-crusher.webp','public/images/monster/v2/unexplored-crust-destroyer.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"`

Run: `npm run check-images`

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 쐐기형 철갑 관통 골렘과 마그마 균열의 초중량 강타 골렘이 암반 거수 및 서로와 구분되어야 한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-ironwall-crusher.webp public/images/monster/v2/unexplored-crust-destroyer.webp
git commit -m "feat: add crushing colossi variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify only: Task 1과 Task 2의 모든 변경 파일

- [x] **Step 1: 미개척지 관련 테스트를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

- [x] **Step 2: 타입과 변경 파일 린트를 검사한다**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

- [x] **Step 3: 이미지 검사와 전체 테스트를 실행한다**

Run: `npm run check-images`

Run: `npm test`

- [x] **Step 4: 미개척지 기능 플래그 production build를 실행한다**

Run: `V2_UNEXPLORED=true npm run build`

- [x] **Step 5: 작업 범위와 커밋을 확인한다**

Run: `git diff --check && git status --short --branch && git log -8 --oneline`

Expected: 파쇄 거수 작업 파일은 모두 커밋되고 설계·계획·구현·이미지 커밋이 확인됨. 다른 세션 변경이 있으면 그대로 보존됨.
