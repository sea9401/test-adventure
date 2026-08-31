# Unexplored Iron Legion Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 철갑 군단의 방패병·창병·파쇄병을 실제 미개척지 사냥에 균등 출현시키고 각 전투 능력과 이미지를 연결한다.

**Architecture:** 풀 카탈로그가 출시 단계를 소유하고 여기서 `activeMonsters`와 남은 `expansionCandidates`를 파생한다. 조우 선택기는 활성 목록에서 ID를 고르고, 서버 사냥 준비가 그 ID를 런타임 생성기에 전달하며, 런타임은 활성 여부·시뮬레이션 프록시·몬스터별 이미지 경로를 검증한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 철갑 군단만 `expanded`; 다른 11개 풀은 `launch` 상태를 유지한다.
- 철갑 군단 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 시뮬레이션 수치와 능력을 변경하지 않는다.
- 세 몬스터는 같은 철갑 군단 재료와 드롭 확률을 사용한다.
- 신규 이미지는 정사각형 투명 배경의 다크 판타지 렌더이며 텍스트·로고·워터마크를 넣지 않는다.
- 배포, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 풀별 출시 상태와 조우 선택

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`

**Interfaces:**
- Produces: `UnexploredMonsterPool.releaseStage: "launch" | "expanded"`
- Produces: `UnexploredMonsterPool.activeMonsters: readonly UnexploredMonsterDefinition[]`
- Produces: `UnexploredMonsterPool.expansionCandidates: readonly UnexploredMonsterDefinition[]`
- Consumes: `pickUnexploredMonster()`가 `activeMonsters`의 ID를 균등 선택

- [x] **Step 1: 출시 상태와 조우 구간 회귀 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.iron_legion.activeMonsters.map(({ id }) => id)).toEqual([
  "armored_shieldman", "armored_spearman", "armored_crusher",
]);
expect(UNEXPLORED_POOL_BY_ID.mana_barrier.activeMonsters).toHaveLength(1);

expect(pickIronMonster(0)?.monsterId).toBe("armored_shieldman");
expect(pickIronMonster(0.34)?.monsterId).toBe("armored_spearman");
expect(pickIronMonster(0.67)?.monsterId).toBe("armored_crusher");
```

- [x] **Step 2: 관련 테스트를 실행해 기존 launch 전용 구현에서 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: `activeMonsters`가 없거나 창병·파쇄병이 선택되지 않아 FAIL

- [x] **Step 3: `definePool`에서 출시 목록을 파생하고 철갑 군단만 확장한다**

```ts
export type UnexploredReleaseStage = "launch" | "expanded";

function definePool(pool: UnexploredMonsterPoolSeed) {
  const releaseStage = pool.releaseStage ?? "launch";
  return {
    ...pool,
    releaseStage,
    launchMonster: pool.monsters[0],
    activeMonsters: releaseStage === "expanded" ? pool.monsters : [pool.monsters[0]],
    expansionCandidates: releaseStage === "expanded" ? [] : [pool.monsters[1], pool.monsters[2]],
  };
}
```

철갑 군단 seed에 `releaseStage: "expanded"`를 추가하고 `pickUnexploredMonster()`는 `activeMonsters.map(({ id }) => id)`를 사용한다.

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.ts src/adventure/data/v2/unexploredEncounters.test.ts
git commit -m "feat: activate iron legion monster roster"
```

### Task 2: 선택 몬스터 런타임과 전투 능력 배선

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/lib/server/unexploredHunt.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

**Interfaces:**
- Consumes: `UnexploredMonsterPool.activeMonsters`
- Produces: `unexploredActiveSpecialMonstersAtDifficulty(difficulty, focusedPoolIds)`
- Changes: `unexploredMonsterAtDifficulty({ source: "special", poolId, monsterId, ... })`가 선택 ID를 보존하고 활성 여부를 검증

- [x] **Step 1: 런타임 수, 능력, 이미지 경로, 미출시 거부 테스트를 작성한다**

```ts
const special = unexploredActiveSpecialMonstersAtDifficulty(100, []);
expect(special).toHaveLength(14);
expect(byId.armored_spearman.monster.skill).toMatchObject({ kind: "pierce", armorPierce: 11 });
expect(byId.armored_crusher.monster.skill).toMatchObject({ kind: "heavy_blow", everyPhases: 3, multiplier: 2 });
expect(byId.armored_spearman.imageFileName).toBe("unexplored-armored-spearman.webp");
expect(() => unexploredMonsterAtDifficulty({ source: "special", poolId: "mana_barrier", monsterId: "rune_executor", focused: false, difficulty: 100 })).toThrow(/not active/i);
```

서버 테스트에는 특수 풀 선택 후 두 번째 RNG가 0.34일 때 `armored_spearman`, 0.67일 때 `armored_crusher`가 끝까지 보존되는 사례를 추가한다.

- [x] **Step 2: 관련 테스트를 실행해 선택 ID가 무시되는 기존 동작에서 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsters.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 활성 런타임 함수 부재 또는 선택 ID 불일치로 FAIL

- [x] **Step 3: 몬스터 ID 기반 런타임과 서버 전달을 구현한다**

```ts
const SPECIAL_IMAGE_PATHS: Record<string, string> = {
  armored_shieldman: "/images/monster/v2/unexplored-armored-shieldman.webp",
  armored_spearman: "/images/monster/v2/unexplored-armored-spearman.webp",
  armored_crusher: "/images/monster/v2/unexplored-armored-crusher.webp",
  barrier_guardian: "/images/monster/v2/unexplored-barrier-guardian.webp",
  regenerating_spore: "/images/monster/v2/unexplored-regenerating-spore.webp",
  red_berserker: "/images/monster/v2/unexplored-red-berserker.webp",
  crystal_mage: "/images/monster/v2/unexplored-crystal-mage.webp",
  precision_scout: "/images/monster/v2/unexplored-precision-scout.webp",
  rushing_machine: "/images/monster/v2/unexplored-rushing-machine.webp",
  shadow_scout: "/images/monster/v2/unexplored-shadow-scout.webp",
  venom_fang_devourer: "/images/monster/v2/unexplored-venom-fang-devourer.webp",
  hooked_dead: "/images/monster/v2/unexplored-hooked-dead.webp",
  frost_toucher: "/images/monster/v2/unexplored-frost-toucher.webp",
  bedrock_colossus: "/images/monster/v2/unexplored-bedrock-colossus.webp",
};
```

특수 런타임은 `monsterId ?? pool.launchMonster.id`를 고른 뒤 `pool.activeMonsters` 소속을 확인하고 같은 ID의 mechanics 프록시와 이미지 경로를 사용한다. `prepareUnexploredHunt()`는 `monsterId: pick.monsterId`를 전달한다. 활성 목록 집계 함수는 모든 풀의 `activeMonsters`를 순회한다.

- [x] **Step 4: 런타임·서버·보상 회귀 테스트를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsters.test.ts src/lib/server/unexploredHunt.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts`

