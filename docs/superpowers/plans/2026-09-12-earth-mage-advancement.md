# 대지 마법사 5·6차 구현 계획

**Goal:** 승인된 지맥술사·지각술사와 보호막 기반 공방 스킬을 실제 전투에 연결한다.

**Architecture:** 화염 계보처럼 스킬 카탈로그를 별도 파일로 분리한다. 보호막 생성은 공용 시전 결과에서 강화하고, 조건부 직접 마법 피해는 공용 계산 함수를 PvE/PvP의 기존 증폭 지점에서 호출한다.

**Tech Stack:** TypeScript, Vitest, 기존 Next.js 16 프로젝트. 프레임워크 변경 없음.

## 제약

- 기존 4차와 공용 보호막 누적·소진 규칙 유지. 다른 직업에서도 장착 효과 적용.
- 보호막 출처와 무관한 시전 전 잔량 조건. 생성량 강화는 직접 스킬 보호막에 한정.
- 신규 조건부 보너스는 범용 마법 피해와 가산, 빙결·DoT·물리 피해 제외.
- 현재 작업 브랜치에 변경·커밋을 남긴다. 서브에이전트·배포·푸시 없음.

## 1. 계보와 공용 패시브

- [x] `earthMageAdvancement.test.ts`에서 해금 경계, 저장/교관/수행 연결, 다른 직업의 실제 저장 파생과 표시·비용 검증을 작성한다.
- [x] `npm test -- src/adventure/data/v2/earthMageAdvancement.test.ts`로 미등록 직업·패시브 실패 확인.
- [x] `earthMageSkills.ts`에 액티브 2개·패시브 4개를 정의하고 `v2JobCatalog.ts`, `v2SkillsByJob.ts`, `v2Skills.ts`에 등록한다.
- [x] `skillShieldPowerPct`, `shieldedMagicSkillDamagePct`를 장착 집계와 `derivePlayerCombatV2.ts`, `engineState.ts`로 전달한다.
- [x] 패시브 SP에 각각 `/20`, `/16` 평가를 추가하고 상세 칩을 표시한다. 액티브 보호막 조건부 증폭은 직접 마법 피해 가치에 50% 실현율로 평가한다.

```ts
expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { earthmage: 17999 } })).toBe(false);
expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { earthmage: 18000 } })).toBe(true);
expect(derived.player.skillShieldPowerPct).toBe(30);
expect(derived.player.shieldedMagicSkillDamagePct).toBe(20);
```

## 2. 실제 보호막·피해

- [x] `earthMageCombat.test.ts`에 실제 시전으로 HP/MP 보호막 강화, 0/1/큰 보호막, 같은 시전의 생성, 소진 후 재시전, MP 부족, PvP 양측 비교를 추가하고 실패 확인.
- [x] `combatShared.ts`의 `shieldToApply`에 새 생성량 배율을 한 번 적용한다. `engine.ts`와 `engine-pvp.ts`에서 파생 패시브를 시전 입력으로 전달한다.
- [x] `shieldedMagicDamage.ts`의 `directMagicSkillDamageBonus`로 범용·조건부·스킬 자체 보너스를 합산한다. 입력은 직접 마법 피해, 기존 범용 퍼센트, 보호막 잔량, 패시브 퍼센트, 스킬 퍼센트다. 출력은 정수 추가 피해다.
- [x] 두 엔진의 기존 직접 마법 증폭 계산을 공용 함수로 연결한다. 빙결의 별도 계산은 유지한다.

```ts
expect(directMagicSkillDamageBonus({ damage: 100, shield: 1, basePct: 10, passivePct: 20, skillPct: 20 })).toBe(50);
expect(directMagicSkillDamageBonus({ damage: 100, shield: 0, basePct: 10, passivePct: 20, skillPct: 20 })).toBe(10);
```

## 3. 검증과 마무리

- [x] 신규·기존 원소·보호막·마법·파생·직업 테스트와 타입 검사 실행. 직업 총수/해금 SP 기대값은 실제 추가된 계보에 맞게 갱신한다.
- [x] 같은 예산의 화염·냉기·대지 구성을 여러 적/PvP에서 비교하는 재현 가능한 시뮬레이션을 실행하고 피해·생존·보호막·MP·행동 수를 기록한다.
- [x] 변경 파일 린트, diff 검증, 자체 코드 리뷰. 설계 문서에 실제 SP·MP·발동률과 검증 결과를 기록한다.
- [x] 요청 범위의 파일만 커밋한다.

## 실행 결과

- 기존 화염 기준 테스트 23개 통과 후 신규 테스트 18개가 미등록/미적용으로 실패하는 것을 확인했다.
- 최종 신규 테스트 35개 통과. 전투·데이터·서버 파생 회귀 251개 파일, 3,097개 테스트 통과(이후 추가한 MP 경계 2개는 최종 신규 테스트 실행에 포함).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --incremental --tsBuildInfoFile /tmp/earth-mage-tsbuildinfo` 통과.
- 변경 TypeScript 파일 ESLint, `npm run check-module-budgets`, `git diff --check` 통과.
- 공통 산식의 확정 비용은 지맥 융기 10 SP/125 MP/52%, 천지 붕괴 11 SP/140 MP/41%. 보호막 생성·패시브 수치는 설계대로 유지.
- 동일 30 SP의 두 발동률 설정으로 4,800회 시뮬레이션. 확률 적용 2,400회를 다시 실행해 동일 결과 확인. 상세 결과는 `docs/superpowers/specs/2026-09-12-earth-mage-combat-comparison.md`에 기록.
- 자체 리뷰에서 시전 전 잔량, 기존 마법 보너스와 가산, 빙결·DoT 제외, 보호막 단일 증폭, PvP 보정, 기존 직업 유지와 범용 장착을 확인했다.
