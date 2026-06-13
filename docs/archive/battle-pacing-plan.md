# 전투 페이싱 개편 계획 — 즉시 해결 + 길이 비례 쿨다운

> 상태: ✅ **구현 완료** — 전투 페이싱 개편(즉시 해결 + 쿨) 엔진 반영. 이 문서는 설계 기록.

## 1. 배경 / 문제

현재 `useBattle`은 매 턴 `TURN_INTERVAL_MS = 500ms`마다 `advanceTurn`을 한 번 호출. 한 라운드(player + enemy)에 약 1초, 한 전투 보통 5~15턴 → **2.5초~7.5초**가 걸린다. 결과 화면도 1.2초 추가.

문제:
- 캐릭터가 성장해도 한 전투 시간이 거의 줄지 않음 (단지 적이 빨리 죽을 뿐 인터벌은 동일).
- "강해졌다"는 체감이 약함 — 로그는 짧아지지만 한 줄당 0.5초씩 끌어 시간 차이가 안 남.
- 모바일에서 화면 켜놓고 사냥할 때 단조로운 0.5초 인터벌이 지루함.

## 2. 목표

- **한 전투를 즉시 해결**하고 모든 로그를 한 번에 노출.
- 다음 전투 시작까지의 **쿨다운을 전투 로그 길이에 비례**시켜, 강한 캐릭터일수록 회전이 빨라지도록.
- 사용자가 로그를 읽을 시간은 충분히 보장 (아예 못 보고 지나가지 않게).

성장 보상 곡선 예시:
- 초반(5턴 전투): 약 5턴 × 250ms = **1.25초 cooldown** → 약 1.5초마다 한 전투
- 중반(3턴 전투): 약 0.75초 cooldown → 약 1초마다 한 전투
- 후반(1~2턴 전투): 0.25~0.5초 cooldown → 약 0.5초마다 한 전투

체감상 1.5초 → 0.5초로 **3배 빠른 사냥**이 자연스럽게 펼쳐진다.

## 3. 방향

### 3.1 핵심 흐름

```
[전투 시작]
  ↓ 즉시 시뮬 (advanceTurn 반복) → 최종 BattleState + 전체 로그 확정
[로그 일괄 표시]                 ← 한 번에 8줄 (또는 카드 가득), HP bar는 final 상태
  ↓ cooldown = clamp(log.length × K, MIN, MAX)
[다음 전투]
```

`useBattle`을 두 단계로 분리:
1. **`resolveBattle(player, enemy)`** — 순수 함수, 시뮬을 끝까지 돌려 `{ outcome, log, finalPlayerHp, ... }` 반환. `offlineSim.ts`의 로직과 99% 같음 — 이미 있는 자산 재사용.
2. **`useBattleSequence`** — 외부에서 region/player를 받아 `resolveBattle` 호출 → 결과 표시 → cooldown setTimeout → 다음 전투.

### 3.2 BattleScene 표시 방식

세 가지 옵션 중 결정 필요:

#### (a) 즉시 전체 표시 ★ 권장
- 로그 8줄(LOG_LIMIT)을 한 번에 보여주고 HP bar는 final 상태.
- 가장 단순. 사용자는 카드를 한눈에 읽음.
- 짧은 전투(2~3줄)는 빠르게 사라지지만 cooldown으로 시간 확보.

#### (b) 빠른 typewriter (50~100ms/줄)
- 한 줄씩 fade-in. 시각적 모멘텀 유지.
- 즉시 표시보다 약간 더 정성 있어 보임.
- HP bar 애니메이션도 따라 흐름.
- 단점: 코드 복잡, 짧은 전투의 체감 차이 줄어듦.

#### (c) 즉시 표시 + 마지막 결정타 강조
- 로그는 즉시, 마지막 한 줄(킬 또는 사망)만 색/크기 강조 + 살짝 지연.
- 절충안. 시각적 강조점.

### 3.3 쿨다운 공식

```
cooldown_ms = clamp(log.length × LOG_DELAY_PER_LINE, MIN_COOLDOWN, MAX_COOLDOWN)
```

기본값 제안 (튜닝 대상):
- `LOG_DELAY_PER_LINE = 250ms`
- `MIN_COOLDOWN = 600ms` (너무 짧으면 화면 안 보고 지나감)
- `MAX_COOLDOWN = 4000ms` (너무 길면 단조로움)

승리/패배 분기:
- 승리: 위 공식 → 다음 적
- 패배: cooldown 무시, 즉시 결과 화면 → 사용자 확인 → 시작 마을

## 4. 결정 필요 항목

