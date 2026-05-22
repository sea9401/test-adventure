# 전투 시스템 계획 (v1)

> 상태: ✅ **구현 완료 (v1)** — 전투 시스템 기반. 이 문서는 설계 기록.

지도 위치의 적과 턴제로 싸워 EXP·골드를 얻는 단일 전투 루프.
모험 > 전투 서브뷰 안에서 자기완결.

> **변경 노트** — 초기 v1 의 "자동/수동 토글" 은 폐기되었다. 현재는 항상 자동 진행.
> 배경/이행 내용은 `docs/auto-only-battle-plan.md` 참고.

## 목표

- **자동 전투** — 시작 후 매 턴이 0.5초 간격으로 자동 진행, 플레이어는 관전.
- **승리 시 자동 체이닝** — 한 판 끝난 직후 같은 지역에서 다음 적과 자동으로 새
  전투 시작. (사용자가 서브뷰에서 빠져나가기 전까지 무한 반복.)
- 현재 지역의 적 풀(`region.enemies`)에서 랜덤 1마리와 1:1 전투.
- 선공은 플레이어 고정.
- 승리 시 EXP·골드, 패배 시 안전한 복귀(시작 마을로 회수).
- v1은 의도적으로 단순 — 스킬·아이템·크리티컬은 v2에서.

## 데이터 모델

### 적 정의 — 신규

지금 `region.enemies: string[]` (이름만) → id 참조로 변경하고 stat을 별도 정의.

```ts
// src/adventure/data/enemies.ts
type EnemyId = "slime" | "rat" | "bat" | "ore_golem" | ...;

type Enemy = {
  id: EnemyId;
  name: string;
  hp: number;           // 최대 HP
  atk: number;
  def: number;
  spd: number;          // 선공 결정용
  exp: number;          // 처치 시 EXP
  gold: number;         // 처치 시 골드
  description?: string;
};
```

`world.ts`의 `region.enemies`를 `string[]` → `EnemyId[]`로 마이그레이션.

### 전투 진행 상태 — 신규

전투 시작부터 종료까지의 휘발성 상태.

```ts
type BattleState = {
  enemy: Enemy;
  enemyHp: number;
  log: BattleLogEntry[];          // 최근 N(=8)개만 유지
  phase: "player" | "enemy" | "ended";
  outcome: "win" | "lose" | null;
};

type BattleLogEntry = {
  kind: "player_attack" | "enemy_attack" | "info";
  text: string;                    // "슬라임에게 5 피해"
};
```

## 전투 흐름

1. 전투 외 화면(현재 BattleView)에서 "전투 시작" 1회 클릭.
2. 현재 지역 enemies에서 랜덤 1마리 선택 → `BattleState` 초기화.
3. **선공**: 플레이어 고정 (v1 단순화).
4. **자동 턴 루프** — `setTimeout`으로 한 턴씩 진행:
   - 현재 턴 측이 공격 → damage 계산 → 상대 HP 감소 → 로그 추가 → 턴 교체.
   - 플레이어 턴엔 자동포션 룰 평가 후 (트리거 시) 포션 사용, 그 외엔 공격.
   - 어느 한 쪽 HP ≤ 0 이면 종료.
   - 턴 간격: 기본 500ms.
5. 플레이어 입력 없음 — 결판날 때까지 자동 진행, 관전만.
6. **종료**:
   - 승리 → 결과 잠깐(약 1.2s) 표시 후 자동 확인 → 외부 상태 반영
     (EXP/HP/골드) → 같은 지역에서 새 적 랜덤 조우 → 2단계로 돌아감.
   - 패배 → 결과 화면(BattleResult)에서 "확인" 클릭으로 외부 상태 반영 후
     시작 마을로 복귀 + HP 풀 회복.

## 데미지 공식 (v1)

```
damage = max(1, attacker.atk - defender.def)
```

- **플레이어 atk** = `baseAtk(0)` + STR 환산(`STR × 1`) + 무기 보너스
- **플레이어 def** = 방어구 보너스
- **적 atk/def** = enemy 데이터 그대로

