# 6T HARD 협동 보스 2종 구현 계획

> **실행 지침:** 이 계획은 `superpowers:executing-plans` 절차로 순서대로 실행하며, 각 동작 변경은 실패하는 회귀 테스트를 먼저 만든다.

**목표:** 재앙의 스콜피온 킹과 혹한의 호수 괴물을 같은 6T HARD 단계로 추가하고, 보스별 3부위 수집 세트·HARD 산군과 동일한 기여 보상·상시 교환 경로를 완성한다.

**구조:** 기존 `COOP_BOSSES` 카탈로그가 소환·목록·공개·공격 라우트에 신규 ID를 자동 전파하도록 정적 정의를 확장한다. 페이즈는 공유 HP에서 공격 시작 시 계산해 `Monster`에 굽고, 별도 DB 상태를 추가하지 않는다. 장비 효과는 태그 세트 시그니처로 집계하며 PvE/PvP 엔진 공용 헬퍼로 처리한다. 빙호수호의 전용 시작 보호막은 합산 보호막과 별도 잔량으로 추적해 다른 보호막 소진으로 오발동하지 않게 한다.

**기술:** TypeScript, Next.js Route Handlers, Vitest, PostgreSQL/Drizzle 기존 협동 보스 저장 구조

---

## 작업 1: 협동 보스 카탈로그와 3페이즈 전투 정의

**파일:**
- 수정: `src/adventure/data/v2/coopBosses.ts`
- 수정: `src/adventure/data/v2/v2Skills.ts`
- 수정: `src/adventure/data/v2/v2SkillCatalog.ts`
- 수정: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- 테스트: `src/adventure/data/v2/coopBosses.test.ts`
- 테스트: `src/adventure/data/v2/v2Skills.test.ts`

1. `coopBosses.test.ts`에 두 신규 ID, HARD 판정, 30장 소환, 운영 감사로 확정한 840만 HP, 24시간, 이미지 재사용, 초기 파생 공·방·속과 70%·40% 페이즈의 스탯/스킬 변화가 기대대로 나오는 실패 테스트를 추가한다.
2. `v2Skills.test.ts`에 강화 독·한기 몬스터 전용 스킬이 플레이어 학습 목록에는 섞이지 않고 중독 스택/둔화 수치/방어 약화를 정확히 설명하는 실패 테스트를 추가한다.
3. 다음 ID를 타입과 카탈로그에 등록한다.
   - `canyon_predator_hard`, `lake_sovereign_hard`
   - 페이즈용 몬스터 전용 상태 스킬 `mob_catastrophe_venom`, `mob_venom_sunder`, `mob_deep_chill`, `mob_glacial_chill`
4. 일반판 베이스를 복제한 HARD 베이스를 만들되 스콜피온은 물리 관통 액티브, 호수 괴물은 마법 액티브를 사용하게 한다. 이미지 경로는 일반판 값을 그대로 쓴다.
5. `CoopEnrageStage`에 필요한 데이터 주도 오버라이드(`spdMult`, `armorPierceBonus`, `statusSkill`, `chillAmountBonus`, `chillFixedDamageBonus`)를 추가하고 `coopBossForBattle`이 누적 적용하도록 한다. 현재 공유 HP가 70%·40% 경계를 통과한 다음 공격부터 새로운 페이즈가 적용되어야 한다.
6. `coopBossDifficultyOf`가 신규 두 ID를 HARD로 판정하도록 확장한다.
7. 실행: `npm test -- src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/v2Skills.test.ts`
8. 커밋: `feat: add tier 6 hard coop boss phases`

## 작업 2: 6T 보스 장비 6종과 공용 세트 효과

**파일:**
- 수정: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- 수정: `src/adventure/data/v2/v2Equipment.ts`
- 수정: `src/adventure/data/v2/v2EquipmentTypes.ts`
- 수정: `src/adventure/data/v2/buildTags.ts`
- 수정: `src/adventure/character/derive.ts`
- 수정: `src/adventure/v2/combat/engineState.ts`
- 수정: `src/adventure/v2/combat/signatureEffects.ts`
- 수정: `src/adventure/v2/combat/engine.ts`
- 수정: `src/adventure/v2/combat/engine.playerPhase.ts`
- 수정: `src/adventure/v2/combat/engine.enemyPhase.ts`
- 수정: `src/adventure/v2/combat/engine-pvp.ts`
- 수정: `src/adventure/v2/combat/engine.pvpPhase.ts`
- 테스트: `src/adventure/data/v2/v2Equipment.test.ts`
- 테스트: `src/adventure/v2/combat/signatureEffects.test.ts`
- 테스트: `src/adventure/v2/combat/atbSkillCast.test.ts`
- 테스트: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

