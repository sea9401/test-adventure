# v2 ATB 스킬 시전 배선 계획 (조사·설계)

## 1. 발견 — 라이브에서 직업 액티브 스킬이 발동하지 않는다

라이브 게임은 PvE·PvP 모두 ATB 엔진(`V2_CORE_LOOP_V2=true`, .env.production 확인)으로 돈다.
그런데 **ATB 경로는 v2 로드아웃 액티브 스킬을 단 한 번도 시전하지 않는다.**

### 근거 (정적 콜그래프 + 실측)

- `resolveV2SkillCast`(= v2 로드아웃 액티브 시전 함수, combatShared.ts:603)의 비-테스트 호출처:
  - `engine.ts:1508` (플레이어) / `engine.ts:1874` (몹) → **둘 다 `resolveBattleLegacy`(플래그 off, 라이브 아님) 안**
  - `engine-pvp.ts:1592` → `castV2SkillOnAttackerTurnPvP` → **`resolveBattlePvPLegacy`(라이브 아님) 안**
- 라이브 경로:
  - PvE: `resolveBattle` → `resolveBattleAtb` → 액션마다 `resolvePlayerPhase`(평타+패시브). **cast 호출 0건.**
  - PvP: `resolveBattlePvP` → `resolveBattlePvPAtb` → `advanceTurnPvP`(engine.pvpPhase.ts, 평타 헬퍼). **cast 호출 0건.**
- 코드 주석에 명시: engine.atb.ts:276 / engine.pvp-atb.ts:220 *"Phase-1/2 limitation: player v2 skill cast is not split out of legacy ... ATB bundles reuse the attack phase helper only."*
- **실측**: 난격 로드아웃 + proc 굴림 강제통과로 ATB 전투를 끝까지(로그 63건) 돌려도 캐스트 0건. 같은 로드아웃을 `resolveV2SkillCast`에 직접 넣으면 정상 발동.

### 라이브 작동 현황

