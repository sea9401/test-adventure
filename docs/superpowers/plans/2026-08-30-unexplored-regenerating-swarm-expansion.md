# Unexplored Regenerating Swarm Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재생 포자체·포식 재생체·증식 핵체를 실제 미개척지 사냥에 균등 출현시키고 기존 회복 능력·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 재생 군체를 `expanded`로 전환하면 조우·서버 사냥 준비·집중 효과·풀 공통 보상은 기존 공통 경로를 따르며, 런타임 이미지 맵에 새 몬스터 두 종만 추가한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 철갑 군단·마력 방벽체·재생 군체만 `expanded`; 나머지 9개 풀은 `launch` 상태를 유지한다.
- 재생 군체 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 `v2_skill_recover`, 시뮬레이션 수치, MP 소모, 자동 전투 규칙을 변경하지 않는다.
- 세 몬스터는 같은 `v2_unexplored_regenerating_swarm_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 붉은 균모·목질 조직·녹색 재생액의 어두운 판타지 생물 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 재생 군체 활성화와 런타임 배선

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

**Interfaces:**
- Consumes: `UnexploredMonsterPool.releaseStage`, `activeMonsters`, `pickUnexploredMonster()`, `unexploredMonsterAtDifficulty()`
- Produces: 재생 군체의 활성 ID `regenerating_spore | devouring_regenerator | proliferating_core`
- Produces: `SPECIAL_IMAGE_PATHS.devouring_regenerator`, `SPECIAL_IMAGE_PATHS.proliferating_core`

- [x] **Step 1: 풀·조우·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.regenerating_swarm.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.regenerating_swarm.activeMonsters.map(({ id }) => id),
).toEqual([
  "regenerating_spore",
  "devouring_regenerator",
  "proliferating_core",
]);

expect(pickRegeneratingMonster(0)?.monsterId).toBe("regenerating_spore");
expect(pickRegeneratingMonster(0.34)?.monsterId).toBe("devouring_regenerator");
expect(pickRegeneratingMonster(0.67)?.monsterId).toBe("proliferating_core");
```

런타임 테스트는 활성 특수 몬스터 18종과 전체 23종을 기대한다. `devouring_regenerator`와 `proliferating_core`는 모두 `v2_skill_recover`를 장착하며 최대 MP는 각각 16과 32여야 한다. 집중 상태에서는 두 몬스터의 체력이 증가하고 최대 MP가 각각 32와 64여야 한다.

서버 테스트는 재생 군체 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `devouring_regenerator`, `proliferating_core`로 보존되는지 확인한다. 기존 미출시 거부 테스트는 `red_berserkers/blood_duelist`로 대상을 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_regenerating_swarm_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 재생 군체가 launch 상태라 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 포식 재생체·증식 핵체가 활성 목록과 런타임에 없거나 `not active` 오류가 발생해 FAIL

- [x] **Step 3: 재생 군체 출시 단계와 이미지 경로를 추가한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 재생 군체 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
devouring_regenerator:
  "/images/monster/v2/unexplored-devouring-regenerator.webp",
proliferating_core:
  "/images/monster/v2/unexplored-proliferating-core.webp",
```

공통 `activeMonsters` 조우와 몬스터 ID 런타임 경로가 나머지 동작을 처리하므로 새 조건 분기는 만들지 않는다.

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate regenerating swarm monster roster"
```

### Task 2: 포식 재생체와 증식 핵체 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-devouring-regenerator.webp`
- Create: `public/images/monster/v2/unexplored-proliferating-core.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 알파 포함 WebP 두 장

- [x] **Step 1: 기존 재생 포자체를 스타일 참조로 포식 재생체를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 붉은 균모와 녹색 재생액이 흐르는 목질·육질 조직, 앞으로 기운 날렵한 네발 포식자 체형, 크게 벌어진 이빨 달린 입과 갈고리 발톱, 전신 표시, 재생 포자체의 재질·색·렌더 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 재생 포자체를 스타일 참조로 증식 핵체를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 붉은 균모와 녹색 재생액이 흐르는 목질·육질 조직, 땅에 뿌리내린 육중한 중심핵, 여러 포자 주머니와 싹트는 작은 균체, 전신 표시, 재생 포자체의 재질·색·렌더 스타일 유지, 얼굴·무기·텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 각 호출 뒤 출력한 두 절대 저장 경로를 인자로 `file` 명령을 실행한다.

Expected: 두 파일 모두 `RGBA`. `RGB`이거나 체크무늬가 픽셀로 포함되면 built-in image generation의 `background-extraction` 편집으로 캐릭터를 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

```bash
node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-devouring-regenerator.webp','public/images/monster/v2/unexplored-proliferating-core.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"
npm run check-images
```

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 역할별 실루엣과 투명 배경을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-devouring-regenerator.webp public/images/monster/v2/unexplored-proliferating-core.webp
git commit -m "feat: add regenerating swarm variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify: Tasks 1–2의 소스, 테스트, 이미지 자산

**Interfaces:**
- Consumes: 재생 군체 활성 카탈로그와 이미지
- Produces: 현재 브랜치의 로컬 검증 증거

- [x] **Step 1: 미개척지 관련 테스트를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 2: 타입과 변경 파일 린트를 검사한다**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 두 명령 모두 exit 0

- [x] **Step 3: 이미지 검사와 전체 테스트를 실행한다**

Run: `npm run check-images`

Run: `npm test`

Expected: 누락 이미지 없음, 전체 테스트 PASS

- [x] **Step 4: 미개척지 기능 플래그 production build를 실행한다**

Run: `V2_UNEXPLORED=true npm run build`

Expected: prebuild 이미지 검사와 Next production build PASS

- [x] **Step 5: 작업 트리와 커밋을 확인한다**

Run: `git diff --check && git status --short --branch && git log -6 --oneline`

Expected: 작업 트리 clean, 설계·계획·구현·이미지 커밋 확인
