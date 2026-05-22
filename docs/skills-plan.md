# 스킬 확장 계획

> 상태: ✅ **구현 완료** — 스킬 확장 출고. 이 문서는 설계 기록.

## 배경

현재 보유 스킬은 **강공격** 1종.

```ts
// src/adventure/character/skills.ts
export function deriveSkills(stats): Skill[] {
  if (stats.str >= 10) out.push({ name: "강공격", description: "..." });
  return out;
}
```

특징:
- **별도 저장 없음** — 스탯에서 매 렌더 파생 (`deriveSkills(stats)`).
- **스탯 임계로만 보유 판정** — 훈련/장비로 스탯 올리면 자동 획득. 알림은 `page.tsx` 의 `lastSeenSkillsRef` 차이 비교로 발화.
- **전투 효과는 PlayerCombat 필드로 전달** — 엔진이 스킬 이름이 아닌 보너스 수치만 본다.
  - 예: `powerAttackBonus: number` 가 `> 0` 이면 발동, 아니면 무효.
- **트리거는 엔진 안에서** — 턴 번호 / 첫 공격 여부 등 상태 기반 자동 발동. 사용자 액션 X.

전투 엔진 흐름:
1. `engine.ts` 의 `stepBattle` 이 player phase / enemy phase 를 번갈아 처리.
2. player phase: 첫 공격 + 강공격 보너스 → damage 계산.
3. enemy phase: 회피(`evasionPct`) 판정 → damage 받음.

## 목표

다양한 스탯 빌드의 의미를 만들기 위해 4가지 신규 스킬을 추가.
모두 **기존 패턴(passive · 자동 트리거 · 스탯 임계)** 따른다 — MP 소모/액티브는 후속.

---

## 신규 스킬 4종

### 1. 회피 (DEX 기반 강화)
- **이름**: 회피 강화
- **임계**: DEX ≥ 10
- **효과**: 전투당 첫 1회 피격을 무조건 무효 (성공 시 "[회피 강화] ..." 로그)
- **이유**: DEX 는 이미 `evasionPct` 로 % 회피에 영향. 임계 시 보장 1회로 빌드 보강.
- **엔진 데이터**: `PlayerCombat.guaranteedEvades: number` (전투 시작 시 예약된 회피 횟수). state 에 `evadesRemaining` 으로 복사 후 enemy phase 에서 우선 소모.

### 2. 연타 (SPD 기반)
- **이름**: 연타
- **임계**: SPD ≥ 15
- **효과**: 5턴마다 그 턴의 마지막 공격 후 추가 1회 공격
- **이유**: SPD 는 이미 10pt 당 attackCount +1. 더 높은 임계에서 추가 보강.
- **엔진 데이터**: `PlayerCombat.extraAttackEveryNTurns?: number`. 매 턴 종료 시 `(turn % N === 0)` 이면 `playerAttacksLeft += 1` 한 후 phase 를 player 로 유지.
- **로그**: "[연타] 한 번 더!" 후 일반 공격 수행.

### 3. 행운의 일격 (LUK 기반)
- **이름**: 크리티컬
- **임계**: LUK ≥ 10
- **효과**: 매 공격마다 5% 확률로 데미지 ×2
- **이유**: LUK 는 현재 영향력 거의 없음. 이 스킬이 LUK 빌드의 핵심이 됨.
- **엔진 데이터**: `PlayerCombat.critChancePct?: number` (예: 5). 공격마다 `Math.random()*100 < critChancePct` 면 `dmg *= 2`. 강공격 보너스와 누적 가능 (스택).
- **로그**: "[크리티컬!] {적}에게 {dmg} 피해를 입혔다."
- **스택 명세**: 강공격 + 크리티컬이 같이 터지면 `(atk + powerAttackBonus) → damage → ×2`.

### 4. 방벽 (VIT 기반 추가)
- **이름**: 초반 방벽
- **임계**: VIT ≥ 10
- **효과**: 전투 시작 후 첫 3턴 동안 받는 피해 -1 (최소 0)
- **이유**: VIT 는 이미 +1 maxHp / +2 def 영향. 초반 안정성 보강용.
- **엔진 데이터**: `PlayerCombat.earlyMitigationTurns?: number` (3) + `earlyMitigationAmount?: number` (1). enemy phase 에서 `state.completedPlayerTurns < N` 이면 `dmg = max(0, dmg - amount)`.
- **로그**: "[방벽] 피해 -1" (피해가 줄었을 때만).

---

## 작업 분해

### Phase A — 데이터 / 도출
**파일: `src/adventure/character/skills.ts`**