1. 장비 테스트에 설계 문서의 슬롯·power·옵션·`noDrop`·세트 태그를 고정하고, 두 세트가 boots 슬롯을 공유해 3+3 완성이 불가능함을 검증하는 실패 테스트를 추가한다.
2. 전투 테스트에 다음 실패 사례를 먼저 추가한다.
   - 재앙독갑 2세트는 피해를 준 직접 액티브에만 시전당 한 번 25% 중독을 판정하고 평타·회복 스킬에는 발동하지 않는다.
   - 재앙독갑 3세트는 중독 대상 직접 액티브 최종 피해만 10% 올리고 속도 8을 제공한다.
   - 빙호수호 2세트는 상태 피해 10% 감소와 최대 HP 8% 시작 보호막을 준다.
   - 빙호수호 3세트는 그 8% 전용 보호막이 처음 소진될 때만 DoT·한기·능력치 약화를 정화하고 2행동 동안 받는 피해를 15% 줄인다.
   - 다른 출처 보호막의 소진이나 두 번째 소진에는 빙호수호 3세트가 발동하지 않는다.
   - 위 규칙은 PvE와 PvP에서 동일하다.
3. 카탈로그에 설계 문서 수치 그대로 6종을 tier 16, unique, `noDrop: true`로 추가한다.
4. 태그 세트에 `catastrophe_venom_armor`와 `frozen_lake_guard`를 추가한다. 기존 장비 옵션 집계는 정적 보너스를 담당하고 신규 시그니처 필드는 직접 액티브/전용 보호막 기믹만 담당하게 분리한다.
5. `SignatureEffect`에 직접 스킬 전용 중독·중독 대상 최종 피해·추적 시작 보호막 소진 효과를 표현하는 필드를 추가한다. 중복된 타입 선언 두 곳을 함께 갱신하고 툴팁 문구와 빌드 태그도 연결한다.
6. `BattleStacks`에 빙호수호 전용 보호막 잔량, `BattleFlags`에 발동 여부를 추가한다. 초기 전투 상태에서 8%를 기록하고, 합산 보호막 흡수 시 전용 잔량을 먼저 줄이되 이후 생성된 다른 보호막은 전용 잔량에 더하지 않는다.
7. 공용 헬퍼가 전용 잔량 0 전환을 감지하면 플레이어 DoT·`v2SelfDebuffs`·한기/저주 누적을 정화하고 기존 `playerDmgReductionPct/TurnsLeft`에 15%·2행동을 병합한다. PvE 평타·적 액티브와 PvP 평타·액티브 모든 보호막 흡수 경로에서 같은 헬퍼를 호출한다.
8. 직접 액티브 결과 확정 뒤, 시전당 한 번 중독 판정과 중독 대상 10% 최종 피해 배율을 PvE/PvP에 동일하게 적용한다. 다단 공격은 개별 타격 수와 무관하게 한 번만 판정한다.
9. 실행: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`
10. 커밋: `feat: add tier 6 coop boss collection sets`

## 작업 3: HARD 산군 동급 보상과 보스별 교환 상자

**파일:**
- 수정: `src/adventure/data/v2/coopRewards.ts`
- 수정: `src/adventure/data/v2/dungeonDrops.ts`
- 수정: `src/adventure/data/v2/spFruit.ts`
- 수정: `src/adventure/v2/coop/coopShop.ts`
- 테스트: `src/adventure/data/v2/coopRewards.test.ts`
- 테스트: `src/adventure/data/v2/dungeonDrops.test.ts`
- 테스트: `src/adventure/data/v2/spFruit.test.ts`
- 테스트: `src/adventure/v2/coop/coopShop.test.ts`

1. 두 신규 보스의 재료, 3종 무작위 장비 상자, 기여 보상을 고정하는 실패 테스트를 추가한다.
2. HARD 공통 기여 보상은 주화 `3/8/15/28/45`, 재료 `1/2/4/7/12`, 상자 확률 `0/0/10/25/100%`, 확정타 `주화 10 + 재료 1`로 검증한다.
3. 보상 정의의 표시 티어를 6까지 확장하고 신규 재료/상자 두 개를 등록한다. `coopExtraRewardRuleFor`는 특정 ID 나열 대신 HARD 난이도 판정을 사용해 신규 보스와 이후 HARD 보스가 같은 규칙을 공유하게 한다.
4. 현재 HARD 산군처럼 신규 HARD 보스도 SP 열매 직접 매핑을 추가하지 않고 `fruitTierForBoss`가 `null`을 반환함을 고정한다. 기존 일반 보스·원정 열매 정책은 변경하지 않는다.
5. 교환소에 각 보스별 `주화 900 + 해당 재료 40`, 무제한, 3종 무작위 상자를 추가한다.
6. 실행: `npm test -- src/adventure/data/v2/coopRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/data/v2/spFruit.test.ts src/adventure/v2/coop/coopShop.test.ts`
7. 커밋: `feat: add tier 6 hard coop rewards and exchanges`

## 작업 4: 소환·공격 라우트 회귀와 UI 노출

**파일:**
- 수정: `src/app/api/v2/coop/summon/route.test.ts`
- 추가: `src/app/api/v2/coop/attack/route.test.ts`
- 추가: `src/app/api/v2/coop/claim/route.test.ts`
- 수정: `src/components/adventure/v2/CoopBossPanel.tsx` (하드코딩이 발견될 때만)
- 수정: `src/components/adventure/v2/CoopShopPanel.tsx` (하드코딩이 발견될 때만)

1. 소환 라우트 테스트에 신규 두 보스가 소환서 30장으로 소환자 전용 세션을 만들고 24시간 만료를 갖는 사례를 추가한다.
2. 공격 라우트 테스트에 현재 공유 HP에서 페이즈가 선택되고 오버킬은 기여도에서만 남은 HP로 제한되며 공격당 별도 상한이 없음을 추가한다.
3. 보상 수령 테스트에 신규 재료·장비 상자의 트랜잭션 지급과 중복 수령 방지를 추가한다.
4. 패널이 카탈로그를 순회한다면 코드 변경 없이 렌더 테스트만 추가한다. 보스 ID나 표시 티어가 하드코딩돼 있을 때만 신규 ID/6T 표시를 확장한다. 모든 패널·카드는 기존 `SURFACE_*` 상수를 유지한다.
5. 실행: `npm test -- src/app/api/v2/coop/summon/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/claim/route.test.ts`
6. 커밋: `test: cover tier 6 hard coop boss routes`

## 작업 5: 균형 시뮬레이션과 전체 검증

**파일:**
- 수정: `scripts/sim-v2-coop-boss.ts`
- 수정: `src/adventure/data/v2/coopBossBalance.test.ts`
- 수정: `docs/superpowers/specs/2026-08-19-tier6-hard-coop-bosses-design.md` (운영 검증으로 확정된 HP·파생 스탯 반영)

1. 실제 `coopBossForBattle → resolveBattle`, 10초 재공격 대기와 ATB 3,000틱 제한을 사용하는 고정 시드 6T 완성 빌드 표본을 추가한다.
2. 두 보스 각각 빌드별 200회를 실행해 공격 1회 피해 중앙값, 생존율, `ceil(sharedMaxHp / medianDamage)`를 출력한다.
3. 12~15회 목표와 생존 격차 기준을 벗어나면 보스 `sharedMaxHp`, 페이즈 계수만 조정한다. 장비 보상 수치를 시뮬레이션 목표를 맞추는 손잡이로 사용하지 않는다.
4. 관련 테스트 전체 실행: `npm test -- src/adventure/data/v2 src/adventure/v2/coop src/adventure/v2/combat src/app/api/adventure/v2/coop-boss`
5. 정적 검증: `npx tsc --noEmit`, `npm run check-images`, `npm run build`
6. `git diff --check`, `git status --short`, 변경 파일 및 커밋 목록을 확인해 사용자 작업인 `docs/superpowers/plans/2026-08-19-tier7-capstone-combat-packages.md`가 포함되지 않았음을 검증한다.
7. 완료 검증 결과를 반영한 최종 커밋: `feat: complete tier 6 hard coop bosses`

## 완료 조건

- 신규 두 보스가 같은 6T HARD 단계로 소환·공개·공격·보상 수령 가능하다.
- 페이즈는 70%·40%에서 다음 공격부터 적용되고 피해 상한·무적·DB 스키마 변경이 없다.
  운영 재보정 시 일회성 데이터 마이그레이션이 활성 세션의 HP·기여 비율을 보존한다.
- 신규 6종 장비와 두 3부위 세트가 모든 직업에서 사용할 수 있으며 boots 충돌로 동시 3세트 완성이 불가능하다.
- 두 세트의 핵심 기믹이 PvE/PvP에서 동일하게 동작하고 다른 보호막으로 빙호수호가 오발동하지 않는다.
- HARD 산군과 동일한 주화 수량 및 지정된 재료·상자·확정타 보상이 적용된다.
- 새 이미지가 없고 기존 스콜피온/호수 이미지만 참조한다.
- 관련 테스트, 타입 검사, 이미지 검사, 프로덕션 빌드가 모두 통과한다.
