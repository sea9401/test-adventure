# Unexplored Shadow Stalkers Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그림자 척후병·밤의 암살자·허상 추적귀를 실제 미개척지 사냥에 균등 출현시키고 속도·회피·치명타·관통·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 그림자 추적자를 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과, 풀 공통 보상은 기존 공통 경로를 따른다. 전투는 이미 배선된 일반 속도 경로, `evasionPct`, `critPct`, 관통 스킬을 변경 없이 사용한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 여덟 특수 풀만 `expanded`; 맹독 군락 이후 4개 풀은 `launch` 상태를 유지한다.
- 그림자 추적자 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 자동 전투의 속도·회피·치명타·관통 필드를 사용하며 새 은신 규칙을 추가하지 않는다.
- 집중은 원래 속도 10% 증가와 회피 +10%p를 적용한다.
- 세 몬스터는 같은 `v2_unexplored_shadow_stalkers_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 검은 장비·짙은 보라색 천·보랏빛 에너지의 어두운 판타지 그림자 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 그림자 추적자 활성화와 런타임 배선

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
- Produces: 그림자 추적자의 활성 ID `shadow_scout | night_assassin | phantom_stalker`
- Produces: `SPECIAL_IMAGE_PATHS.night_assassin`, `SPECIAL_IMAGE_PATHS.phantom_stalker`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.shadow_stalkers.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.shadow_stalkers.activeMonsters.map(({ id }) => id),
).toEqual(["shadow_scout", "night_assassin", "phantom_stalker"]);

expect(pickShadowMonster(0)?.monsterId).toBe("shadow_scout");
expect(pickShadowMonster(0.34)?.monsterId).toBe("night_assassin");
expect(pickShadowMonster(0.67)?.monsterId).toBe("phantom_stalker");
```

시뮬레이션 테스트는 실제 생성 결과의 기존 엔진 필드를 검사한다.

```ts
expect(byId.shadow_scout.monster.evasionPct).toBe(35);
expect(byId.night_assassin.monster).toMatchObject({
  evasionPct: 45,
  critPct: 38,
});
expect(byId.phantom_stalker.monster.evasionPct).toBe(50);
expect(byId.phantom_stalker.monster.skill).toMatchObject({
  kind: "pierce",
  armorPierce: 11,
});
```

런타임 카탈로그는 활성 특수 몬스터 28종과 전체 33종을 기대한다. 밤의 암살자와 허상 추적귀의 이미지 파일명과 전투 필드를 검사한다. 집중 전후에는 속도가 `Math.round(base.spd * 1.1)`로 바뀌고 회피가 정확히 10%p 증가해야 한다. 밤의 암살자 치명타 38%와 허상 추적귀 고정 관통 11은 집중 후에도 유지되어야 한다.

서버 테스트는 그림자 추적자 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `night_assassin`, `phantom_stalker`로 보존되는지 확인한다. 미출시 거부 테스트는 `venom_colony/venom_sprayer`로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_shadow_stalkers_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 밤의 암살자·허상 추적귀가 활성 목록과 런타임에 없고 활성 개수가 28종에 미달해 FAIL

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 그림자 추적자 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
night_assassin: "/images/monster/v2/unexplored-night-assassin.webp",
phantom_stalker: "/images/monster/v2/unexplored-phantom-stalker.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate shadow stalkers monster roster"
```

### Task 2: 밤의 암살자와 허상 추적귀 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-night-assassin.webp`
- Create: `public/images/monster/v2/unexplored-phantom-stalker.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 그림자 척후병을 스타일 참조로 밤의 암살자를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 가벼운 검은 가죽·흑철 암살자 장비, 해진 짙은 보라색 천, 보랏빛 눈과 에너지, 길고 가는 보랏빛 쌍단검, 낮고 공격적인 인간형 자세, 전신 표시, 그림자 척후병의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 그림자 척후병을 스타일 참조로 허상 추적귀를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 다리가 땅에 닿지 않는 비인간형 망령, 검은 영체와 해진 짙은 보라색 천, 보랏빛 눈과 에너지, 길게 뻗은 관통용 팔날 또는 창날, 여러 갈래 그림자 잔상, 전신 표시, 그림자 척후병의 사실적인 어두운 판타지 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 출력한 두 절대 저장 경로를 메타데이터 검사에 사용한다. 두 파일 모두 RGBA여야 하며, 체크무늬가 실제 픽셀이면 built-in image generation의 배경 추출 편집으로 캐릭터를 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

```bash
node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-night-assassin.webp','public/images/monster/v2/unexplored-phantom-stalker.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"
npm run check-images
```

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 인간형 치명타 암살자와 비인간형 극고속 관통 망령 실루엣을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-night-assassin.webp public/images/monster/v2/unexplored-phantom-stalker.webp
git commit -m "feat: add shadow stalkers variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify: Tasks 1–2의 소스, 테스트, 이미지 자산

**Interfaces:**
- Consumes: 그림자 추적자 활성 카탈로그와 이미지
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

Expected: 그림자 추적자 작업 파일은 모두 커밋되고 설계·계획·구현·이미지 커밋이 확인됨. 다른 세션 변경이 있으면 그대로 보존됨.
