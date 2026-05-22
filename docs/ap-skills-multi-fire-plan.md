# AP 스킬 한 턴 멀티 발동

## 배경

기존: 한 턴 첫 공격에 AP 스킬 1개만 발동 (`apSkillFiredThisTurn` 단일 게이트). 각성(awaken)
마법부여로 AP 수급이 늘면서 "AP 가 꽉 차도 한 턴 한 번만 쓴다"는 제약을 푼다.

발동은 원래도 "턴 첫 공격"에 전부 몰려 처리된다(후속 공격은 발동 안 함). 그래서 이 변경은
**첫 공격에서 1개 → 첫 공격에서 최대 N개**로의 확장이며, 발동 타이밍 구조는 그대로 둔다.

## 정책 (확정)

- 한 턴 최대 **3개** 발동 (`AP_SKILLS_PER_TURN_CAP = 3`).
- 그중 **공격형(배수형) 스킬은 최대 1개**. 나머지는 유틸로 채운다.
  - 공격형 = effect.kind ∈ { `atk_multiplier`, `multi_hit_self_damage`,
    `atk_multiplier_with_silence`, `atk_plus_spd_pct_bonus` }.
  - 데미지 결합 규칙을 새로 만들 필요가 없다(한 공격에 배수는 1개만 곱해짐).
- 발동 후보는 **슬롯 순서** 우선. cap/공격형제한/AP affordability 로 필터.
- AP affordability 는 **누적**으로 차감(앞 스킬이 쓴 만큼 다음 스킬 예산 감소).
- condition(트리거) 평가는 기존과 동일하게 **발동 전 원본 state** 기준.
- 발동/소비/효과는 전부 그 턴 첫 공격 명중에 처리(회피 시 발동·소비 없음 — 기존 동일).

## 공유 헬퍼 (combatShared.ts)

```ts
export const AP_SKILLS_PER_TURN_CAP = 3;

export function isOffensiveApEffect(effect: APSkillEffect): boolean {
  return (
    effect.kind === "atk_multiplier" ||
    effect.kind === "multi_hit_self_damage" ||
    effect.kind === "atk_multiplier_with_silence" ||
    effect.kind === "atk_plus_spd_pct_bonus"
  );
}

// 슬롯 순서로 발동할 스킬 선택. canFire = engine 별 condition 평가 콜백(원본 state 기준).
// 공격형 최대 1개, 총 cap 개, AP 누적 affordability.
export function selectApSkillsToFire(
  equipped: ReadonlyArray<EquippedAPSkill>,
  ap: number,
  canFire: (e: EquippedAPSkill) => boolean,
): { offensive: APSkill | null; utility: APSkill[]; totalCost: number } {
  let budget = ap;
  let offensive: APSkill | null = null;
  const utility: APSkill[] = [];
  let count = 0;
  for (const e of equipped) {
    if (count >= AP_SKILLS_PER_TURN_CAP) break;
    if (e.skill.apCost > budget) continue;
    if (!canFire(e)) continue;
    const off = isOffensiveApEffect(e.skill.effect);
    if (off && offensive) continue; // 공격형 1개 제한 — 다음 후보로
    if (off) offensive = e.skill;
    else utility.push(e.skill);
    budget -= e.skill.apCost;
    count++;
  }
  return { offensive, utility, totalCost: ap - budget };
}
```

`EquippedAPSkill` 타입은 engine.ts 에 있으므로 type-only import.

## 엔진 변경 (engine.ts PvE, engine-pvp.ts PvP — 대칭)

기존 단일 `apSkillFires` 를 둘로:

- `apOffensiveFires: APSkill | null` — 그 공격의 배수/관통/회피무시/hits/storm/madslash자해/
  silence 를 구동. `extractApEffect(apOffensiveFires?.effect)` 그대로 사용.
- `apUtilityFires: APSkill[]` — 즉발/시한부/큐잉 효과 집계.

선택부:
```ts
const apSel =
  isFirstAttackOfTurn &&
  state.turn.apSkillFiredThisTurn === null &&
  (player.equippedAPSkills?.length ?? 0) > 0
    ? selectApSkillsToFire(player.equippedAPSkills!, state.ap, (e) =>
        evaluateAPSkillCondition(e.condition, state, e.skill),
      )
    : { offensive: null, utility: [], totalCost: 0 };
const apOffensiveFires = apSel.offensive;
const apUtilityFires = apSel.utility;
const apAllFired = apOffensiveFires ? [apOffensiveFires, ...apUtilityFires] : apUtilityFires;
```

집계 규칙:
- AP 차감: `nextApAfter = max(0, min(AP_CAP, ap+1) - apSel.totalCost)`.
- 시한부 버프: `apAllFired` 를 fold — `let nextBuffsTimed = state.buffs; for (const sk of apAllFired) nextBuffsTimed = applyTimedBuffFromApSkill(nextBuffsTimed, sk);` (silence 는 공격형 thunder 가 여기로). 회피 분기는 발동 전 return 이라 무관.
- heal_pct / apply_bleed / add_guaranteed_evades: `apAllFired` 중 해당 kind 의 값을 **합산**.
- extra_attack_this_turn(combo) / queued_extra_attacks_next_turn / block_next_enemy_attack:
  해당 kind 값을 **합산**(같은 스킬 중복은 없지만 회복·출혈·무효는 별빛 변주와 동시 슬롯 가능).
- crit_buff_next_attack: 해당 스킬 1개의 critDmgBonusPct(없으면 0).
- cleanse_debuffs: `apAllFired` 중 하나라도 있으면 cleanse.
- mad slash 자해 / storm bonus: `apOffensiveFires` 의 effect 로만(공격형 1개라 단일).
- 로그: 기존 if/else 단일 dispatch → `apAllFired` 루프로 스킬별 로그 emit. labels 도 모든 발동 스킬 push.
- `apSkillFiredThisTurn` 세팅: `apOffensiveFires?.id ?? apUtilityFires[0]?.id ?? state.turn.apSkillFiredThisTurn`. 후속 공격은 `=== null` 체크로 자연히 재발동 차단.

## 테스트

기존 단일발동 케이스 보존(슬롯 1개면 동작 동일). 추가:
- 회복술+별빛회수 동시 슬롯 → 한 턴 둘 다 발동, 회복 합산, AP 누적 차감.
- 공격형 2개 슬롯(천살+그림자베기) → 한 턴 1개만 공격형 발동, 두 번째는 미발동(또는 유틸만).
- cap 3 초과(유틸 4개 슬롯) → 3개만.
- 슬롯 순서/AP 부족으로 일부만 발동.
- PvP 대칭 케이스.