| 기능 | 라이브 PvE(ATB) | 라이브 PvP(ATB) |
|---|---|---|
| 평타 + 직업 **패시브** | ✅ | ✅ |
| 원소 통달 패시브 / 양방향 속성(#879) | ✅ (atk 베이크 + enemyPhase) | ✅ |
| **직업 액티브 스킬 시전** (속성 마법·심판의 빛·마검 일섬·난격·… 전부) | ❌ | ❌ |
| 몹 v2 스킬 시전 (homeland 2몹: v2_skill_strike/dash) | ❌ | — |

## 2. 근본 원인

ATB 재설계가 `advanceTurn`(monolithic)을 phase helper(`resolvePlayerPhase`/`resolveEnemyPhase`)로 쪼개
ATB 타임라인 루프가 그것들을 액션 단위로 호출하게 했다. 그러나 **cast+효과적용 블록(약 engine.ts:1508~1864)은
`resolveBattleLegacy`에 그대로 남았고, phase helper로 옮겨지지 않았다.** PvP도 동일 구조(cast는
`castV2SkillOnAttackerTurnPvP`에 남고 `advanceTurnPvP` helper엔 없음).

## 3. 핵심 시맨틱 (legacy 기준 — ATB가 맞춰야 할 동작)

- **cast XOR attack**: 스킬이 proc하면 그 행동(턴)은 시전으로 소진, 평타 없음 (engine.ts:1834-1864).
  `#881` 몹 더블어택 fix의 `skipEnemyBasicAttack` 패턴을 **플레이어 쪽에 미러**하면 됨.
- **buff/debuff tick은 ATB가 이미 함** (`tickPlayerBundleEntry`, engine.atb.ts:145-146). legacy는 cast 블록
  안에서 tick하지만 ATB는 번들 진입에서 tick함 → **추출 헬퍼는 tick 없이 cast+적용만** 해야 이중 tick 방지.
- **cadence**: legacy는 "턴당 1회 proc 판정". ATB는 "플레이어 액션당 1회" → 빠른 빌드가 더 자주 시전(속도-일관).

## 4. 수정 전략

`resolveBattleLegacy`의 cast+효과적용 블록(tick 이후 ~ XOR 직전)을 공유 헬퍼로 추출:

```
castPlayerV2Skill(state, player, playerName): { state, castFired }
  // resolveV2SkillCast + 데미지/힐/마나/HP비용/버프/디버프/도트/취약·실명·암흑(applySkillTempBuffs)
  //   + MP 환급 + 쿨다운 + skillDmgPctPerCast + 로그. tick은 안 함(호출부 책임). 턴종료도 안 함(호출부 책임).
```

호출부:
- **legacy**: tick을 헬퍼 앞으로 빼고 헬퍼 호출 → `castFired`면 기존 finishPlayerTurn+continue. **byte-identical 유지.**
- **ATB PvE** (engine.atb.ts 플레이어 분기, `tickPlayerBundleEntry` 직후): 헬퍼 호출 →
  `castFired`면 평타 while-루프 스킵하고 `playerNextTick += actionInterval(...)`. 아니면 기존 평타.
- **ATB PvP**: `castV2SkillOnAttackerTurnPvP` 동등 추출 → `resolveBattlePvPAtb`의 advanceTurnPvP 루프 앞에 동일 패턴.

## 5. PR 분해

- **PR-A (순수 리팩터, 행동변화 0)**: legacy cast 블록 → `castPlayerV2Skill` 헬퍼 추출, legacy가 호출.
  골든(legacy 경로) **byte-identical** 이어야 통과. 안전 기반.
- **PR-B (PvE ATB 배선)**: 헬퍼를 `resolveBattleAtb`에 배선(cast XOR attack). **⚠️ 라이브 PvE 동작 변경.**
  combatAtb.test에 "ATB+로드아웃 시전" 골든 케이스 추가(신규 스냅샷 = 새 동작 락).
- **PR-C (PvP ATB 배선)**: PvP cast 헬퍼 추출 + `resolveBattlePvPAtb` 배선. combatPvpAtb 골든 추가.
- **PR-D (선택, 낮은 우선순위)**: 몹 v2 스킬 cast ATB 배선(enemyPhase). homeland 2몹 + coop 보스. #883 몹 스킬
  속성이 이 2몹에 한해 inert였던 것도 해소.
- **PR-E**: 원래 PR3 작업 — 속성 마법 **바람(자기 다음행동 ms↓)·대지(적 다음행동 ms↑)** ATB nudge.
  PR-B 위에서만 의미가 생김(시전이 ATB에 존재해야 nudge 트리거 가능). 화상 치유감소도 여기서.

## 6. 밸런스 · 롤아웃 리스크

- 액티브가 **PvE에서 처음으로 발동** → 플레이어 실효 DPS·CC 상승. 모든 PvE 페이싱/난이도에 영향.
- cadence가 액션당이라 빠른 빌드(SPD)가 시전 빈도 이득까지 → SPD 가치 추가 상승(이미 DEX 독주 이슈와 맞물림).
- **결정(오너)**: PR-B를 임시 플래그 `V2_ATB_SKILLS`로 게이팅 — 기본 off → 라이브 무변. 골든/실측을
  플래그로 분리 검증한 뒤 ON 배포. (V2_MATERIALS_ENABLED / V2_CORE_LOOP_V2 와 같은 패턴.) 배포 후
  `/admin` 밸런스 탭(텔레메트리)로 깊이/직업/전투력 분포 관찰하며 재튜닝. 검증 후 PR-6식 무조건화로 플래그 제거.

## 7. 테스트 계획

- 골든(combatGolden = legacy 경로, 플래그 unset): PR-A 후 **무변(byte-identical)**.
- combatAtb.test / combatPvpAtb.test: 로드아웃 시전 케이스 추가 → 신규 스냅샷.
- 신규: ATB cast XOR attack 단위 테스트(시전 턴엔 평타 없음, 시전 효과가 state에 반영).
- Codex 리뷰 1회/PR.

## 8. 영향받는 기존 작업

- 그동안 설계·배포한 모든 직업 액티브(원소술사 속성 마법, 성기사 심판의 빛, 마검사 마검 일섬 등)는
  PR-B/C 전까지 라이브에서 inert였음 → 이 작업으로 비로소 라이브화.
- #883 몹 스킬 속성: homeland 2몹의 스킬 cast 자체가 ATB에서 안 떠 부분 inert → PR-D로 해소.
