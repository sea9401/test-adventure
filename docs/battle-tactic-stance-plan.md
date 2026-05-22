# 전투 전 전술(스탠스) 커밋 계획

> 상태: ✅ **구현 완료 (2026-05-22, #497)** — 공세/수성/처형 전술 출고. 이 문서는 설계 기록.

> 자동 전투 전제를 유지한 채 "전투 전 전술 선택"이라는 주도성 층을 얹는다.
> 배경: `docs/game-fun-audit.md` 의 1순위 문제 — 게임의 깊이(AP스킬·룬·부여)가
> 전투를 직접 플레이하는 순간이 아니라 "빌드 계산" 단계에만 갇혀 있다.
>
> 진단에서 검토한 다른 형태(인게임 액티브 발동 / 핵심 순간 인터럽트)는 즉시해결·
> 매크로 차단(`docs/auto-only-battle-plan.md`) 전제와 충돌이 크다. **전술 커밋**은
> 메뉴 선택이라 매크로 위험 0, 즉시해결과 충돌 0, 구현 리스크 최저.

## 적용 범위 — 보스/특수 전투에만 (2026-05-22 확정)

전술은 **일반 잡몹 사냥·오토헌트에는 들어가지 않는다.** "진짜 판단이 필요한 전투"에서만
갈리게 — 지역 보스 도전, 협동 월드보스, 고탑, PvP 아레나. 일반 농사 루프는 그대로 단순.

이유: 감사의 의도("의미있는 선택을 의미있는 곳에만")와 일치. 무의미한 잡몹 농사에 전술이
끼면 마찰만 늘고 선택의 무게가 희석된다.

## 핵심 설계 발견 — 엔진 무수정 (단, derive 보편 주입은 안 됨)

라이브·오프라인 오토헌트·협동·PvP·고탑 **모든 전투 경로가 동일한 derive 산출물
`PlayerCombat` 을 소비**한다 (`battle/engine.ts:197`). `PlayerCombat` 에는 스탠스가
건드릴 필드가 이미 전부 있다: `atk / def / evasionPct / critChancePct /
executionDamageMult / executionHpFraction`. → 스탠스를 **`PlayerCombat` 필드 보정**으로만
표현하면 `engine.ts`(2829줄)는 한 줄도 안 건드린다.

**그러나** 보스/특수 전투에만 적용하려면 derive 에 보편 주입하면 안 된다 — derive 산출물은
일반 사냥·오토헌트도 쓰므로 새어 들어간다. 대신 **`isBoss`/모드를 아는 특수 전투 진입
지점에서만 `applyStance(player, stance)` 를 게이팅 적용**한다. 순수 헬퍼 `applyStance` 는
공유하되, 호출 지점이 (보편 derive 가 아니라) 특수 전투 입구로 옮겨진다.

적용 ON: 지역 보스(`isBoss=true`), 협동, 고탑, PvP.
적용 OFF: 일반 지역 사냥(`isBoss` 아님), 오토헌트(`offlineSim`).

## 결정된 동작

### 전술(스탠스) 3종

각 스탠스는 상황별 최적이 달라지도록 **트레이드오프**를 둔다. (단순 +스탯이면 단일
지배 전략이 생겨 선택이 죽는다 — 이게 주 설계 리스크.)

| 전술 | 보정 (PlayerCombat) | 빛나는 상황 | 약점 |
|------|------|------|------|
| **공세** | atk ×1.18, def ×0.9, evasionPct −5%p | 약한 잡몹 빠른 청소(처리량↑) | 강타격·한기 지역에서 잘 죽음 → 오토헌트 사망 페널티(20분) 위험 |
| **수성** | def ×1.25, atk ×0.9 | 강한 보스·한기 DoT 생존이 관건 | 처치 느림 → 파밍 처리량↓ |
| **처형** | executionDamageMult = max(기존, 1.3), executionHpFraction = max(기존, 0.33), atk ×0.95 | 고HP 단일 보스(긴 꼬리 HP를 녹임) | 잡몹 다수엔 무의미(처형창 전에 죽음) |

- **처형 스탠스는 처형 스킬 미보유자에게도 기본 처형을 부여**한다(max 처리). 스킬 보유자는
  더 강해진다.
- 수치는 전부 초안. 밸런스는 실측 후 반복 조정(다른 시스템 튜닝과 동일 — 절대값 아님).

### 기본값 / 호환

- 기본 `selectedStance = null` = 보정 0. **기존 플레이어 완전 무변화 → 마이그레이션 불필요**
  (필드 부재 = null).

### 저장

- `character.v2` 에 `selectedStance?: StanceId | null` 한 필드(영속).
- 서버 sim(협동/탑/PvP)이 save 에서 읽어 적용하므로 **per-request 전달 불필요**.
- 영속이라 "보스 직전에 바꾸면 그 값이 유지" = 사실상 보스별 선택이면서 매번 다시 안 골라도 됨.
- **단, 적용은 특수 전투 진입에서만 게이팅** (저장은 보편, 적용은 보스/특수 한정).

### "설정"이 아니라 "선택"이 되게

감사의 핵심 우려는 "전투 전 깊이가 한 번 세팅 후 박제된다"는 것. 스탠스도 한 번 켜고
잊으면 같은 함정에 빠진다. 방지책:

- 전환을 **보스/특수 전투 진입 화면**에서 마찰 없이 노출.
- 진입 시 **권장 전술 힌트** (예: 한기 보스 → 수성, 고HP 단일 보스 → 처형).
- 대상마다 최적이 실제로 다르도록 트레이드오프를 가파르게 (위 표).
- 일반 사냥엔 아예 안 뜨므로(적용 OFF) 농사 루프 마찰 0.

## 비목표 (이번 범위 제외)

- **일반 사냥·오토헌트 적용** (보스/특수 전투에만 — 위 적용 범위 참조).
- 인게임 수동 발동 / 인터럽트 (즉시해결·매크로 전제와 충돌).
- AP 스킬 우선순위 프로필 (스탠스에 묶을 수 있으나 스코프 크리프 — 후속 phase).
- 지역별 스탠스 오버라이드 자동 적용 (후속).
- 신규 `PlayerCombat` 필드/엔진 메커니즘 추가 (전부 기존 필드 보정으로 표현).

## 통합 지점 (파일:라인 → 할 일)

핵심: `applyStance` 는 **보편 derive 가 아니라 특수 전투 진입 지점에서만** 호출(게이팅).

1. **신규 `src/adventure/character/stance.ts`** — `StanceId` 타입, `STANCE_MODIFIERS`
   테이블, `applyStance(player: PlayerCombat, stance: StanceId | null): PlayerCombat`
   순수 헬퍼. (단일 진실원, null=항등)
2. **`character/types.ts` + `character.v2` 스키마 + `SavedCharacterV2`** —
   `selectedStance?: StanceId | null` 필드(저장만, 적용 아님).
3. **라이브 보스 진입** — 보스 도전이 `isBoss=true` 로 전투를 시작하는 지점
   (`BattleView.tsx:146` startWithLog / `useBattle.ts:53` start 경로). `isBoss` 일 때만
   `applyStance(player, selectedStance)` 적용. **일반 사냥(isBoss 아님)·`offlineSim` 은 미적용.**
4. **서버 특수 sim** — 협동(`lib/server/coop/*`), 고탑(`lib/server/tower/*`),
   PvP(`lib/server/pvp/*`) 가 save 로부터 player 를 derive 한 직후 `applyStance` 통과.
   세 경로 모두 `derivePlayerCombatFromSaves` 산출물을 받으므로, 그 호출부에서 게이팅.
   **`derivePlayerCombatFromSaves` 내부에 넣지 말 것** (다른 용도로도 쓰일 수 있음 — 입구에서).
5. **UI** — 보스/특수 전투 진입 화면에 스탠스 선택기 + 권장 힌트. 선택 시 character
   상태 뮤테이션. **일반 지역 사냥 화면엔 미노출.**
6. **모험의 서/도감 표기(선택)** — 현재 적용 전술 노출.

## 서버 권위 메모

- 라이브 보스 전투는 클라 권위(`useBattle.resolveBattle`), 보상은 서버가 monster base
  로만 재계산(`lib/server/battleClaim.ts`) — 클라 전투 수치 불신뢰. 스탠스가 클라 수치만
  바꾸므로 **새 치트 벡터 없음**(승패 권위는 이미 클라가 가짐 — 기존과 동일).
- 협동/탑/PvP는 서버가 save 로부터 재 derive → `selectedStance` 가 save 에 있으면 서버가
  자동 반영. 그래서 **per-request 전달 불필요, save 영속이 정답.** 서버는 입구에서만
  `applyStance` (이미 특수 전투 경로이므로 게이팅 자동 충족).

## 청크 분할

A→B 순차 의존(B 가 A 의 타입·상태에 의존)이라 병렬보다 단일 브랜치 순차가 맞다.
현재 체크아웃 브랜치는 main 보다 58 뒤처짐 → **origin/main 기준 새 워크트리**에서 진행.

- **청크 A (기반)**: `stance.ts`(타입+테이블+`applyStance`) → `selectedStance` 영속화
  (types + character.v2 + SavedCharacterV2) → **특수 전투 진입 게이팅 적용**(라이브 보스
  입구 + 서버 협동/탑/PvP 입구) → 단위 테스트(applyStance 수치, null=항등, 처형 max 합성,
  **일반 사냥/offlineSim 미적용 회귀**).
- **청크 B (UI)**: 보스/특수 전투 진입 선택기 + 상태 뮤테이션 배선 + 권장 힌트 +
  (선택) 모험의 서 표기. **일반 사냥 화면엔 미노출.**

## 검증

- 단위: `applyStance` 각 스탠스 수치, null=항등, 처형 max 합성(스킬 보유/미보유).
- 회귀(중요): **일반 사냥·`offlineSim` 경로엔 스탠스가 안 들어가는지** (boss 아닌 전투
  산출이 stance 설정과 무관하게 동일).
- 수동(dev 라운드트립): 협동/탑/PvP 가 save 의 stance 를 서버 입구에서 실제로 반영하는지
  (서버 sim 경로는 DB 단위테스트 없음 — 라운드트립 필수).