장비 보너스를 숫자로 다루기 위해 현재 `EquipItem.stats: { label, value: string }`을
`{ label, key: "atk"|"def"|... , value: number }`로 확장 — 또는 별도 `bonus: { atk?, def?, ... }`
필드를 추가하고 `stats`는 표시용으로만 유지. **후자가 안전** (UI 영향 적음).

크리티컬·회피·정확도는 v2.

## 보상

| 결과 | EXP | 골드 | HP | 위치 |
|------|-----|------|-----|------|
| 승리 | `enemy.exp` | `enemy.gold` | 잔여 그대로 | 그 자리 |
| 패배 | 0 | 0 | maxHp로 회복 | 시작 마을(village)로 강제 이동 |

EXP가 `maxExp` 초과 시 레벨업 처리는 v2 (지금은 누적만, EXP 바로만 표시).

## 영속화

- **전투 진행 중 상태(BattleState)**: 영속화 안 함. 새로고침 시 자연스럽게 종료.
  텍스트 게임 짧은 전투 가정 — 필요해지면 v2.
- **캐릭터 HP·EXP·gold**: 영속화 필요. 현재 `baseCharacter`는 정적 const →
  page.tsx에서 `useState`로 끌어올려 `character.v1` 키에 저장.
  · `characterProfile.v1`은 이름·성별만, `character.v1`은 변동 상태.
  · 분리 이유: 프로필은 한 번 정하면 안 바뀌고, 진행 상태는 자주 바뀜.
- **자동/수동 토글**: 폐기. `battle-settings.v1` 키도 더이상 사용하지 않음.

## UI 분기

`BattleView`는 3-state 머신 (토글 없음, 항상 자동):

```
                    ┌────────────[승리]────────────┐
                    ▼                              │
[전투 외] ──"전투 시작"──▶ [전투 중] ──end──▶ [결과]
   ▲                                              │
   └────────────"확인"(패배 시) / 자동확인(승리 시)─┘
```

- 전투 외 → 전투 시작 1버튼.
- 전투 중엔 행동 버튼 없음 — 자동포션 룰만 평가.
- 결과 → 승리 시 1.2s 후 자동 진행 + 다음 적 체이닝, 패배 시 사용자 확인 필요.

### 전투 중 (`BattleScene`)

```
┌──────────────────────────────────┐
│ 슬라임          HP ▓▓▓░░░ 12/30  │
│                                  │
│ 모험가          HP ▓▓▓▓░ 40/50   │
├──────────────────────────────────┤
│ ▸ 슬라임에게 5 피해를 입혔다.    │
│ ▸ 슬라임이 당신에게 3 피해.      │
│ ▸ ...                            │
└──────────────────────────────────┘
```

- 적 HP 바: 빨강(rose-500), 플레이어 HP 바: 초록(emerald-500) — 시각적 구분.
- 로그: 최근 5줄, 자동 스크롤.
- 턴 간격 500ms — 빠르게 관전.
- 입력 버튼 없음 — 결판날 때까지 진행. SubViewHeader 뒤로 가기도 비활성.

### 결과 (`BattleResult`)

```
┌──────────────────┐
│      승리!       │
│  EXP +12  💰 +5  │
│  [   확인   ]    │
└──────────────────┘
```

패배 시 "당신은 쓰러졌다... 시작 마을로 옮겨졌다." 안내.

## 컴포넌트 구조

```
src/adventure/
  data/
    enemies.ts             # Enemy 정의 (신규)
    world.ts               # region.enemies 타입 변경 (string[] → EnemyId[])
  battle/
    engine.ts              # 순수 함수 (damage, decideFirst, applyTurn 등)
    useBattle.ts           # 훅 — BattleState + (attack/flee/end) 액션
    BattleScene.tsx        # 전투 중 UI
    BattleResult.tsx       # 결과 화면
  BattleView.tsx           # 3-state 분기 컨테이너 (기존 파일 확장)
```

`engine.ts`는 React 비의존 — 테스트하기 쉽고 시뮬레이션도 가능.

## 구현 단계

