# Unexplored Venom Colony Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 독니 포식자·맹독 살포체·부식 군체를 실제 미개척지 사냥에 균등 출현시키고 중독·생명력 약화·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 맹독 군락을 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과, 풀 공통 보상은 기존 공통 경로를 따른다. 전투는 이미 배선된 `mob_venom_bite`, `mob_catastrophe_venom`, `mob_venom_sunder`를 변경 없이 사용한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 아홉 특수 풀만 `expanded`; 혈흔 망자 이후 3개 풀은 `launch` 상태를 유지한다.
- 맹독 군락 세 몬스터는 각각 1/3 확률로 출현한다.
- 새 중독 규칙을 만들거나 기존 독 스킬 수치를 변경하지 않는다.
- 집중은 독니 포식자의 `독니`만 `재앙독`으로 교체하고 두 확장 몬스터의 고급 스킬을 유지한다.
- 세 몬스터는 같은 `v2_unexplored_venom_colony_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 어두운 외피·황록색 독낭·형광 녹색 독액의 사실적인 어두운 판타지 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 맹독 군락 활성화와 런타임 배선

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
- Produces: 맹독 군락의 활성 ID `venom_fang_devourer | venom_sprayer | corrosive_colony`
- Produces: `SPECIAL_IMAGE_PATHS.venom_sprayer`, `SPECIAL_IMAGE_PATHS.corrosive_colony`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.venom_colony.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.venom_colony.activeMonsters.map(({ id }) => id),
).toEqual(["venom_fang_devourer", "venom_sprayer", "corrosive_colony"]);

expect(pickVenomMonster(0)?.monsterId).toBe("venom_fang_devourer");
expect(pickVenomMonster(0.34)?.monsterId).toBe("venom_sprayer");
expect(pickVenomMonster(0.67)?.monsterId).toBe("corrosive_colony");
```

시뮬레이션 테스트는 세 몬스터의 장착 스킬을 정확히 검사한다.

```ts
expect(byId.venom_fang_devourer.monster.v2Skills?.equipped).toEqual([
  "mob_venom_bite",
]);
expect(byId.venom_sprayer.monster.v2Skills?.equipped).toEqual([
  "mob_catastrophe_venom",
]);
expect(byId.corrosive_colony.monster.v2Skills?.equipped).toEqual([
  "mob_venom_sunder",
]);
```

런타임 카탈로그는 활성 특수 몬스터 30종과 전체 35종을 기대한다. 독니 포식자의 집중 전후 스킬은 각각 `mob_venom_bite`, `mob_catastrophe_venom`이어야 한다. 맹독 살포체와 부식 군체의 집중 전후 스킬은 각각 `mob_catastrophe_venom`, `mob_venom_sunder`로 유지하고 두 신규 이미지 파일명을 검사한다.

서버 테스트는 맹독 군락 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `venom_sprayer`, `corrosive_colony`로 보존되는지 확인한다. 미출시 거부 테스트는 `bloodstained_dead/bloodtrail_pursuer`로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_venom_colony_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 맹독 살포체·부식 군체가 활성 목록과 런타임에 없고 활성 개수가 30종에 미달해 FAIL

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 맹독 군락 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
venom_sprayer: "/images/monster/v2/unexplored-venom-sprayer.webp",
corrosive_colony: "/images/monster/v2/unexplored-corrosive-colony.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate venom colony monster roster"
```

### Task 2: 맹독 살포체와 부식 군체 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-venom-sprayer.webp`
- Create: `public/images/monster/v2/unexplored-corrosive-colony.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 독니 포식자를 스타일 참조로 맹독 살포체를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 날렵한 슬라임 생물, 어두운 올리브색과 검은 반투명 외피, 부풀어 오른 여러 황록색 독낭, 독을 뿜는 관 또는 주둥이, 형광 녹색 독액이 분사되는 빠른 공격 자세, 전신 표시, 독니 포식자의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 독니 포식자를 스타일 참조로 부식 군체를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 여러 슬라임 개체가 융합된 넓고 무거운 군체, 어두운 올리브색과 검은 외피, 단단하게 굳은 부식성 갑각, 다수의 황록색 독낭, 흘러내리는 형광 녹색 산성 독액, 느리고 위압적인 자세, 전신 표시, 독니 포식자의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 출력한 두 절대 저장 경로를 메타데이터 검사에 사용한다. 두 파일 모두 RGBA여야 하며, 체크무늬가 실제 픽셀이면 built-in image generation의 배경 추출 편집으로 생물을 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

Run: `node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-venom-sprayer.webp','public/images/monster/v2/unexplored-corrosive-colony.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"`

Run: `npm run check-images`

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 날렵한 살포형 슬라임과 넓고 무거운 부식 군체의 실루엣을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-venom-sprayer.webp public/images/monster/v2/unexplored-corrosive-colony.webp
git commit -m "feat: add venom colony variant artwork"
```

### Task 3: 전체 검증과 완료 정리

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

Expected: 맹독 군락 작업 파일은 모두 커밋되고 설계·계획·구현·이미지 커밋이 확인됨. 다른 세션 변경이 있으면 그대로 보존됨.
