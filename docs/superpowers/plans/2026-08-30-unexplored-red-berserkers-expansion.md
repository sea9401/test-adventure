# Unexplored Red Berserkers Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 붉은 광전병·혈전 투사·붉은 처형자를 실제 미개척지 사냥에 균등 출현시키고 격노·치명타·강타·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 붉은 광전대를 `expanded`로 전환하면 조우·서버 사냥 준비·집중 효과·풀 공통 보상은 기존 공통 경로를 따른다. `enrage` 엔진 형식은 유지하되 시뮬레이션 어댑터가 생성 시점 런타임 공격력의 20%를 고정 `atkBonus`로 계산한다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 네 특수 풀만 `expanded`; 수정 포격대 이후 8개 풀은 `launch` 상태를 유지한다.
- 붉은 광전대 세 몬스터는 각각 1/3 확률로 출현한다.
- 기존 `enrage`, `critPct`, `heavy_blow`, 자동 전투 규칙을 사용하며 새 스킬 종류를 추가하지 않는다.
- 격노는 HP 40% 미만에서 한 번 발동하고 생성 시점 공격력의 20%를 더한다.
- 세 몬스터는 같은 `v2_unexplored_red_berserkers_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 검붉은 갑주·핏빛 균열·헤진 붉은 천의 어두운 판타지 전사 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 붉은 광전대 활성화와 유효한 격노 배선

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

**Interfaces:**
- Consumes: `UnexploredMonsterPool.releaseStage`, `activeMonsters`, `pickUnexploredMonster()`, `unexploredMonsterAtDifficulty()`
- Produces: 붉은 광전대의 활성 ID `red_berserker | blood_duelist | red_executioner`
- Produces: `SPECIAL_IMAGE_PATHS.blood_duelist`, `SPECIAL_IMAGE_PATHS.red_executioner`
- Produces: `enrage(monster)`의 `{ hpFraction: 0.4, atkBonus: round(monster.atk * 0.2) }`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

```ts
expect(UNEXPLORED_POOL_BY_ID.red_berserkers.releaseStage).toBe("expanded");
expect(
  UNEXPLORED_POOL_BY_ID.red_berserkers.activeMonsters.map(({ id }) => id),
).toEqual(["red_berserker", "blood_duelist", "red_executioner"]);

expect(pickRedMonster(0)?.monsterId).toBe("red_berserker");
expect(pickRedMonster(0.34)?.monsterId).toBe("blood_duelist");
expect(pickRedMonster(0.67)?.monsterId).toBe("red_executioner");
```

시뮬레이션과 런타임 테스트는 붉은 광전병의 `skill`이 다음 의미를 갖는지 실제 생성된 공격력에서 독립적으로 계산해 검사한다.

```ts
expect(redBerserker.monster.skill).toMatchObject({
  kind: "enrage",
  hpFraction: 0.4,
  atkBonus: Math.round(redBerserker.monster.atk * 0.2),
});
```

혈전 투사는 `critPct: 38`, 붉은 처형자는 `{ kind: "heavy_blow", everyPhases: 3, multiplier: 2 }`여야 한다. 집중 상태에서 두 확장 몬스터의 공격력이 증가하고 치명타는 각각 48%와 10%여야 한다.

런타임 카탈로그는 활성 특수 몬스터 20종과 전체 25종을 기대한다. 서버 테스트는 붉은 광전대 풀 선택 후 몬스터 RNG `0.34`, `0.67`이 각각 `blood_duelist`, `red_executioner`로 보존되는지 확인한다. 미출시 거부 테스트는 `crystal_artillery/refraction_artillery`로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 다음 규칙을 기대한다.

```ts
{
  id: "v2_unexplored_red_berserkers_material",
  tag: "special",
  chance: 0.01,
  amount: 1,
}
```

- [x] **Step 2: 관련 테스트를 실행해 출시 단계와 격노 수치 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: 혈전 투사·붉은 처형자가 활성 목록과 런타임에 없고 붉은 광전병의 `atkBonus`가 20%보다 작은 기존 값 12라 FAIL

- [x] **Step 3: 출시 단계·격노 계산·이미지 경로를 최소 변경한다**

`src/adventure/data/v2/unexploredMonsterPools.ts`의 붉은 광전대 seed에 다음 값을 추가한다.

```ts
releaseStage: "expanded",
```

`src/adventure/data/v2/unexploredSimulationMonsters.ts`의 `enrage()`를 다음처럼 바꾼다.

```ts
function enrage(monster: Monster): Monster {
  return {
    ...monster,
    skill: {
      kind: "enrage",
      name: "저체력 격노",
      hpFraction: 0.4,
      atkBonus: Math.max(1, Math.round(monster.atk * 0.2)),
    },
  };
}
```

`src/adventure/data/v2/unexploredMonsters.ts`의 `SPECIAL_IMAGE_PATHS`에 다음 값을 추가한다.

```ts
blood_duelist: "/images/monster/v2/unexplored-blood-duelist.webp",
red_executioner: "/images/monster/v2/unexplored-red-executioner.webp",
```

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 5: 변경을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: activate red berserkers monster roster"
```