| # | 항목 | 옵션 | 권장 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | 표시 방식 | (a) 즉시 / (b) typewriter / (c) 결정타 강조 | **(a)** | 단순, 효과 큼 |
| 2 | 쿨다운 공식 | 단순 비례 / base+비례 / 곡선 | **단순 비례 + clamp** | 직관적 |
| 3 | 결과 화면 (`BattleResult`) | 유지 / 통합 / 패배만 유지 | **패배만 유지** | 승리는 쿨다운으로 자연 흐름 |
| 4 | HP bar | 즉시 final / 짧은 애니메이션 | **즉시 final** | 단계 (a)와 일관 |
| 5 | 자동포션 표시 | 그대로(로그) / 별도 큐 | **로그 그대로** | 변경 폭 작음 |
| 6 | 사용자 skip | 클릭 시 cooldown 즉시 끝 | **포함** | 빠른 진행 원할 때 |
| 7 | 패배 cooldown | 즉시 / 짧게 / 동일 | **즉시 결과 화면** | 사용자 확인 필요 |

## 5. 마이그레이션 / 단계

### Step 1 — 시뮬 로직 추출 (변경 폭 0)
- `resolveBattle(player, playerName, enemy, ctx)` 순수 함수를 `engine.ts`에 추가.
- `offlineSim.ts`의 단일 전투 루프와 동일 로직 — 코드 중복 제거 기회.
- 단위 테스트 5~7개 (승리/패배/포션 사용/회피/연속 공격).

### Step 2 — `useBattleSequence` 신규 hook
- 기존 `useBattle`은 점진 전환 위해 한동안 공존, 이후 제거.
- 시그니처: `useBattleSequence({ player, region, ctx, onBattleEnd })`
- 내부:
  - region에 적이 있으면 `resolveBattle` 호출 → state로 전체 로그 + final HP 보존
  - cooldown setTimeout → 다음 전투 자동 시작
  - cleanup에서 timeout clear

### Step 3 — `BattleScene` 단순화
- `useEffect`로 한 줄씩 stream하던 로직 제거.
- `state.log`를 그대로 받아 표시. HP bar는 final 값.
- 변경 폭 작음.

### Step 4 — `BattleResult` 처리
- 승리: 화면 표시 안 함 (cooldown 동안 BattleScene이 그대로 보임). 결과 요약은 알림 종에 그대로.
- 패배: 기존처럼 화면 모달 표시 + 사용자 확인.

### Step 5 — 튜닝
- 실제 플레이로 `LOG_DELAY_PER_LINE` / `MIN_COOLDOWN` 조정.
- A/B 비교: 현재 0.5s/턴 vs 새 방식.

### Step 6 — 오프라인 시뮬과 통합
- `offlineSim.ts`도 `resolveBattle` 호출로 통일 → 한 곳만 유지보수.

## 6. 트레이드오프

**얻는 것**
- 강한 캐릭터의 사냥 속도 체감 큼 (3배 가량).
- 코드 단순화 — `useBattle`의 setInterval/setTimeout 흐름이 사라지고 시뮬 + 표시로 분리.
- `offlineSim.ts`와 코드 통합 가능 → 일관성.
- 모바일 배터리 — setInterval 빈도 줄음.

**잃는 것 / 위험**
- "한 턴씩 진행되는" 전통 RPG 느낌이 옅어짐 — 모바일 idle 게임 톤에 가까워짐. 게임 컨셉과 충돌하지 않는지 확인 필요.
- typewriter 효과 같은 시각적 디테일이 빠짐 → (b) 옵션으로 회복 가능하지만 복잡도 ↑.
- 자동포션 발동 순간이 사용자에게 "체감"되지 않음 (이미 결정된 결과로 보임). 별도 hint(예: 로그 "회복약 사용" 줄에 색 강조)로 보완.

## 7. 측정 지표 (튜닝용)

- **평균 한 전투 사이클 시간** (전투 시작 → 다음 전투 시작) — 캐릭터 레벨별로 기록.
- **처음 N분 처치 수** — 시간당 사냥 속도. 성장 곡선의 보상으로 작동하는지 확인.
- **로그 보지 못한 전투 비율** — cooldown 미달 또는 연속 짧은 전투 케이스. (선택적, 직접 측정 어려움)

## 8. 다음 액션

1. 위 결정 항목 7개 확정 (특히 #1, #2 기본값).
2. Step 1 (resolveBattle 추출) — 가장 안전, 별도 commit.
3. Step 2~3 (useBattleSequence + BattleScene) — 한 commit으로.
4. Step 4 (BattleResult 분기) — 같은 commit 또는 분리.
5. 실제 플레이 튜닝 → Step 5.
6. Step 6 (offlineSim 통합)는 안정화 이후.