1. **장비 보너스 구조 변경** — `EquipItem`에 `bonus: { atk?, def?, ... }` 추가,
   기존 `stats: {label, value}[]`는 표시용 그대로 유지. 기본 장비 3개에
   숫자 보너스 채움.
2. **캐릭터 변동 상태 분리** — page.tsx의 character HP·EXP·gold·currentMp를
   `useState` + `character.v1` 영속화로 전환. baseCharacter는 정적 기본값으로
   유지하고 변동 부분만 끌어올림.
3. **`data/enemies.ts`** — 적 6~10마리 정의 (지역별 2~3마리 분포).
4. **`world.ts` 마이그레이션** — `region.enemies` 타입을 `EnemyId[]`로 변경,
   기존 한글 문자열은 enemy id로 교체. BattleView·UI에서 lookup으로 이름 표시.
5. **`battle/engine.ts`** — `computePlayerAtk`, `computePlayerDef`, `attackDamage`,
   `isEnded` 등 순수 함수. 선공은 항상 플레이어. 단위 테스트 없이도 충분히 단순.
6. **`battle/useBattle.ts`** — `start(enemy)` 액션. 턴은 내부에서 `setTimeout` 500ms로
   자동 재예약. 종료 시 `onEnd(outcome, rewards)` 콜백.
   · 컴포넌트 언마운트 시 타이머 cleanup 필수.
7. **`BattleScene` / `BattleResult`** — 위 UI 와이어프레임 그대로. 자동 모드면
   결과 화면 1.2s 후 자동 확인 트리거.
8. **`BattleView` 통합** — phase state로 3-state 분기. "전투 시작" 클릭 시 현재
   region에서 랜덤 enemy 선택 → BattleScene으로. 결과 확인 시 character 상태 업데이트.
   - 승리 → 결과 1.2s 후 새 enemy로 다시 시작.
   - 패배 → `mapProgress.currentRegionId = "village"`로 강제 이동 + HP 풀 회복.

## 사후 정리

- 전투 시작 버튼이 region.enemies가 비었으면(마을) 비활성 — 이미 그렇게 되어 있음.
- BattleScene 동안 SubViewHeader 뒤로 가기 비활성 — 자동 진행이라 도중 이탈 불가.
  결과 화면(BattleResult)에서만 외부 복귀 허용.

## v2 이후

- **배속/스킵**: 1x / 2x / 즉시 종료 옵션 (관전 시간이 길어질수록 필요).
- **자동 후퇴 임계치**: HP 일정 % 이하 시 자동으로 전투 종료(절반 EXP 등 페널티 포함) 옵션.
- **스킬 자동 사용**: MP 충분 시 우선순위에 따라 자동 스킬 발동.
- **아이템 사용**: 회복 포션, 부스트 등 (자동 사용 룰 포함).
- **크리티컬·회피·정확도**: LUK·DEX·SPD가 확률에 영향.
- **적 스킬·패턴**: 적도 턴마다 다른 행동.
- **다중 적 / 보스**: 1 vs N, 보스 별도 데이터.
- **레벨업**: EXP 임계 도달 시 레벨업 + 스탯 분배 포인트(`unspentPoints`와 통합?).
- **드랍**: 적 처치 시 확률 장비/재료 드랍, 인벤토리 시스템.
- **자동 반복**: "다시" / "N회 반복" 버튼, 자동 회복 위주의 idle 모드.
- **선택형 적 인카운터**: 적 목록에서 직접 골라서 싸우기 (현재는 랜덤).

## 결정된 사항 (v1)

- **턴 간격**: 500ms 고정.
- **반복**: 승리 시 항상 자동 재시작 (체이닝). 사용자가 서브뷰에서 빠져나가면 종료.
- **적 조우**: 현재 region 풀에서 랜덤 1마리.
- **선공**: 플레이어 고정.
- **패배 페널티**: 손실 없음 — 시작 마을 복귀 + HP 회복만.
- **승리 결과 표시 시간**: 1.2s 후 자동 확인.
- **수동 전투**: 폐기 — 항상 자동, 자동포션 룰로만 행동 분기.
