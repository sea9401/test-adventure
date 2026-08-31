# Unexplored Runaway Machines Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질주 기계·연격 자동인형·과열 집행기를 실제 미개척지 사냥에 균등 출현시키고 속도·추가 공격·저체력 격노·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 폭주 기계를 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과, 풀 공통 보상은 기존 공통 경로를 따른다. 전투는 이미 배선된 일반 속도 경로, `bonusAttackChancePct`, 저체력 `enrage`를 변경 없이 사용한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 일곱 특수 풀만 `expanded`; 그림자 추적자 이후 5개 풀은 `launch` 상태를 유지한다.
- 폭주 기계 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 자동 전투의 속도·추가 공격·저체력 격노 필드를 사용하며 새 연격 규칙을 추가하지 않는다.
- 집중은 원래 속도 10% 증가와 추가 공격 확률 +15%p를 적용한다.
- 세 몬스터는 같은 `v2_unexplored_runaway_machines_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 검게 그을린 금속과 주황색 용융 동력선의 어두운 판타지 기계 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 폭주 기계 활성화와 런타임 배선

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
- Produces: 폭주 기계의 활성 ID `rushing_machine | combo_automaton | overheated_enforcer`
- Produces: `SPECIAL_IMAGE_PATHS.combo_automaton`, `SPECIAL_IMAGE_PATHS.overheated_enforcer`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.runaway_machines.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.runaway_machines.activeMonsters.map(({ id }) => id),
).toEqual(["rushing_machine", "combo_automaton", "overheated_enforcer"]);

expect(pickRunawayMonster(0)?.monsterId).toBe("rushing_machine");
expect(pickRunawayMonster(0.34)?.monsterId).toBe("combo_automaton");
expect(pickRunawayMonster(0.67)?.monsterId).toBe("overheated_enforcer");
```

시뮬레이션 테스트는 실제 생성 결과의 기존 엔진 필드를 검사한다.

```ts
expect(byId.rushing_machine.monster.bonusAttackChancePct).toBeUndefined();
expect(byId.combo_automaton.monster.bonusAttackChancePct).toBe(50);
expect(byId.overheated_enforcer.monster.bonusAttackChancePct).toBe(50);
expect(byId.overheated_enforcer.monster.skill).toMatchObject({
  kind: "enrage",
  hpFraction: 0.4,
  atkBonus: Math.round(byId.overheated_enforcer.monster.atk * 0.2),
});
```

런타임 카탈로그는 활성 특수 몬스터 26종과 전체 31종을 기대한다. 연격 자동인형과 과열 집행기의 이미지 파일명과 전투 필드를 검사한다. 집중 전후에는 속도가 `Math.round(base.spd * 1.1)`로 바뀌고 추가 공격 확률이 50%에서 65%로 증가해야 한다. 과열 집행기의 저체력 격노 필드는 집중 후에도 유지되어야 한다.

서버 테스트는 폭주 기계 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `combo_automaton`, `overheated_enforcer`로 보존되는지 확인한다. 미출시 거부 테스트는 `shadow_stalkers/night_assassin`으로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_runaway_machines_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 연격 자동인형·과열 집행기가 활성 목록과 런타임에 없고 활성 개수가 26종에 미달해 FAIL

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 폭주 기계 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
combo_automaton: "/images/monster/v2/unexplored-combo-automaton.webp",
overheated_enforcer: "/images/monster/v2/unexplored-overheated-enforcer.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate runaway machines monster roster"
```

### Task 2: 연격 자동인형과 과열 집행기 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-combo-automaton.webp`
- Create: `public/images/monster/v2/unexplored-overheated-enforcer.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 질주 기계를 스타일 참조로 연격 자동인형을 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 가볍고 민첩한 인간형 자동인형, 검게 그을린 다층 금속 장갑, 주황색 용융 동력선, 여러 개의 짧은 칼날 팔 또는 쌍날 구조, 빠른 연속 타격 자세, 전신 표시, 질주 기계의 사실적인 어두운 판타지 기계 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 질주 기계를 스타일 참조로 과열 집행기를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 넓고 무거운 인간형 집행 기계, 검게 그을리고 균열 난 두꺼운 금속 장갑, 밝은 주황색 용융 노심과 분사 화염, 크고 무거운 처형용 도끼, 격노한 전투 자세, 전신 표시, 질주 기계의 사실적인 어두운 판타지 기계 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 출력한 두 절대 저장 경로를 `file`과 이미지 메타데이터 검사에 사용한다. 두 파일 모두 RGBA여야 하며, 체크무늬가 실제 픽셀이면 built-in image generation의 배경 추출 편집으로 기계를 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

```bash
node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-combo-automaton.webp','public/images/monster/v2/unexplored-overheated-enforcer.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"
npm run check-images
```

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 민첩한 연격형과 중장 과열형 실루엣을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-combo-automaton.webp public/images/monster/v2/unexplored-overheated-enforcer.webp
git commit -m "feat: add runaway machines variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify: Tasks 1–2의 소스, 테스트, 이미지 자산

**Interfaces:**
- Consumes: 폭주 기계 활성 카탈로그와 이미지
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

Expected: 폭주 기계 작업 파일은 모두 커밋되고 설계·계획·구현·이미지 커밋이 확인됨. 다른 세션 변경이 있으면 그대로 보존됨.
