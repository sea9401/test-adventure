# v2 두 출혈(DoT) 시스템 통합 계획

## 배경 — DoT가 두 갈래로 갈라져 있다

v2 전투의 지속 피해(DoT)는 라벨이 "출혈"로 겹치지만 완전히 분리된 두 코드 경로로 돈다.

### 갈래 A — `V2Dot` 리스트 (스킬 캐스트 DoT)
- 저장: `state.playerV2Dots[]` / `state.enemyV2Dots[]` (라벨별 다중 entry)
- 강도: 정액 `dmgPerTurn` × 고정 `turns`, 같은 라벨 재부여 시 **refresh**
- 틱: 해당 측 페이즈 진입 시 (`tickV2Dots`, `combatShared.ts`)
- 출처: 스킬 effect `{ kind: "dot" }` (폭풍화살 출혈 / 비전노바 소각 / 그림자일격 중독 / 몹 스킬)
- 외부 의존: 없음 (HP만 차감)

### 갈래 B — `bleedStacks` 스택 풀 (패시브·부여·affix DoT)
- 저장: `state.stacks.bleedStacks` (단일 정수, 캡 `BLEED_MAX_STACKS=10`)
- 강도: 스택 × 스택당 피해 = 정액(`bleedDmgPerStack`) + 독공(`enchantVenomDmgPerStack` → 적 최대HP 비례)
- 틱: 적 페이즈 진입 시만 (`engine.ts` bleed tick)
- 누적: 적중 시 +1 스택 (평타·스킬·`apply_bleed` AP·독공 확률)
- 출처: 직업 패시브(검투사 유혈 / 혈권 내상 / 독사 맹독) + trait 성장 + 별빛 독공 부여
- **외부 의존 있음**: 부식(`poisonedEnemyDefReductionPct` — `bleedStacks>0`이면 적 DEF −%), 혈광(`extraAttackChancePctWhileEnemyBleeding` — `bleedStacks>0`이면 추가타 +%)

`bleedStacks`는 이미 출혈·독공·부식(중독)이 **공유하는 단일 풀**이다. 충돌 지점은 "스킬 출혈(폭풍화살)이 별도 리스트 dot으로 따로 사는 것" 하나뿐. 중독/소각은 라벨이 달라 충돌 없음.

## 목표 (확정)
- **3종 status 분리 + 기계 통합**: 하나의 V2Dot 엔진(통합 entry·단일 틱) 위에서 출혈(bleed)/중독(poison)/소각(burn)을 **distinct tag** 로 분리. 한 풀로 뭉개지 않는다.
- **술어 정확 매핑**: 부식 → 중독(poison), 혈광 → 출혈(bleed).
- **범위**: PvE + PvP. 한기(chill, 적→플레이어 미러)는 이번 범위 밖.
- 결정 배경: 현재 한 풀에 정액 출혈(STR)과 %HP 독공이 섞여 있는데 원래 다른 피해 철학 → 병합보다 분리가 설계 의도에 맞음. 또 현재 한 풀이라 검투사 혈광이 독/독공 스택에도 오발동 → 분리로 정리.

## 행동 불변의 기준 — 골든마스터
`src/adventure/v2/combatGolden.test.ts` 가 `logSha = sha1(JSON.stringify(log))` 로 전투 로그 전체를 지문화한다. **로그 텍스트·순서·숫자·RNG 호출 순서가 1비트라도 바뀌면 깨진다.** → "행동 불변" 단계는 이 오라클이 기계적으로 보증한다.

## 단계 PR

### PR-1 — 표면 통합 (행동 불변) ← 현재
저장소·틱 사이트는 그대로 두고, 두 갈래가 **공유하는 공식·술어를 단일화**한다. 숫자·로그·순서 완전 불변 → 골든마스터 green이 자명.
1. `dotTickDamage(stacks, perStack)` — 모든 DoT 1틱 피해 공식(스택 × 스택당, 음수 클램프) 단일 출처. `tickV2Dots`(리스트)와 engine bleed tick 양쪽이 호출.
2. `isEnemyBleeding(state)` — "적 출혈 중?" 단일 술어. 부식·혈광이 `state.stacks.bleedStacks > 0` 직접 참조 대신 사용.
3. 두 시스템 관계를 코드 주석에 명시 + 본 문서.

> 저장소·틱사이트 통합은 로그 순서를 바꿔 골든마스터를 깨므로(행동 변경) PR-2로 미룬다.

### PR-2 — 3종 status 분리 + 기계 통합 (행동 변경, sim 재캘리브)
- `bleedStacks` 정수 + V2Dot 리스트를 **하나의 통합 V2Dot entry 모델**(tag·stacks·turns·정액/%HP)로 일원화, 단일 틱.
- tag 3종으로 분리:
  - **bleed**: 검투사 유혈 + 혈권 내상 + 스킬 폭풍화살
  - **poison**: 독사 맹독 + 별빛 독공(venom %HP) + 스킬 그림자일격
  - **burn**: 스킬 비전노바
- 술어 분리: 부식 → `isEnemyPoisoned`(poison), 혈광 → `isEnemyBleeding`(bleed). PR-1의 단일 술어를 쪼갬.
- **의도된 행동 변경**: ①혈광이 더는 독/독공 스택에 발동 안 함(현재 한 풀이라 오발동 중) ②스킬 중독이 poison 풀 합류 → 부식 트리거(직관 일치) ③독공·맹독이 bleed→poison 으로 재배치.
- → `sim-v2-progression --skills` 재캘리브, **독사 outlier 재측정과 한 묶음**(독사가 poison 풀 최대 이해당사자).
- 순서: PR-1으로 "기계 dedup=무변동"을 못 박은 뒤 PR-2의 의도된 변동만 sim 으로 본다.

### PR-3 — PvP 패리티
- `engine-pvp.ts`의 `bleedStacksOnOpponent` + `v2Dots`를 같은 모델로. PvP sim/스파링 검증.

## 미룬 것
- 한기(chill): 술어/타입은 공유 가능하게 열어두되 틱 시점(적 페이즈)·DEF부분감산·받피감·인내 로직은 이번에 안 건드림.
- 로그 텍스트 통일: 갈래별 문구가 달라 골든마스터에 잡힘 → PR-2(행동 변경)에서 함께.