Expected: PASS, 세 철갑 몬스터가 같은 `v2_unexplored_iron_legion_material` 규칙 사용

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/lib/server/unexploredHunt.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: route iron legion variants into hunts"
```

### Task 3: 철갑 창병과 파쇄병 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-armored-spearman.webp`
- Create: `public/images/monster/v2/unexplored-armored-crusher.webp`

**Interfaces:**
- Consumes: Task 2의 `SPECIAL_IMAGE_PATHS`
- Produces: 프로젝트 이미지 검사에서 확인 가능한 두 WebP 자산

- [x] **Step 1: 기존 방패병을 스타일 참조로 철갑 창병 이미지를 생성한다**

Built-in image generation prompt 핵심: 정사각형 투명 배경, 전신 철갑 창병, 장창, 방패병보다 가벼운 실루엣, 검붉은 천과 용암빛 틈, 다크 판타지 게임 몬스터 렌더, 텍스트·로고·워터마크 없음.

- [x] **Step 2: 기존 방패병을 스타일 참조로 철갑 파쇄병 이미지를 생성한다**

Built-in image generation prompt 핵심: 정사각형 투명 배경, 전신 중장갑 파쇄병, 양손 대형 철퇴/망치, 넓고 무거운 실루엣, 검붉은 천과 용암빛 틈, 다크 판타지 게임 몬스터 렌더, 텍스트·로고·워터마크 없음.

- [x] **Step 3: 생성 결과를 프로젝트에 복사하고 최적화한다**

Run: `npm run optimize-images`

Expected: 두 최종 파일이 지정된 `.webp` 경로에 존재하고 원본 PNG는 제거됨

- [x] **Step 4: 두 이미지를 육안 및 참조 검사로 검증한다**

Run: `npm run check-images`

Expected: 누락 참조 없음. 두 파일을 열어 투명 배경, 전신 구도, 무기와 실루엣 구분을 확인.

- [x] **Step 5: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-armored-spearman.webp public/images/monster/v2/unexplored-armored-crusher.webp
git commit -m "feat: add iron legion variant artwork"
```

### Task 4: 전체 검증과 완료 정리

**Files:**
- Modify only if verification exposes a regression in the files listed above.

**Interfaces:**
- Consumes: Tasks 1–3의 카탈로그, 조우, 런타임, 자산
- Produces: 배포 전 로컬 검증 증거

- [x] **Step 1: 관련 테스트 전체를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 2: 타입과 변경 파일 린트를 검사한다**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/lib/server/unexploredHunt.ts src/lib/server/unexploredHunt.test.ts`

Expected: 두 명령 모두 exit 0

- [x] **Step 3: 이미지 검사와 전체 테스트를 실행한다**

Run: `npm run check-images`

Run: `npm test`

Expected: 누락 이미지 없음, 전체 테스트 PASS

- [x] **Step 4: 확장 기능 플래그 빌드를 실행한다**

Run: `V2_UNEXPLORED=true npm run build`

Expected: production build PASS

- [x] **Step 5: 작업 트리와 커밋을 확인한다**

Run: `git status --short && git log -5 --oneline`

Expected: 작업 트리 clean, 설계·계획·구현·이미지 커밋 확인
