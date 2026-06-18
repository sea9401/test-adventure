# v2 전투 ATB(속도 타임라인) 재설계

> 상태(2026-06-18): **Phase 1·2·4·5 LIVE**(#768~772). **Phase 3(turn→tick) = supersede(미추진)** —
> 아래 §Phase 3 결정 참조. ATB 아크는 사실상 완성(action-count 지속시간 모델 유지).
> 전부 마스터 플래그 `V2_CORE_LOOP_V2` 뒤 — flag-off = 현행 고정교대 전투 바이트 동일.

## 목표

고정 교대(나 한 번 너 한 번)를 **속도 기반 타임라인(ATB/CTB)** 으로 교체. SPD 높은 캐릭이
행동을 더 자주 = 도적/궁사 정체성. 탱크 무조건 이득 아님. 빌드 다양성. 자동 단판·결정론 유지
(리플레이가 동일 타임라인 재현). **데미지식·스탯 체계 전부 불변** — 핵심 변경은 "행동 타이밍/순서"
하나뿐(timing 변수와 damage 변수 분리).

## 모델

- "다음 행동 tick 가장 빠른 액터 1명이 행동"하는 우선순위 큐.
- **로그 소프트캡 레이트**: `rate(spd) = min(RATE_CAP, 100 × (1 + 0.75 × ln(1 + spd/50)))`,
  `interval = ceil(100×100 / rate)`. 단순 `1/spd` 금지(궁사가 49배 행동 → 붕괴).
- **RATE_CAP = 260 ≈ 2.0배**(유저 확정). 매운맛 다이얼: 220≈1.6×·320≈2.1×. 빠른 빌드의 최대
  행동 배율 상한.
- 동점(같은 nextTick) = `tieRank`(PvE: player 우선) → 단조 `sequenceNo`. 결정론(Math.random 미사용).
- **캡 = 시간(tick)** — 행동수 캡이 아니라(빠른 빌드 목표와 충돌). 타임아웃 시 PvE 는 공격자(player)
  패배, PvP 는 HP% 승(동률 draw). 절대 안전 가드 ~1000 행동.
- 몬스터 SPD 1~14(중앙 6) ≠ 플레이어 14~292 → 진입 매핑
  `effectiveMonsterSpd = 10 + spd×6 + 깊이보정`(spd1→16·spd14→94). 역할 밴드.

## 🔑 핵심 발견 (Phase 0 시뮬, 엔진 불변 실측)

유저가 걱정한 "스탯 과열"의 범인은 ATB 가 아니라 **기존 SPD 파생 `extraAttackChancePct = spd×0.5`**
(궁사 +146% 추가타). 그걸 ATB 에 그냥 얹으면 궁사가 탱크 **28배** DPS(붕괴). →
**ATB 에선 SPD 파생 extraAttackChancePct 를 제거**(추가타 패시브 = haste/별 기전으로)하면 SPD 가
데미지에 **빈도 하나로만** 기여 = ~2배로 통제. 궁사 잔여 12배 DPS 는 ATK 71(글래스캐논 스탯)이지
ATB 탓 아님 — 다양성(빠른딜 vs 버티기). 탱크는 화력 낮으면 시간캡 패배(무조건 이득 아님).

## 구현 단계 (Phase)

- **Phase 1 — PvE `resolveBattle`** (현재). 고정교대 → ATB 타임라인. flag-gate 로 점진:
  현 본문 `resolveBattleLegacy` 보존 + 디스패처가 flag 로 ATB/legacy 분기. flag-off 골든 불변.
- Phase 2 — PvP(`engine-pvp.ts`).
- Phase 3 — 스킬 지속시간 turn→tick. **❌ supersede(미추진, 2026-06-18 결정) — §Phase 3 결정 참조.**
- Phase 4 — 몬스터 SPD 튜닝. ✅(#771)
- Phase 5 — UI 타임라인 로그. ✅(#772)

### §Phase 3 결정 — supersede(미추진), action-count 모델 유지 (2026-06-18)

스킬 리워크가 끝나 Phase 3(지속시간 turn→tick) 착수 가능해졌으나, 분석 결과 **원안이 ATB
설계 의도와 모순**이라 추진하지 않기로 확정(오너 승인).

- **현 모델(action-count, Phase 1에서 구현)**: 버프/디버프/DoT 가 소유 액터의 행동묶음마다 1씩
  감소 = "내 행동 N번 동안 유지". **속도-중립** — 누구나 버프받은 행동 N번 동일.
- **tick 전환 시 문제**: 고정 틱 동안 유지로 바꾸면, 빠른 빌드(궁사·도적, 행동 2배)가 같은 틱
  창에서 **버프받은 행동도 2배** → "행동 2배 × 버프 적용 2배" 곱연산 이득. 이는 RATE_CAP·
  extraAttackChancePct 제거로 *애써 통제한 빠른 빌드 과열*을 되살리는 방향.
- **귀결**: action-count 가 오히려 더 균형(속도-중립). turn→ticks 환산도 모호(문서 기존 "모호점").
  골든·밸런스 리스크 대비 가치 마이너스 → **미추진**. 필요 시 특정 케이스만 좁게 손보는 것은 별개.
- 남은 ATB 후속(선택): 문서 "모호점"의 extraAttack derive 분리·Shadow Step 공격당 판정 등.

### Phase 1 서브스텝

1. `combatTimeline.ts` 순수 모듈(rate/interval/effectiveMonsterSpd/tieRank/picker) + 단위테스트. ✅
2. 레거시 골든 동결 + 타임라인 불변식 테스트(결정론·동점·타임아웃 패배·무한루프 가드).
3. `resolveBattle` → `resolveBattleLegacy` + 디스패처 분리(동작 무변경, flag-off 골든 동일).
4. `resolveBattleAtb` — 기존 페이즈 헬퍼 재사용, "액터 행동묶음" 단위로 DoT틱/디버프감소/멀티히트 재배선.
5. ATB 분기에서만 SPD 파생 `extraAttackChancePct=0`(PvE player view override — derive·PvP 불변).
6. 턴캡 → tick 캡 + 절대 행동 가드.
7. ATB 골든 재생성 + `scripts/sim-v2-atb.ts`(7직군 ATB vs 레거시 비교).
8. 회귀: flag-off 골든 불변 · flag-on ATB 골든 · sim ~2배 천장·승률 정상.

## 턴→tick 재배선 (turn-keyed 기전, Phase 4)

- 플레이어 행동묶음(attackCount·추가타·뱅가드·콤보·광속) = 1 액터 이벤트. 종료 후
  `nextTick += interval(effectiveSpd)`.
- 몬스터 멀티공격 = 1 액터 이벤트(전 공격 해소 후 다음 enemy 이벤트 스케줄).
- DoT(`playerV2Dots`/`enemyV2Dots`): **대상 액터의 행동묶음 시작 시** tick.
- 버프/디버프 `turnsLeft`·`decrementTimedEffects`: 소유 액터 행동묶음 진입 시 감소(첫 완료 후).
- 페이즈 트리거(몬스터 HP 임계)·보장회피 소모: 데미지 직후 즉시(불변).
- 모호점(Phase 1 한계로 문서화): Shadow Step 공격당 판정·`enemyV2Debuffs` 소유권·spec/trait
  extraAttack 병합(derive 분리 없이는 못 떼냄).

## 호출부 (전부 flag-gate 안)

PvE: hunt·outpost claim(NPC)·coop attack·npc-attacks 크론·training spar. PvP(Phase 2): arena·
outpost claim(PvP)·outpost eject.

## 골든/sim

`src/adventure/v2/combatGolden.test.ts`(mulberry32 seed·PvE/PvP fingerprint). 절차: 레거시 골든
선동결 → flag-off 바이트 동일 확인 → flag-on ATB 골든 별도 재생성(PvP 골든 미변경). 새 sim
`scripts/sim-v2-atb.ts` 가 행동빈도 비율·승률·TTK(tick)를 7직군 sweep 으로 ATB vs 레거시 비교.