### Task 2: 혈전 투사와 붉은 처형자 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-blood-duelist.webp`
- Create: `public/images/monster/v2/unexplored-red-executioner.webp`

**Interfaces:**
- Consumes: Task 1의 `SPECIAL_IMAGE_PATHS`
- Produces: 512×512, 4채널, 실제 알파 포함 WebP 두 장

- [x] **Step 1: 기존 붉은 광전병을 스타일 참조로 혈전 투사를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 검붉은 금속 경갑과 핏빛 균열, 헤진 붉은 천, 날렵하게 전진하는 인간형 쌍검 투사, 서로 다른 높이로 든 두 검과 전신 표시, 붉은 광전병의 재질·색·렌더 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 2: 기존 붉은 광전병을 스타일 참조로 붉은 처형자를 생성한다**

Built-in image generation prompt: 정사각형 게임 몬스터 렌더, 실제 투명 배경, 검붉은 두꺼운 중갑과 핏빛 균열, 헤진 붉은 천, 넓고 육중한 인간형 처형자, 거대한 양손 처형 도끼와 전신 표시, 붉은 광전병의 재질·색·렌더 스타일 유지, 텍스트·로고·워터마크·배경 장면 없음.

- [x] **Step 3: 생성 PNG의 실제 알파 채널을 검사하고 필요하면 배경 추출 편집을 수행한다**

Built-in image generation이 각 호출 뒤 출력한 두 절대 저장 경로를 인자로 `file` 명령을 실행한다.

Expected: 두 파일 모두 `RGBA`. `RGB`이거나 체크무늬가 픽셀로 포함되면 built-in image generation의 `background-extraction` 편집으로 캐릭터를 보존한 채 실제 투명 알파를 만든다.

- [x] **Step 4: 프로젝트 경로로 복사하고 WebP로 최적화한다**

Run: `npm run optimize-images`

Expected: 두 PNG가 제거되고 지정된 WebP 두 장이 생성됨

- [x] **Step 5: 크기·알파·참조·육안을 검증한다**

```bash
node -e "const sharp=require('sharp'); Promise.all(['public/images/monster/v2/unexplored-blood-duelist.webp','public/images/monster/v2/unexplored-red-executioner.webp'].map(async p=>[p,await sharp(p).metadata()])).then(x=>console.log(JSON.stringify(x,null,2)))"
npm run check-images
```

Expected: 각 이미지 `width: 512`, `height: 512`, `channels: 4`, `hasAlpha: true`; 누락 참조 없음. 두 파일을 열어 역할별 실루엣과 투명 배경을 확인한다.

- [x] **Step 6: 이미지 자산을 커밋한다**

```bash
git add public/images/monster/v2/unexplored-blood-duelist.webp public/images/monster/v2/unexplored-red-executioner.webp
git commit -m "feat: add red berserkers variant artwork"
```

### Task 3: 전체 검증과 완료 정리

**Files:**
- Verify: Tasks 1–2의 소스, 테스트, 이미지 자산

**Interfaces:**
- Consumes: 붉은 광전대 활성 카탈로그와 이미지
- Produces: 현재 브랜치의 로컬 검증 증거

- [x] **Step 1: 미개척지 관련 테스트를 실행한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: PASS

- [x] **Step 2: 타입과 변경 파일 린트를 검사한다**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

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