- 임계 상수 추가:
  ```ts
  export const EVADE_DEX_THRESHOLD = 10;
  export const EVADE_GUARANTEED = 1;
  export const DOUBLE_STRIKE_SPD_THRESHOLD = 15;
  export const DOUBLE_STRIKE_INTERVAL = 5;
  export const CRIT_LUK_THRESHOLD = 10;
  export const CRIT_CHANCE_PCT = 5;
  export const CRIT_MULT = 2;
  export const EARLY_MITIGATION_VIT_THRESHOLD = 10;
  export const EARLY_MITIGATION_TURNS = 3;
  export const EARLY_MITIGATION_AMOUNT = 1;
  ```
- `deriveSkills` 에 4개 분기 추가.
- 각 효과를 `PlayerCombat` 으로 변환하는 헬퍼:
  ```ts
  export function evasionGuaranteedFor(stats): number;
  export function extraAttackEveryNFor(stats): number | undefined;
  export function critChancePctFor(stats): number;
  export function earlyMitigationFor(stats): { turns: number; amount: number };
  ```

### Phase B — 엔진 통합
**파일: `src/adventure/battle/engine.ts`**

- `PlayerCombat` 타입에 새 옵션 필드 4개 추가.
- `BattleState` 에 `evadesRemaining: number` 추가 (전투 시작 시 `guaranteedEvades` 로 초기화).
- player phase: 크리티컬 판정 추가 (강공격 보너스 후 적용 순서 명시).
- enemy phase: `evadesRemaining > 0` 이면 우선 소모 → `evasionPct` 일반 회피 → 데미지. 데미지에 early mitigation 적용.
- 연타: 턴 종료 시 `(turnNumber % interval === 0)` 이면 `playerAttacksLeft += 1` + phase 를 player 로 유지 + 한 번만 발동 (gate 플래그 필요 — `extraAttackUsedThisTurn`).

### Phase C — page.tsx 와이어업
**파일: `src/app/page.tsx`**

`playerCombat` 객체 구성에 새 필드 4개 매핑 — `skills.ts` 헬퍼 사용.
```ts
const playerCombat: PlayerCombat = {
  ...,
  powerAttackBonus: powerAttackBonusFor(character.stats),
  guaranteedEvades: evasionGuaranteedFor(character.stats),
  extraAttackEveryNTurns: extraAttackEveryNFor(character.stats),
  critChancePct: critChancePctFor(character.stats),
  earlyMitigation: earlyMitigationFor(character.stats),
};
```

### Phase D — 테스트
**파일: `src/adventure/battle/engine.test.ts`**

각 스킬 1~2개 테스트:
- 회피 강화: 첫 enemy phase 가 무조건 회피 로그
- 연타: 5턴째 공격 후 한 번 더 공격 (전투 길이 / 공격 횟수 검증)
- 크리티컬: `Math.random` 모킹해서 결정적으로 발동 시 데미지 ×2
- 방벽: 1~3턴은 dmg-1, 4턴부터 정상 데미지

### Phase E — UI/문서
- `SkillsView.tsx` — 자동으로 새 스킬 표시 (deriveSkills 결과 그대로 렌더링) → 작업 0.
- `docs/items.md` 또는 새로운 `docs/skills.md` 에 표 추가.

---

## 검증 항목

- [ ] DEX 9 → 회피 무효. DEX 10 → 첫 피격 무조건 회피.
- [ ] SPD 14 → 연타 미발동. SPD 15 → 5턴마다 +1 공격.
- [ ] LUK 9 → 크리티컬 미발동. LUK 10 → 5% 확률 ×2 (테스트 시 random 모킹으로 검증).
- [ ] VIT 9 → 일반 데미지. VIT 10 → 1~3턴 데미지 -1, 4턴부터 정상.
- [ ] 강공격 + 크리티컬이 같이 터지면 `(atk + bonus) → dmg → ×2` 순서로 누적.
- [ ] 패시브 4종 모두 stat 변경 시 `lastSeenSkillsRef` 비교로 알림 토스트 발화.

## 비고

- 모든 스킬은 **passive 자동**. MP 소모/액티브는 별도 phase.
- 임계는 균형 위해 강공격(STR 10)과 비슷한 난이도로 통일. 연타만 SPD 15 — SPD 는 이미 10pt 당 공격 횟수 보너스라 더 높게.
- 전투 시 발동 로그가 한 화면에 너무 길어지지 않게 메시지 한 줄로 압축.
- 드랍/장비/스탯 합산 결과로 임계 도달하므로 자동 토스트가 게임 중 깜짝 발생 가능 — 의도된 동작.
