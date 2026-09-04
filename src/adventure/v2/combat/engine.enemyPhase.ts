import {
  appendLog,
  applyEnemyDamage,
  applyBerserkerHostileDamage,
  applyCounterIfAny,
  playerPveEvasionReductionPct,
  finishEnemyAttack,
  playerFacingEnemyDef,
  recordEnemyDamage,
  type BattleLogEntry,
  type BattleState,
  type PlayerCombat,
} from "./engine";
import type { Monster } from "@/adventure/data/monsters";
import {
  damageBetween,
  damageToMagicDefender,
  damageToDefender,
  healingAfterReceivedMultiplier,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import {
  lowHpDamageReductionPct,
  healToShield,
  onDodgeSpeedBuff,
  onHitTakenDefGain,
  resolveTrackedShieldAbsorption,
  statusBlockOnce,
  trackedShieldBreakEffect,
} from "./signatureEffects";
import {
  applyEvasionDamageReduction,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  magicBarrierCombatLogEntries,
  resolveMagicBarrierDamage,
} from "./magicBarrier";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import {
  consumeReactiveDefenseCharges,
  ironWallDamageReductionPct,
  resolveFortressReaction,
} from "./fortressKnight";
import { releaseSwordShadow } from "./shadowBladeCombat";
import { recordChargeHpLoss } from "./ruinBladeCombat";
import {
  consumePurificationWard,
  resolveTripleWardDamage,
  TRIPLE_WARD_LABELS,
  tripleWardStabilityReductionPct,
} from "./tripleWard";
import { effectiveMutationDef } from "./mutationCombat";

// 치명형 몹(SPI PR-3b) 기본 치명 배수 — Monster.critMult 미지정 시. 플레이어 CRIT_MULT_BASE(1.4)
//   보다 약간 높게 둬 "치명 위협" 체감(잡몹은 critPct 0 이라 무관).
const MONSTER_CRIT_MULT_DEFAULT = 1.5;

export function releaseSwordShadowAfterEnemyAction(
  state: BattleState,
): BattleState {
  const swordShadow = state.stacks.tier7?.swordShadow;
  if (!swordShadow) return state;
  const released = releaseSwordShadow(swordShadow, {
    nextSingleDamagePct: 15,
  });
  const shadowDamage = Math.min(state.enemyHp, released.damage);
  const damagedState = applyEnemyDamage(state, released.damage);
  return {
    ...damagedState,
    stacks: {
      ...state.stacks,
      tier7: {
        ...state.stacks.tier7,
        swordShadow: undefined,
        shadowFollowUpPct: released.followUpPct,
        shadowReleaseHastePct: swordShadow.refined ? 20 : 0,
      },
    },
    log: appendLog(state.log, {
      kind: "player_attack",
      effect: "extra_damage",
      text: `[검영] ${state.enemy.name}에게 ${shadowDamage} 지연 피해.`,
    }),
  };
}

export type EnemyPhaseDamagePolicy = {
  bypassPlayerShield?: boolean;
};

// 적 페이즈 전체 — advanceTurn 에서 플레이어 페이즈(평타·스킬)와 분량을 가르기 위해 분리한다.
// 한기 틱 → 잔상(AP 블록) → 회피 캐스케이드(그림자보법·보장회피·%회피·별빛가드·흘려막기·
// 행운의방패) → 적 데미지 적용(반사·반격·보호막) 순. 이 구간의 지역 상태(evadeHeal·무한가시·
// 반사회피 추정데미지 등)는 전부 이 함수 안에 갇혀 advanceTurn 으로의 변수 threading 이 0이다.
// 동작은 advanceTurn 인라인이던 시절과 1비트도 다르지 않다(combatGolden 적 페이즈 매트릭스 가드).
export function resolveEnemyPhase(
  state: BattleState,
  basePlayer: PlayerCombat,
  playerName: string,
  enteringEnemyPhase: boolean,
  // 몹이 이 턴 스킬을 시전했으면 평타 생략(스킬이 평타 대체 — 플레이어 대칭). 한기 틱 뒤 분기.
  skipBasicAttack: boolean = false,
  // 도발로 즉시 발생한 공격은 몬스터 고유 스킬 없이 기본 공격 판정만 수행한다.
  forceBasicAttack: boolean = false,
  damagePolicy: EnemyPhaseDamagePolicy = {},
): BattleState {
  const effectiveDef = effectiveMutationDef(
    basePlayer.def,
    state.stacks.mutationWeight,
    basePlayer.stoneskinDefPctPerWeight ?? 0,
  );
  const player =
    effectiveDef === basePlayer.def
      ? basePlayer
      : { ...basePlayer, def: effectiveDef };
  const applyTier6Dodge = (next: BattleState): BattleState =>
    next.stacks.tier6Uniques
      ? applyTier6UniquePveEvent(next, player, {
          kind: "dodge",
          origin: {
            actionId: next.turn.enemyPhasesCompleted + 1,
            eventId: next.log.length,
          },
        })
      : next;
  // ── 한기 (chill) — 적 페이즈 시작 시 한기 스택당 고정 피해 (DEF·보호막 무시) ──────
  // 출혈의 미러. threshold 이상부터 발동. 스택은 적 chill 공격 적중 시 누적(아래 적 공격부).
  // 이미 몸에 스민 추위는 천뢰 일격 silence 와 무관하게 틱한다.
  const chillSkill =
    state.enemy.skill?.kind === "chill" ? state.enemy.skill : null;
  if (
    chillSkill &&
    enteringEnemyPhase &&
    chillSkill.dmgPerStack > 0 &&
    state.stacks.chillStacks >= chillSkill.threshold
  ) {
    // DEF 부분감산 — defMitigationFraction 만큼 플레이어 DEF 를 깎아낸다(미지정/0 = DEF 무시, 기존
    // 동작). 하한 1 — 아무리 DEF 가 높아도 한기는 최소 1 은 들어가 시간압 취지가 죽지 않는다.
    const chillSourceDamage = Math.max(
      1,
      state.stacks.chillStacks * chillSkill.dmgPerStack,
    );
    const chillBarrier = resolveMagicBarrierDamage({
      rawDamage: chillSourceDamage,
      durability: state.playerMagicBarrier ?? 0,
      absorbPct: player.magicBarrierAbsorbPct,
      efficiencyPct: player.magicBarrierEfficiencyPct,
      eligible: true,
      mitigateBody: (bodyRawDamage) => {
        if (bodyRawDamage <= 0) return 0;
        const chillDefCut = Math.round(
          player.def * (chillSkill.defMitigationFraction ?? 0),
        );
        const chillDmgRaw = Math.max(1, bodyRawDamage - chillDefCut);
        const chillDmgAfterResolve =
          state.buffs.playerDmgReductionTurnsLeft > 0 &&
          state.buffs.playerDmgReductionPct > 0
            ? Math.floor(
                chillDmgRaw *
                  (1 - state.buffs.playerDmgReductionPct / 100),
              )
            : chillDmgRaw;
        const endurePct = player.enchantEndurePct ?? 0;
        return Math.max(
          1,
          endurePct > 0
            ? Math.floor(chillDmgAfterResolve * (1 - endurePct / 100))
            : chillDmgAfterResolve,
        );
      },
    });
    const chillDmg = chillBarrier.hpBoundDamage;
    const afterChillHp = Math.max(0, state.playerHp - chillDmg);
    let chillLog = appendLog(state.log, {
      kind: "info",
      text: `[한기] ${chillSkill.name} — 추위가 ${chillDmg} 피해 (스택 ${state.stacks.chillStacks})`,
    });
    for (const entry of magicBarrierCombatLogEntries(chillBarrier)) {
      chillLog = appendLog(chillLog, entry);
    }
    let chilled: BattleState = {
      ...state,
      playerMagicBarrier: chillBarrier.durabilityLeft,
      stacks: {
        ...state.stacks,
        damageTakenThisCombat:
          state.stacks.damageTakenThisCombat + (state.playerHp - afterChillHp),
      },
      log: chillLog,
    };
    const survival = applyBerserkerHostileDamage(
      chilled,
      player,
      afterChillHp,
    );
    chilled = survival.state;
    if (survival.triggered && chilled.berserker) {
      chilled = {
        ...chilled,
        berserker: finishBerserkerCurrentActionGuard(chilled.berserker),
      };
    }
    if (chilled.playerHp <= 0) {
      return {
        ...chilled,
        log: appendLog(chilled.log, {
          kind: "info",
          text: `${playerName}이(가) 얼어붙어 쓰러졌다...`,
        }),
        phase: "ended",
        outcome: "lose",
      };
    }
    state = chilled;
  }

  // ── 저주 (curse) — 임계 이상 누적되면 적 페이즈 시작에 폭발 후 일부 소모 ──────
  // 한기보다 공격적이다. 폭발 피해는 magicDef 로 부분 감산되고, 남은 스택은 아래 평타 피해 증폭에
  // 사용된다. 오래 맞아 버티는 빌드도 마법방어/상태방어 없이 무한 버티지 못하게 하는 레이드 압박.
  const curseSkill =
    state.enemy.skill?.kind === "curse" ? state.enemy.skill : null;
  if (
    curseSkill &&
    enteringEnemyPhase &&
    curseSkill.dmgPerStack > 0 &&
    state.stacks.curseStacks >= curseSkill.threshold
  ) {
    const curseStacksBefore = state.stacks.curseStacks;
    const curseMagicDefCut = Math.round(
      (player.magicDef ?? 0) * (curseSkill.magicDefMitigationFraction ?? 0),
    );
    const curseDmgRaw = Math.max(
      1,
      curseStacksBefore * curseSkill.dmgPerStack - curseMagicDefCut,
    );
    const curseDmgAfterResolve =
      state.buffs.playerDmgReductionTurnsLeft > 0 &&
      state.buffs.playerDmgReductionPct > 0
        ? Math.floor(curseDmgRaw * (1 - state.buffs.playerDmgReductionPct / 100))
        : curseDmgRaw;
    const endurePct = player.enchantEndurePct ?? 0;
    const curseDmgAfterEndure =
      endurePct > 0
        ? Math.floor(curseDmgAfterResolve * (1 - endurePct / 100))
        : curseDmgAfterResolve;
    const curseDmg = Math.max(1, curseDmgAfterEndure);
    const afterCurseHp = Math.max(0, state.playerHp - curseDmg);
    const curseStacksAfter = Math.max(
      0,
      curseStacksBefore - curseSkill.threshold,
    );
    let cursed: BattleState = {
      ...state,
      stacks: {
        ...state.stacks,
        curseStacks: curseStacksAfter,
        damageTakenThisCombat:
          state.stacks.damageTakenThisCombat + (state.playerHp - afterCurseHp),
      },
      log: appendLog(state.log, {
        kind: "info",
        text: `[저주] ${curseSkill.name} — 저주가 폭발해 ${curseDmg} 피해 (스택 ${curseStacksBefore}→${curseStacksAfter})`,
      }),
    };
    const survival = applyBerserkerHostileDamage(
      cursed,
      player,
      afterCurseHp,
    );
    cursed = survival.state;
    if (survival.triggered && cursed.berserker) {
      cursed = {
        ...cursed,
        berserker: finishBerserkerCurrentActionGuard(cursed.berserker),
      };
    }
    if (cursed.playerHp <= 0) {
      return {
        ...cursed,
        log: appendLog(cursed.log, {
          kind: "info",
          text: `${playerName}이(가) 저주에 삼켜져 쓰러졌다...`,
        }),
        phase: "ended",
        outcome: "lose",
      };
    }
    state = cursed;
  }

  // 몹 스킬 시전 턴 — 평타(다대시 포함) 전체 생략. 스킬이 이 턴의 공격이라 데미지/회피/반사 스킵.
  //   한기는 위에서 이미 틱. enemyAttacksLeft=1 로 두고 finishEnemyAttack → 잔여 평타까지 종료
  //   (스킬이 평타를 대체 = 플레이어와 대칭, 몹 스킬+평타 더블어택 버그 수정). 골든 몹은 스킬 미시전
  //   이라 skipBasicAttack 항상 false → 이 분기 미진입(byte-identical).
  if (skipBasicAttack) {
    return finishEnemyAttack({
      ...state,
      turn: {
        ...state.turn,
        enemyAttacksLeft: 1,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
    });
  }

  if (enteringEnemyPhase && state.turn.enemyAttacksLeft > 1) {
    state = {
      ...state,
      log: appendLog(state.log, {
        kind: "info",
        text: `${state.enemy.name}의 ${state.turn.enemyAttacksLeft}회 공격!`,
      }),
    };
  }

  // 잔상 (AP) — 큐가 활성이면 적 공격 1회 무효. 데미지·반사 모두 스킵, count -1.
  // 회피·반사 우선순위보다 위에 둠 — "잔상" 은 적이 허를 쳐서 빈 자리만 후려치는 결.
  // 다대시 보스라도 잔상은 그 중 1대만 막음 (남은 추가타는 정상 진행).
  if (state.buffs.enemyAttackBlockedCount > 0) {
    return finishEnemyAttack({
      ...state,
      buffs: {
        ...state.buffs,
        enemyAttackBlockedCount: state.buffs.enemyAttackBlockedCount - 1,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: appendLog(state.log, {
        kind: "info",
        text: `[잔상] ${state.enemy.name}의 공격이 잔상만 베어 갔다.`,
      }),
    });
  }

  // enemy phase — 그림자 보법 → 보장 회피 → % 회피 → 행운의 방패 → 데미지 (가드 적용) 순.
  // enemy phase 종료 시 enemyPhasesCompleted +1 (가드 카운터 진행).
  // 회피/방패 성공 시 곡예(특기) 장착이면 HP +evadeHealAmount.
  // 장비의 회피 경감 연동 회복은 소유자 행동 시작에 별도로 판정한다.
  const evadeHeal = player.evadeHealAmount ?? 0;
  const reducedEvadeHeal = healingAfterReceivedMultiplier(
    evadeHeal,
    player.receivedHealMult,
  );
  const healOnDodge = (hp: number): number =>
    reducedEvadeHeal > 0
      ? Math.min(state.playerMaxHp, hp + reducedEvadeHeal)
      : hp;
  // on-dodge 속도 버프(Phase 2) — 회피 성공 분기들이 next.buffs 로 쓸 값. 미발동=state.buffs
  //   그대로(Math.max 로 기존 버프 미감소) → byte-identical.
  const sigDodgeSpd = onDodgeSpeedBuff(player.equipSignatures);
  const dodgeSpdActiveMult =
    state.buffs.playerSpdTurnsLeft > 0 ? state.buffs.playerSpdMult : 1;
  const dodgeBuffs = sigDodgeSpd
    ? {
        ...state.buffs,
        playerSpdMult: Math.max(dodgeSpdActiveMult, sigDodgeSpd.mult),
        playerSpdTurnsLeft: Math.max(
          state.buffs.playerSpdTurnsLeft,
          sigDodgeSpd.turns,
        ),
      }
    : state.buffs;
  const appendDodgeSpeedBuffLog = (log: BattleLogEntry[]): BattleLogEntry[] =>
    sigDodgeSpd
      ? appendLog(log, {
          kind: "info",
          text: `[${sigDodgeSpd.label}] ${playerName}의 속도 +${Math.round((sigDodgeSpd.mult - 1) * 100)}% (${sigDodgeSpd.turns}행동)`,
        })
      : log;
  const dodgeFlags = player.skillCritAfterEvade
    ? { ...state.flags, skillCritAfterEvadePending: true }
    : state.flags;

  // 무한 가시 (2티어 특기) — 매 적 공격에 적 ATK 의 N% 반사 (회피/피격 무관).
  // 회피/피격 모든 분기에서 동일 적용 — helper 로 컴팩트하게.
  const infiniteThornsPct = player.infiniteThornsAtkPct ?? 0;
  const infiniteThornsDmg =
    infiniteThornsPct > 0
      ? Math.floor((state.enemy.atk * infiniteThornsPct) / 100)
      : 0;
  // 반사 회피 (2티어 특기) — 회피 성공 시 받았을 피해의 N 비율 반사. baseEnemyDmg 추정.
  // PR-5a: v2 buff/debuff 격리 해제 — 추정 데미지도 일관 적용 (적의 atk debuff + player def buff).
  // 마법형 몹(SPI PR-3a) — 이 몹의 공격이 마법방어(magicDef=정신)로 경감되는지. 실제 피해(아래
  //   defenseForAttack)와 반사회피 추정 피해 양쪽이 같은 기준을 쓰도록 여기서 한 번 계산.
  const magicAttack = state.enemy.atkType === "magic";
  const reflexEvadeMult = player.reflexEvadeMult ?? 0;
  const estimatedRawEnemyDmg = (() => {
    if (reflexEvadeMult <= 0) return 0;
    const effAtk = Math.max(
      0,
      state.enemy.atk + state.buffs.enemyAtkBonus - state.buffs.enemyAtkPenalty,
    );
    // PR-5b: enemy 의 self buff 도 합산 (monster v2 cast 결과).
    const v2AtkMultE = v2AtkBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const v2EffAtk = v2AtkMultE !== 1 ? Math.floor(effAtk * v2AtkMultE) : effAtk;
    // 마법 공격이면 추정도 마법방어 기준(물리 파이프라인 우회) — 실제 피해 분기와 일관.
    if (magicAttack) {
      return damageToDefender(v2EffAtk, Math.max(0, player.magicDef ?? 0));
    }
    const sk = state.enemy.skill;
    const pierced =
      sk?.kind === "pierce" ? Math.max(0, player.def - sk.armorPierce) : player.def;
    const playerDefVuln = state.enemy.playerDefVulnerable ?? 0;
    const effDef =
      playerDefVuln > 0 ? Math.round(pierced * (1 - playerDefVuln)) : pierced;
    const v2DefMultP = v2DefBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2EffDef = v2DefMultP !== 1 ? Math.floor(effDef * v2DefMultP) : effDef;
    return damageToDefender(v2EffAtk, v2EffDef);
  })();
  const reflexEvadeDmg =
    reflexEvadeMult > 0
      ? Math.floor(estimatedRawEnemyDmg * reflexEvadeMult)
      : 0;
  // 회피/무피격 분기에서 공통으로 적용할 반사 원량(무한 가시 + 반사 회피).
  // 최종 피해는 일반 공격과 같은 대상 방어력 공식을 거친다.
  const applyDodgeReflect = (
    log0: BattleLogEntry[],
    enemyHp0: number,
  ): { log: BattleLogEntry[]; enemyHp: number; killed: boolean; damage: number } => {
    const rawReflect = infiniteThornsDmg + reflexEvadeDmg;
    if (rawReflect <= 0) {
      return { log: log0, enemyHp: enemyHp0, killed: false, damage: 0 };
    }
    const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const targetDef = playerFacingEnemyDef(state, player);
    const totalReflect = damageBetween(
      rawReflect,
      v2DefMult !== 1 ? Math.floor(targetDef * v2DefMult) : targetDef,
    );
    let nextLog = log0;
    const labels: string[] = [];
    if (infiniteThornsDmg > 0) labels.push("무한 가시");
    if (reflexEvadeDmg > 0) labels.push("반사 회피");
    const newEnemyHp = Math.max(0, enemyHp0 - totalReflect);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${labels.join(" + ")}] ${state.enemy.name}에게 ${totalReflect} 반사 피해.`,
    });
    return {
      log: nextLog,
      enemyHp: newEnemyHp,
      killed: newEnemyHp <= 0,
      damage: totalReflect,
    };
  };

  // 그림자 보법 (2티어 특기) — 적 턴 시작 시 일정 확률로 그 턴 모든 적 공격 무효.
  const shadowStepPct = player.shadowStepPct ?? 0;
  if (shadowStepPct > 0 && Math.random() * 100 < shadowStepPct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[그림자 보법] ${playerName}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    });
    log = appendDodgeSpeedBuffLog(log);
    if (player.skillCritAfterEvade && !state.flags.skillCritAfterEvadePending) {
      log = appendLog(log, {
        kind: "info",
        text: `[흑월지배] 다음 직접 피해 스킬 치명타 준비.`,
      });
    }
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...recordEnemyDamage(state, reflect.damage),
        playerHp: healedHp,
        enemyHp: 0,
        flags: dodgeFlags,
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    // 그림자 보법은 그 턴 모든 적 공격 무효 — 다대시 보스라도 남은 추가타까지 모두 흘려보냄.
    let next: BattleState = {
      ...recordEnemyDamage(state, reflect.damage),
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      flags: dodgeFlags,
      buffs: dodgeBuffs, // on-dodge 속도 버프(미발동=state.buffs → byte-identical)
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        enemyAttacksLeft: 0,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    next = applyTier6Dodge(next);
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    next = counter.state;
    return { ...next, phase: "player" };
  }
  if (state.stacks.evadesRemaining > 0) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[회피 강화] ${state.enemy.name}의 공격을 회피했다!`,
    });
    log = appendDodgeSpeedBuffLog(log);
    if (player.skillCritAfterEvade && !state.flags.skillCritAfterEvadePending) {
      log = appendLog(log, {
        kind: "info",
        text: `[흑월지배] 다음 직접 피해 스킬 치명타 준비.`,
      });
    }
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...recordEnemyDamage(state, reflect.damage),
        playerHp: healedHp,
        enemyHp: 0,
        flags: dodgeFlags,
        stacks: {
          ...state.stacks,
          evadesRemaining: state.stacks.evadesRemaining - 1,
        },
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    let next: BattleState = {
      ...recordEnemyDamage(state, reflect.damage),
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      flags: dodgeFlags,
      buffs: dodgeBuffs, // on-dodge 속도 버프(미발동=state.buffs → byte-identical)
      stacks: {
        ...state.stacks,
        evadesRemaining: state.stacks.evadesRemaining - 1,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    next = applyTier6Dodge(next);
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }
  // 일반 회피도는 완전 회피 굴림을 만들지 않고 직접 피해 경감률로 작동한다.
  // 보장 회피·그림자 보법 등 명시적 완전 회피는 위쪽 분기에서 별도로 처리한다.
  const evasionReductionPct = playerPveEvasionReductionPct(state, player);
  // 별빛 가드(enchant guard) — 회피/럭키 방패 전에 굴리는 % 블록. 슬롯당 5~20% 누적.
  // 회피와 별개 라벨 — 회피는 비켜서고, 가드는 받아낸 다음 흩어 낸다.
  const enchantGuardPct = player.enchantGuardBlockPct ?? 0;
  if (enchantGuardPct > 0 && Math.random() * 100 < enchantGuardPct) {
    const log = appendLog(state.log, {
      kind: "info",
      text: `[가드] ${playerName}이(가) ${state.enemy.name}의 공격을 흩어 냈다!`,
    });
    return finishEnemyAttack({
      ...state,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log,
    });
  }
  // 흘려막기 (기사 시그니처) — 낮은 확률로 피해를 통째로 흘려낸다. enchant 가드와 동류 지점:
  // 회피·럭키 방패 계열과 나란히, 받아내기 전에 굴리는 % 완전 무효.
  const nullifyPct = player.damageNullifyChancePct ?? 0;
  if (nullifyPct > 0 && Math.random() * 100 < nullifyPct) {
    const log = appendLog(state.log, {
      kind: "info",
      text: `[흘려막기] ${playerName}이(가) ${state.enemy.name}의 공격을 흘려냈다!`,
    });
    return finishEnemyAttack({
      ...state,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log,
    });
  }
  // 행운의 방패 (특기) — 위 회피가 모두 실패해도 일정 확률로 피해 무효 (행운 회피).
  const luckyBlockPct = player.luckyShieldBlockPct ?? 0;
  if (luckyBlockPct > 0 && Math.random() * 100 < luckyBlockPct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[행운의 방패] ${playerName}이(가) ${state.enemy.name}의 공격을 흘려보냈다!`,
    });
    log = appendDodgeSpeedBuffLog(log);
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...recordEnemyDamage(state, reflect.damage),
        playerHp: healedHp,
        enemyHp: 0,
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    let next: BattleState = {
      ...recordEnemyDamage(state, reflect.damage),
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      buffs: dodgeBuffs, // on-dodge 속도 버프(미발동=state.buffs → byte-identical)
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    next = applyTier6Dodge(next);
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }

  // ── 잡몹 스킬 (적 공격에 영향) ──────────────────────────────────────────
  // 천뢰 일격 (AP) — silence 활성 중엔 enemy.skill 전체 효과 비활성.
  const skill =
    forceBasicAttack || state.buffs.enemySilenceTurnsLeft > 0
      ? undefined
      : state.enemy.skill;
  // 한기 누적 — chill 공격이 적중하면 perHit 만큼 스택. 적 HP 가 deepHpFraction 미만이면 2배(깊은 한기).
  // silence 중엔 누적 안 됨(skill 이 undefined). 실제 DoT 는 다음 적 페이즈 시작에 틱.
  const chillAdd =
    skill?.kind === "chill"
      ? state.enemyHp < state.enemy.hp * (skill.deepHpFraction ?? 0)
        ? skill.perHit * 2
        : skill.perHit
      : 0;
  const curseAdd =
    skill?.kind === "curse"
      ? state.enemyHp < state.enemy.hp * (skill.deepHpFraction ?? 0)
        ? skill.perHit * 2
        : skill.perHit
      : 0;
  const sigStatusBlock = statusBlockOnce(player.equipSignatures);
  const statusBlockChill =
    chillAdd > 0 && !!sigStatusBlock && !state.flags.statusBlockUsed;
  const statusBlockCurse =
    curseAdd > 0 && !!sigStatusBlock && !state.flags.statusBlockUsed;
  const purificationBlockChill =
    chillAdd > 0 &&
    !statusBlockChill &&
    state.stacks.tripleWard.purification > 0;
  const purificationBlockCurse =
    curseAdd > 0 &&
    !statusBlockCurse &&
    state.stacks.tripleWard.purification > 0;
  const effectiveChillAdd =
    statusBlockChill || purificationBlockChill ? 0 : chillAdd;
  const effectiveCurseAdd =
    statusBlockCurse || purificationBlockCurse ? 0 : curseAdd;
  // maxStacks 지정 시 상한 클램프 — 무한 누적 폭주 방지.
  const chillStacksNext =
    skill?.kind === "chill" && skill.maxStacks !== undefined
      ? Math.min(skill.maxStacks, state.stacks.chillStacks + effectiveChillAdd)
      : state.stacks.chillStacks + effectiveChillAdd;
  const curseStacksNext =
    skill?.kind === "curse" && skill.maxStacks !== undefined
      ? Math.min(skill.maxStacks, state.stacks.curseStacks + effectiveCurseAdd)
      : state.stacks.curseStacks + effectiveCurseAdd;
  // 격노 — 적 HP 가 maxHp×hpFraction 미만으로 떨어지는 순간 1회 발동, ATK +atkBonus (전투 종료까지 유지).
  const enrageReady =
    skill?.kind === "enrage" &&
    !state.flags.enrageTriggered &&
    state.enemyHp > 0 &&
    state.enemyHp < state.enemy.hp * skill.hpFraction;
  const enemyAtkBonus =
    enrageReady && skill?.kind === "enrage"
      ? state.buffs.enemyAtkBonus + skill.atkBonus
      : state.buffs.enemyAtkBonus;
  const enrageTriggered = state.flags.enrageTriggered || enrageReady;
  // 관통 — 잡몹 pierce 스킬의 고정 관통 먼저, 그 위에 보스 playerDefVulnerable 비례 관통.
  // 강체 (금강 시그니처) — 전투 내 누적 DEF 보너스를 기본 DEF 에 더해 진짜 방어력처럼 취급
  // (pierce/취약 곱연산 대상). 미보유면 braceDefBonus=0 → 무변.
  const defWithBrace = player.def + state.stacks.braceDefBonus;
  const pierced =
    skill?.kind === "pierce"
      ? Math.max(0, defWithBrace - skill.armorPierce)
      : defWithBrace;
  // 광기 (AP) — 자신 DEF -pct%. pierce 후, vulnerable 전에 곱연산.
  const piercedDebuffed =
    state.buffs.playerDefDebuffTurnsLeft > 0 && state.buffs.playerDefDebuffPct > 0
      ? Math.round(pierced * (1 - state.buffs.playerDefDebuffPct / 100))
      : pierced;
  const playerDefVuln = state.enemy.playerDefVulnerable ?? 0;
  const effectivePlayerDef =
    playerDefVuln > 0 ? Math.round(piercedDebuffed * (1 - playerDefVuln)) : piercedDebuffed;
  // 강타 — everyPhases 번째 적 페이즈마다 데미지 ×multiplier. 이번 페이즈 종료 후
  // enemyPhasesCompleted 가 N 의 배수가 되는지로 판단.
  const heavyBlowMult =
    skill?.kind === "heavy_blow" &&
    skill.everyPhases > 0 &&
    (state.turn.enemyPhasesCompleted + 1) % skill.everyPhases === 0
      ? skill.multiplier
      : 1;
  const heavyBlowFired = heavyBlowMult > 1;
  // 약점 분석(5티어)의 적 ATK 페널티는 raw atk 에 적용 → 0 클램프.
  const effectiveEnemyAtk = Math.max(
    0,
    state.enemy.atk + enemyAtkBonus - state.buffs.enemyAtkPenalty,
  );
  // PR-5a/5b: enemy 측 v2 buff/debuff 합산. PR-5b 부터 monster v2 cast 가능 → enemyV2SelfBuffs
  // 도 합산. player 의 v2 self buff/debuff 는 player.def 곱셈으로 반영.
  const v2AtkMultEnemy = v2AtkBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const v2DefMultPlayer = v2DefBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2EffectiveEnemyAtk = v2AtkMultEnemy !== 1 ? Math.floor(effectiveEnemyAtk * v2AtkMultEnemy) : effectiveEnemyAtk;
  const v2EffectivePlayerDef = v2DefMultPlayer !== 1 ? Math.floor(effectivePlayerDef * v2DefMultPlayer) : effectivePlayerDef;
  // 마법형 몹(SPI PR-3a) — 마법방어(magicDef=정신)로 경감. 물리방어 파이프라인(brace/pierce/취약/
  //   defDebuff/v2DefMult)을 우회하고 raw magicDef 만 적용(물리 방어 메커니즘은 마법에 무의미).
  //   피격 후 일반 감산(인내/받피감/가드/굳건/철벽)은 그대로 적용. 미지정/physical = 기존 경로.
  //   magicAttack 은 위(반사회피 추정)에서 이미 계산.
  const defenseForAttack = magicAttack
    ? Math.max(0, player.magicDef ?? 0)
    : v2EffectivePlayerDef;
  // 치명형 몹(SPI PR-3b) — critPct 굴려(플레이어 critResistPct=정신 차감) 적중 시 피해 ×critMult.
  //   heavy_blow 와 곱연산. 🔑 critPct 0(잡몹)이면 굴림 자체를 스킵 → RNG 스트림 불변(기존 전투
  //   byte-identical). 이 지점은 회피/가드/무효 분기를 모두 통과(=명중 확정)한 뒤라 헛굴림 없음.
  const effMonsterCritPct = Math.max(
    0,
    (state.enemy.critPct ?? 0) - (player.critResistPct ?? 0),
  );
  const monsterCritFired =
    effMonsterCritPct > 0 && Math.random() * 100 < effMonsterCritPct;
  const monsterCritMult = monsterCritFired
    ? (state.enemy.critMult ?? MONSTER_CRIT_MULT_DEFAULT)
    : 1;
  const preMitMult = heavyBlowMult * monsterCritMult;
  const barrierActive =
    (state.playerMagicBarrier ?? 0) > 0 &&
    (player.magicBarrierAbsorbPct ?? 0) > 0;
  const baseEnemyDmg = magicAttack
    ? damageToMagicDefender(v2EffectiveEnemyAtk, defenseForAttack)
    : damageToDefender(v2EffectiveEnemyAtk, defenseForAttack);
  const damageBeforeCurse =
    preMitMult !== 1
      ? Math.max(
          1,
          Math.floor(
            (barrierActive ? v2EffectiveEnemyAtk : baseEnemyDmg) * preMitMult,
          ),
        )
      : barrierActive
        ? v2EffectiveEnemyAtk
        : baseEnemyDmg;
  const curseDamageTakenPctRaw =
    skill?.kind === "curse"
      ? state.stacks.curseStacks * (skill.damageTakenPctPerStack ?? 0)
      : 0;
  const curseDamageTakenPct =
    skill?.kind === "curse" && skill.maxDamageTakenPct !== undefined
      ? Math.min(skill.maxDamageTakenPct, curseDamageTakenPctRaw)
      : curseDamageTakenPctRaw;
  const preDefenseDamage =
    curseDamageTakenPct > 0
      ? Math.max(
          1,
          Math.floor(damageBeforeCurse * (1 + curseDamageTakenPct / 100)),
        )
      : damageBeforeCurse;
  let rawDmgBeforeEvasion = 0;
  let rawDmgBeforeReduction = 0;
  let rawDmgAfterEnemyDamageDown = 0;
  let rawDmg = 0;
  let enduredDmg = 0;
  let passiveReduced = 0;
  let stabilityReduced = 0;
  let wardReduced = 0;
  let guarded = 0;
  let bodyDamage = 0;
  let nextTripleWard = state.stacks.tripleWard;
  let wardDamageReductionPct = 0;
  let wardDamageRemaining = state.stacks.tripleWard[
    magicAttack ? "magic" : "physical"
  ];
  const endurePct = player.enchantEndurePct ?? 0;
  const buffReducePct =
    state.stacks.skillDmgReduceTurns > 0 ? state.stacks.skillDmgReducePct : 0;
  const ironWallReducePct = ironWallDamageReductionPct(
    state.stacks.ironWallReflectCharges,
  );
  // 고유 시그니처(성물·Phase 2) — 저체력(HP≤임계%) 시 받피감 추가. 미장착/조건미충족=0 → byte-identical.
  const sigReducePct = lowHpDamageReductionPct(
    player.equipSignatures,
    state.playerHp,
    player.maxHp,
  );
  const openingMagicReducePct =
    magicAttack &&
    state.turn.enemyPhasesCompleted <
      (player.passiveOpeningMagicDamageReductionPhases ?? 0)
      ? (player.passiveOpeningMagicDamageReductionPct ?? 0)
      : 0;
  const passiveReducePct =
    (player.passiveDamageTakenReductionPct ?? 0) +
    openingMagicReducePct +
    buffReducePct +
    ironWallReducePct +
    sigReducePct;
  // 가드 — 첫 N번의 적 페이즈 동안 받는 피해 -reduction. 선공자에 무관하게
  // enemyPhasesCompleted 가 N 미만이면 이번 페이즈가 그 N 중 하나.
  const guard = player.guard;
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const magicBarrier = resolveMagicBarrierDamage({
    rawDamage: preDefenseDamage,
    durability: state.playerMagicBarrier ?? 0,
    absorbPct: player.magicBarrierAbsorbPct,
    efficiencyPct: player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) => {
      if (bodyRawDamage <= 0) return 0;
      rawDmgBeforeEvasion = barrierActive
        ? magicAttack
          ? damageToMagicDefender(bodyRawDamage, defenseForAttack)
          : damageToDefender(bodyRawDamage, defenseForAttack)
        : bodyRawDamage;
      rawDmgBeforeReduction = applyEvasionDamageReduction(
        rawDmgBeforeEvasion,
        evasionReductionPct,
      );
      rawDmgAfterEnemyDamageDown =
        state.stacks.enemyDamageDownTurns > 0 &&
        state.stacks.enemyDamageDownPct > 0
          ? Math.max(
              1,
              Math.floor(
                rawDmgBeforeReduction *
                  (1 - state.stacks.enemyDamageDownPct / 100),
              ),
            )
          : rawDmgBeforeReduction;
      rawDmg =
        state.buffs.playerDmgReductionTurnsLeft > 0 &&
        state.buffs.playerDmgReductionPct > 0
          ? Math.max(
              1,
              Math.floor(
                rawDmgAfterEnemyDamageDown *
                  (1 - state.buffs.playerDmgReductionPct / 100),
              ),
            )
          : rawDmgAfterEnemyDamageDown;
      enduredDmg =
        endurePct > 0
          ? Math.max(1, Math.floor(rawDmg * (1 - endurePct / 100)))
          : rawDmg;
      passiveReduced =
        passiveReducePct > 0
          ? Math.max(
              1,
              Math.floor(enduredDmg * (1 - passiveReducePct / 100)),
            )
          : enduredDmg;
      const stabilityPct = tripleWardStabilityReductionPct(nextTripleWard);
      stabilityReduced =
        stabilityPct > 0
          ? Math.max(
              1,
              Math.floor(passiveReduced * (1 - stabilityPct / 100)),
            )
          : passiveReduced;
      const ward = resolveTripleWardDamage(
        nextTripleWard,
        magicAttack ? "magic" : "physical",
        "pve",
        [stabilityReduced],
      );
      nextTripleWard = ward.state;
      wardReduced = ward.totalDamage;
      wardDamageReductionPct = ward.reductionPct;
      wardDamageRemaining = ward.remaining;
      guarded =
        guard &&
        guard.turns > 0 &&
        state.turn.enemyPhasesCompleted < guard.turns
          ? Math.max(0, wardReduced - guard.reduction)
          : wardReduced;
      bodyDamage =
        steadfastFlat > 0 ? Math.max(0, guarded - steadfastFlat) : guarded;
      return bodyDamage;
    },
  });
  const enduredApplied = enduredDmg < rawDmg;
  const passiveReduceApplied = passiveReduced < enduredDmg;
  const guardApplied = guarded < wardReduced;
  const steadfastApplied = bodyDamage < guarded;
  // 마나 채널과 경감된 몸통 피해를 합친 뒤 일반 보호막이 HP 직전에서 직접 피해를 흡수한다.
  const shieldAbsorbed = damagePolicy.bypassPlayerShield
    ? 0
    : Math.min(state.stacks.playerShield, magicBarrier.hpBoundDamage);
  const dmgToHp = magicBarrier.hpBoundDamage - shieldAbsorbed;
  const newShield = state.stacks.playerShield - shieldAbsorbed;
  const trackedShieldResolution = resolveTrackedShieldAbsorption({
    remaining: state.stacks.trackedSetShield ?? 0,
    totalShieldBefore: state.stacks.playerShield,
    shieldAbsorbed,
    alreadyTriggered: state.flags.trackedShieldBreakUsed ?? false,
  });
  const trackedShieldEffect = trackedShieldResolution.triggered
    ? trackedShieldBreakEffect(player.equipSignatures)
    : null;
  if (
    state.stacks.tier6Uniques &&
    state.stacks.playerShield > 0 &&
    newShield <= 0 &&
    shieldAbsorbed > 0
  ) {
    state = applyTier6UniquePveEvent(state, player, {
      kind: "shield_broken",
      shieldBefore: state.stacks.playerShield,
      overflowDamage: dmgToHp,
      maxHp: state.playerMaxHp,
      origin: {
        actionId: state.turn.enemyPhasesCompleted + 1,
        eventId: state.log.length,
      },
    });
  }
  // 보호막이 이번 공격을 전부 받아냈다면 피격 반사·반격은 발동하지 않는다.
  // 일부만 흡수해 HP 피해가 남은 경우에는 기존처럼 정상 발동한다.
  const hitStoppedByShield = shieldAbsorbed > 0 && dmgToHp <= 0;
  // 불굴 — HP 0 이 되는 데미지를 HP 1 로 막는다. 전투당 1회 (enduranceTriggered).
  const berserkerSurvival = applyBerserkerHostileDamage(
    state,
    player,
    state.playerHp - dmgToHp,
  );
  state = berserkerSurvival.state;
  const wouldKill = state.playerHp <= 0;
  const enduranceFires =
    wouldKill && !!player.enduranceActive && !state.flags.enduranceTriggered;
  const playerHpAfterDmg = enduranceFires
    ? 1
    : state.playerHp;
  // 흡혈 갑옷 (6티어) — 받은 HP 피해의 N% HP 회복. HP 0 으로 죽은 후엔 미발동, 불굴로 버틴 후엔 발동.
  const bloodfeastPct = player.bloodfeastPct ?? 0;
  const bloodfeastHealRaw =
    bloodfeastPct > 0 &&
    dmgToHp > 0 &&
    playerHpAfterDmg > 0 &&
    !berserkerSurvival.triggered
      ? Math.floor((dmgToHp * bloodfeastPct) / 100)
      : 0;
  const bloodfeastHeal = healingAfterReceivedMultiplier(
    bloodfeastHealRaw,
    player.receivedHealMult,
  );
  const playerHp =
    bloodfeastHeal > 0
      ? Math.min(state.playerMaxHp, playerHpAfterDmg + bloodfeastHeal)
      : playerHpAfterDmg;
  const bloodfeastActualHeal = playerHp - playerHpAfterDmg;
  const sigHealShield = healToShield(
    player.equipSignatures,
    {
      actualHeal: bloodfeastActualHeal,
      calculatedHeal: bloodfeastHeal,
      maxHp: state.playerMaxHp,
    },
  );
  const nextPlayerShield = newShield + (sigHealShield?.amount ?? 0);
  const enduranceTriggered = state.flags.enduranceTriggered || enduranceFires;
  const statusBlockUsed =
    state.flags.statusBlockUsed || statusBlockChill || statusBlockCurse;
  if (purificationBlockChill || purificationBlockCurse) {
    nextTripleWard = consumePurificationWard(nextTripleWard).state;
  }
  // 강체 (금강 시그니처) + 장비 on_hit_taken — 이번에 받은 HP 피해의 % 만큼 DEF 보너스 누적
  // (상한 = 기본 DEF). 받은 만큼 단단해지는 탱커. dmgToHp(보호막 흡수 후 실제 HP 피해) 기준.
  const sigDefGain = onHitTakenDefGain(player.equipSignatures);
  const braceGainPct = (player.defGainOnHitPct ?? 0) + (sigDefGain?.pct ?? 0);
  const nextBraceDefBonus =
    braceGainPct > 0 && dmgToHp > 0
      ? Math.min(
          player.def,
          state.stacks.braceDefBonus +
            Math.floor((dmgToHp * braceGainPct) / 100),
        )
      : state.stacks.braceDefBonus;
  const braceDefDelta = nextBraceDefBonus - state.stacks.braceDefBonus;
  // 로그 — 격노 발동 → 가드 → (강타 라벨 포함) 공격 → 불굴 순.
  let log = state.log;
  if (enrageReady && skill?.kind === "enrage") {
    log = appendLog(log, {
      kind: "info",
      text: `[${skill.name}] ${state.enemy.name}이(가) 격앙되어 공격력이 +${skill.atkBonus}!`,
    });
  }
  if (statusBlockChill && sigStatusBlock) {
    log = appendLog(log, {
      kind: "info",
      text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
    });
  }
  if (statusBlockCurse && sigStatusBlock) {
    log = appendLog(log, {
      kind: "info",
      text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
    });
  }
  if (purificationBlockChill || purificationBlockCurse) {
    log = appendLog(log, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${nextTripleWard.purification}회 남음)`,
    });
  }
  if (rawDmgBeforeReduction < rawDmgBeforeEvasion) {
    log = appendLog(log, {
      kind: "info",
      text: `[회피 경감 ${evasionReductionPct.toFixed(1)}%] 피해 -${rawDmgBeforeEvasion - rawDmgBeforeReduction}`,
    });
  }
  if (enduredApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[인내] 피해 -${rawDmg - enduredDmg}`,
    });
  }
  if (passiveReduceApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[받피감] 피해 -${enduredDmg - passiveReduced}`,
    });
  }
  if (stabilityReduced < passiveReduced) {
    log = appendLog(log, {
      kind: "info",
      text: `[영역 안정 ${state.stacks.tripleWard.stabilityStacks}중첩] 피해 -${passiveReduced - stabilityReduced}`,
    });
  }
  if (wardDamageReductionPct > 0) {
    const wardKind = magicAttack ? "magic" : "physical";
    log = appendLog(log, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS[wardKind]}] 직접 ${magicAttack ? "마법" : "물리"} 피해 ${wardDamageReductionPct}% 감소 (${wardDamageRemaining}회 남음)`,
    });
  }
  if (guardApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[가드] 피해 -${passiveReduced - guarded}`,
    });
  }
  if (steadfastApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[굳건한 의지] 피해 -${guarded - bodyDamage}`,
    });
  }
  if (shieldAbsorbed > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[철벽] 보호막이 ${shieldAbsorbed} 흡수 (남은 ${newShield})`,
    });
  }
  if (trackedShieldEffect) {
    log = appendLog(log, {
      kind: "info",
      text: `[${trackedShieldEffect.label}] 해로운 상태를 정화하고 ${trackedShieldEffect.actions}행동 동안 받는 피해가 ${trackedShieldEffect.damageReductionPct}% 감소한다.`,
    });
  }
  for (const entry of magicBarrierCombatLogEntries(magicBarrier)) {
    log = appendLog(log, entry);
  }
  const atkPrefix =
    (heavyBlowFired && skill?.kind === "heavy_blow" ? `[${skill.name}] ` : "") +
    (magicAttack ? "[마법] " : "") +
    (monsterCritFired ? "[치명타] " : "") +
    (curseDamageTakenPct > 0 ? `[저주 +${curseDamageTakenPct}%] ` : "");
  // 항상 "공격! " 접두 → 라벨([강타]·[마법]·[치명] 등)을 인라인(플레이어 공격·스킬과 통일).
  log = appendLog(log, {
    kind: "enemy_attack",
    text: `공격! ${atkPrefix}${dmgToHp} 피해를 입혔다.`,
    enemyHpDamage: dmgToHp,
    heavyBlowFired,
  });
  if (effectiveCurseAdd > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[${skill?.kind === "curse" ? skill.name : "저주"}] 저주 +${effectiveCurseAdd}스택 (현재 ${curseStacksNext})`,
    });
  }
  if (enduranceFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
    });
  }
  if (bloodfeastHeal > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[흡혈 갑옷] ${playerName}의 HP +${bloodfeastHeal}`,
    });
  }
  if (sigHealShield) {
    log = appendLog(log, {
      kind: "info",
      text: `[${sigHealShield.label}] 보호막 +${sigHealShield.amount}`,
    });
  }
  if (sigDefGain && braceDefDelta > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[${sigDefGain.label}] 방어 +${braceDefDelta}`,
    });
  }
  const fortressReaction = resolveFortressReaction({
    landed: preDefenseDamage > 0,
    defenderDef: player.def,
    impact: state.stacks.fortressImpact,
    impactOnHit: player.fortressImpactOnHit ?? false,
    ironWallReflectCharges: state.stacks.ironWallReflectCharges,
  });
  if (fortressReaction.impact > state.stacks.fortressImpact) {
    log = appendLog(log, {
      kind: "info",
      text: `[충격 방벽] 충격 +1 (현재 ${fortressReaction.impact}/3)`,
    });
  }
  // 반사 갑주 (특기) + 가시 갑옷 (5티어) — 보호막을 뚫고 적이 넣은 피해가 있을 때,
  // 가드/굳건/철벽 감산 전 원량(heavyBlow 반영)의
  // N% 를 적에게 반사. 둘 다 있으면 합산. 베이스가 pre-mit 이라 탱커 빌드여도 반사가 살아남는다.
  // 무한 가시 (2티어 특기) — 피격분과 별개로 적 ATK 의 N% 를 추가 반사 (회피/피격 무관).
  const thornsDmg =
    !hitStoppedByShield && (player.thornsPct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.thornsPct!) / 100)
      : 0;
  const brambleDmg =
    !hitStoppedByShield && (player.bramblePct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.bramblePct!) / 100)
      : 0;
  // 별빛 반사(enchant reflect) — 실제 HP 로 들어간 피해의 N% 만 반사 (회피·가드 무효
  // 시엔 0). 라벨은 "별빛 반사" 로 분리.
  const enchantReflectDmg =
    (player.enchantReflectPct ?? 0) > 0 && dmgToHp > 0
      ? Math.floor((dmgToHp * player.enchantReflectPct!) / 100)
      : 0;
  // 수호자 반사 — 피격(공격 적중) 시 방어력 기반 고정 데미지. 피해량과 무관하게 "방어 계수만큼".
  //   rawDmgBeforeReduction > 0 = 적 공격이 적중(회피·무효 아님)했을 때만 발동.
  const wardenReflectDmg =
    !hitStoppedByShield &&
    (player.thornsFlatFromDef ?? 0) > 0 &&
    rawDmgBeforeReduction > 0
      ? player.thornsFlatFromDef!
      : 0;
  const baseReflectDmg =
    thornsDmg +
    brambleDmg +
    (hitStoppedByShield ? 0 : infiniteThornsDmg) +
    enchantReflectDmg +
    wardenReflectDmg;
  const reflectBoostPct =
    state.stacks.skillReflectBoostTurns > 0 ? state.stacks.skillReflectBoostPct : 0;
  const rawReflectDmg =
    reflectBoostPct > 0
      ? Math.floor(baseReflectDmg * (1 + reflectBoostPct / 100))
      : baseReflectDmg;
  const totalRawReflectDmg =
    rawReflectDmg + fortressReaction.rawReflectDamage;
  const reflectTargetDef = playerFacingEnemyDef(state, player);
  const reflectTargetDefMult = v2DefBuffMult(
    state.enemyV2SelfBuffs,
    state.enemyV2Debuffs,
  );
  const reflectDmg =
    totalRawReflectDmg > 0
      ? damageBetween(
          totalRawReflectDmg,
          reflectTargetDefMult !== 1
            ? Math.floor(reflectTargetDef * reflectTargetDefMult)
            : reflectTargetDef,
        )
      : 0;
  let reactiveEnemyDamageTotal = reflectDmg;
  const enemyHpAfterThorns = Math.max(0, state.enemyHp - reflectDmg);
  if (reflectDmg > 0) {
    const reflectLabels: string[] = [];
    if (thornsDmg > 0) reflectLabels.push("반사 갑주");
    if (brambleDmg > 0) reflectLabels.push("가시 갑옷");
    if (!hitStoppedByShield && infiniteThornsDmg > 0) reflectLabels.push("무한 가시");
    if (enchantReflectDmg > 0) reflectLabels.push("별빛 반사");
    if (wardenReflectDmg > 0) reflectLabels.push("수호 반사");
    if (reflectBoostPct > 0) reflectLabels.push("반사 증폭");
    if (fortressReaction.ironWallReflected) reflectLabels.push("철벽 반사");
    log = appendLog(log, {
      kind: "player_attack",
      text: `[${reflectLabels.join(" + ")}] ${state.enemy.name}에게 ${reflectDmg} 반사 피해.`,
    });
  }
  if (fortressReaction.ironWallReflected) {
    log = appendLog(log, {
      kind: "info",
      text: `[철벽 태세] 철벽 반사 ${fortressReaction.ironWallReflectCharges}회 남음`,
    });
  }
  // 반격의 룬 — 피격 시 일정 확률로 적에게 ATK 데미지로 반격. 살아남았을 때만 발동.
  // 확률은 합산값. 100% 초과는 자연스럽게 항상 발동.
  const runeCounterPct = player.runeCounterChancePct ?? 0;
  let enemyHpAfterRuneCounter = enemyHpAfterThorns;
  if (
    runeCounterPct > 0 &&
    !hitStoppedByShield &&
    playerHp > 0 &&
    enemyHpAfterThorns > 0 &&
    Math.random() * 100 < runeCounterPct
  ) {
    // PR-5a: 룬 반격도 v2 buff/debuff 격리 해제 일관 적용.
    const v2AtkMultC = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultC = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const counterDef = playerFacingEnemyDef(state, player);
    const counterDmg = damageBetween(
      v2AtkMultC !== 1 ? Math.floor(player.atk * v2AtkMultC) : player.atk,
      v2DefMultC !== 1 ? Math.floor(counterDef * v2DefMultC) : counterDef,
    );
    reactiveEnemyDamageTotal += counterDmg;
    enemyHpAfterRuneCounter = Math.max(0, enemyHpAfterThorns - counterDmg);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[반격의 룬] ${state.enemy.name}에게 ${counterDmg} 반격 피해.`,
    });
  }
  // 무도가 패시브 — 피격 생존 시 일정 확률로 ATK 반격(반격의 룬과 동일 패턴, 별개 누적).
  const martialCounterPct = player.passiveCounterChancePct ?? 0;
  let enemyHpAfterMartialCounter = enemyHpAfterRuneCounter;
  if (
    martialCounterPct > 0 &&
    !hitStoppedByShield &&
    playerHp > 0 &&
    enemyHpAfterRuneCounter > 0 &&
    Math.random() * 100 < martialCounterPct
  ) {
    const v2AtkMultM = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultM = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const counterDefM = playerFacingEnemyDef(state, player);
    const counterBoostPct =
      player.passiveCounterDamageUsesReflectBoost &&
      state.stacks.skillReflectBoostTurns > 0
        ? state.stacks.skillReflectBoostPct
        : 0;
    const counterAtkM =
      v2AtkMultM !== 1 ? Math.floor(player.atk * v2AtkMultM) : player.atk;
    const boostedCounterAtkM =
      counterBoostPct > 0
        ? Math.floor(counterAtkM * (1 + counterBoostPct / 100))
        : counterAtkM;
    const counterDmgM = damageBetween(
      boostedCounterAtkM,
      v2DefMultM !== 1 ? Math.floor(counterDefM * v2DefMultM) : counterDefM,
    );
    reactiveEnemyDamageTotal += counterDmgM;
    enemyHpAfterMartialCounter = Math.max(0, enemyHpAfterRuneCounter - counterDmgM);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[${counterBoostPct > 0 ? "반격 + 금강인" : "반격"}] ${state.enemy.name}에게 ${counterDmgM} 반격 피해.`,
    });
  }
  const reactiveDefenseCharges = consumeReactiveDefenseCharges(
    {
      evasion: state.stacks.skillEvasionTurns,
      damageReduction: state.stacks.skillDmgReduceTurns,
      reflect: state.stacks.skillReflectBoostTurns,
    },
    {
      evasionUsed: state.stacks.skillEvasionTurns > 0,
      landed: preDefenseDamage > 0,
      reflectEligible: baseReflectDmg > 0,
    },
  );
  let resolvedState: BattleState = {
    ...recordEnemyDamage(state, reactiveEnemyDamageTotal),
    playerHp,
    playerMagicBarrier: magicBarrier.durabilityLeft,
    enemyHp: enemyHpAfterMartialCounter,
    flags: {
      ...state.flags,
      enduranceTriggered,
      enrageTriggered,
      statusBlockUsed,
      ...(trackedShieldEffect ? { trackedShieldBreakUsed: true } : {}),
    },
    buffs: {
      ...state.buffs,
      enemyAtkBonus,
      ...(trackedShieldEffect
        ? {
            playerDmgReductionPct: Math.max(
              state.buffs.playerDmgReductionTurnsLeft > 0
                ? state.buffs.playerDmgReductionPct
                : 0,
              trackedShieldEffect.damageReductionPct,
            ),
            playerDmgReductionTurnsLeft: Math.max(
              state.buffs.playerDmgReductionTurnsLeft,
              trackedShieldEffect.actions,
            ),
          }
        : {}),
    },
    stacks: {
      ...state.stacks,
      tripleWard: nextTripleWard,
      skillEvasionTurns: reactiveDefenseCharges.evasion,
      skillDmgReduceTurns: reactiveDefenseCharges.damageReduction,
      skillReflectBoostTurns: reactiveDefenseCharges.reflect,
      playerShield: nextPlayerShield,
      ...(state.stacks.trackedSetShield != null
        ? { trackedSetShield: trackedShieldResolution.remaining }
        : {}),
      fortressImpact: fortressReaction.impact,
      ironWallReflectCharges: fortressReaction.ironWallReflectCharges,
      chillStacks: trackedShieldEffect?.cleanse ? 0 : chillStacksNext,
      curseStacks: trackedShieldEffect?.cleanse ? 0 : curseStacksNext,
      damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
      braceDefBonus: nextBraceDefBonus,
    },
    ...(trackedShieldEffect?.cleanse
      ? { playerV2Dots: [], v2SelfDebuffs: {} }
      : {}),
    bossMechanic:
      trackedShieldEffect?.cleanse &&
      state.bossMechanic?.kind === "glacial_colossus"
        ? { ...state.bossMechanic, glacialChillStacks: 0 }
        : state.bossMechanic,
    turn: {
      ...state.turn,
      enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
    },
    log,
  };
  if (resolvedState.stacks.tier7?.ruinCharge) {
    resolvedState = {
      ...resolvedState,
      stacks: {
        ...resolvedState.stacks,
        tier7: {
          ...resolvedState.stacks.tier7,
          ruinCharge: {
            ...recordChargeHpLoss(
              resolvedState.stacks.tier7.ruinCharge,
              Math.min(state.playerHp, dmgToHp),
            ),
            deathBypassTriggered:
              resolvedState.stacks.tier7.ruinCharge.deathBypassTriggered ||
              berserkerSurvival.triggered,
          },
        },
      },
    };
  }
  if (resolvedState.stacks.tier6Uniques) {
    resolvedState = applyTier6UniquePveEvent(resolvedState, player, {
      kind: "hp_threshold",
      currentHp: resolvedState.playerHp,
      maxHp: resolvedState.playerMaxHp,
      origin: {
        actionId: resolvedState.turn.enemyPhasesCompleted,
        eventId: resolvedState.log.length,
      },
    });
  }
  resolvedState = releaseSwordShadowAfterEnemyAction(resolvedState);
  if (resolvedState.playerHp <= 0) {
    return {
      ...resolvedState,
      log: appendLog(resolvedState.log, {
        kind: "info",
        text: `${playerName}이(가) 쓰러졌다...`,
      }),
      phase: "ended",
      outcome: "lose",
    };
  }
  if (resolvedState.enemyHp <= 0) {
    // 반사 / 반격 피해로 적이 쓰러짐 — 플레이어는 생존.
    return {
      ...resolvedState,
      enemyHp: 0,
      log: appendLog(resolvedState.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return finishEnemyAttack(resolvedState);
}

export type ForcedEnemyPhysicalHitOptions = {
  attackName: string;
  multiplier: number;
  armorPierce: number;
  physicalDefensePiercePct?: number;
  bypassPlayerShield?: boolean;
  allowCritical: boolean;
  applyStatus: boolean;
  consumeEnemyAction: boolean;
};

/**
 * 현재 적의 물리 평타 판정을 재사용하되 ATB 행동 예약은 소비하지 않는 강제 1타.
 * 추적 섬멸처럼 플레이어 행동 직후 끼어드는 반격이 일반 방어·보호막·생존·반사
 * 경로를 그대로 거치게 한다.
 */
export function resolveForcedEnemyPhysicalHit(
  state: BattleState,
  basePlayer: PlayerCombat,
  playerName: string,
  options: ForcedEnemyPhysicalHitOptions,
): { state: BattleState; damageToHp: number } {
  if (state.phase === "ended" || state.playerHp <= 0 || state.enemyHp <= 0) {
    return { state, damageToHp: 0 };
  }

  const originalEnemy = state.enemy;
  const originalPhase = state.phase;
  const originalEnemyAttacksLeft = state.turn.enemyAttacksLeft;
  const originalEnemyPhasesCompleted = state.turn.enemyPhasesCompleted;
  const logStart = state.log.length;
  const beforePlayerHp = state.playerHp;
  const multiplier = Number.isFinite(options.multiplier)
    ? Math.max(0, options.multiplier)
    : 0;
  const armorPierce = Number.isFinite(options.armorPierce)
    ? Math.max(0, Math.floor(options.armorPierce))
    : 0;
  const physicalDefensePiercePct = Number.isFinite(
    options.physicalDefensePiercePct,
  )
    ? Math.max(0, Math.min(100, options.physicalDefensePiercePct ?? 0))
    : 0;
  const player =
    armorPierce > 0
      ? { ...basePlayer, def: Math.max(0, basePlayer.def - armorPierce) }
      : basePlayer;
  const forcedEnemy: Monster = {
    ...originalEnemy,
    atk: Math.max(0, Math.floor(originalEnemy.atk * multiplier)),
    atkType: "physical",
    playerDefVulnerable: physicalDefensePiercePct / 100,
    critPct: options.allowCritical ? originalEnemy.critPct : 0,
    bonusAttackChancePct: 0,
    ...(options.applyStatus ? {} : { skill: undefined }),
  };
  const prepared: BattleState = {
    ...state,
    enemy: forcedEnemy,
    phase: "enemy",
    turn: { ...state.turn, enemyAttacksLeft: 1 },
  };
  const resolved = resolveEnemyPhase(
    prepared,
    player,
    playerName,
    false,
    false,
    !options.applyStatus,
    { bypassPlayerShield: options.bypassPlayerShield === true },
  );
  const log = [
    ...resolved.log.slice(0, logStart),
    ...resolved.log.slice(logStart).map((entry) => {
      if (entry.kind === "enemy_attack" && entry.text.startsWith("공격!")) {
        return {
          ...entry,
          text: `${options.attackName}!${entry.text.slice("공격!".length)}`,
          turn: "enemy" as const,
        };
      }
      return entry.kind === "hp_bar" || entry.turn
        ? entry
        : { ...entry, turn: "enemy" as const };
    }),
  ];
  const restoredTurn = options.consumeEnemyAction
    ? resolved.turn
    : {
        ...resolved.turn,
        enemyAttacksLeft: originalEnemyAttacksLeft,
        enemyPhasesCompleted: originalEnemyPhasesCompleted,
      };
  return {
    state: {
      ...resolved,
      enemy: originalEnemy,
      turn: restoredTurn,
      phase:
        !options.consumeEnemyAction && resolved.phase !== "ended"
          ? originalPhase
          : resolved.phase,
      log,
    },
    damageToHp: Math.max(0, beforePlayerHp - resolved.playerHp),
  };
}

export type ForcedEnemyMagicHitOptions = {
  attackName: string;
  multiplier: number;
  magicDefensePiercePct: number;
  accuracyBonus: number;
  allowCritical: boolean;
  consumeEnemyAction: boolean;
};

/**
 * 현재 적의 마법 평타 판정을 재사용하는 독립 강제 1타. 고정 타임라인 보스기가
 * 일반 적 행동 예약을 건드리지 않으면서 회피·마법방벽·보호막·생존 경로를 공유한다.
 */
export function resolveForcedEnemyMagicHit(
  state: BattleState,
  basePlayer: PlayerCombat,
  playerName: string,
  options: ForcedEnemyMagicHitOptions,
): { state: BattleState; damageToHp: number } {
  if (state.phase === "ended" || state.playerHp <= 0 || state.enemyHp <= 0) {
    return { state, damageToHp: 0 };
  }

  const originalEnemy = state.enemy;
  const originalPhase = state.phase;
  const originalEnemyAttacksLeft = state.turn.enemyAttacksLeft;
  const originalEnemyPhasesCompleted = state.turn.enemyPhasesCompleted;
  const logStart = state.log.length;
  const beforePlayerHp = state.playerHp;
  const multiplier = Number.isFinite(options.multiplier)
    ? Math.max(0, options.multiplier)
    : 0;
  const piercePct = Number.isFinite(options.magicDefensePiercePct)
    ? Math.max(0, Math.min(100, options.magicDefensePiercePct))
    : 0;
  const accuracyBonus = Number.isFinite(options.accuracyBonus)
    ? options.accuracyBonus
    : 0;
  const player = {
    ...basePlayer,
    magicDef: Math.max(
      0,
      Math.floor((basePlayer.magicDef ?? 0) * (1 - piercePct / 100)),
    ),
  };
  const forcedEnemy: Monster = {
    ...originalEnemy,
    atk: Math.max(0, Math.floor(originalEnemy.atk * multiplier)),
    atkType: "magic",
    accuracy: (originalEnemy.accuracy ?? 0) + accuracyBonus,
    critPct: options.allowCritical ? originalEnemy.critPct : 0,
    bonusAttackChancePct: 0,
    skill: undefined,
  };
  const prepared: BattleState = {
    ...state,
    enemy: forcedEnemy,
    phase: "enemy",
    turn: { ...state.turn, enemyAttacksLeft: 1 },
  };
  const resolved = resolveEnemyPhase(
    prepared,
    player,
    playerName,
    false,
    false,
    true,
  );
  const log = [
    ...resolved.log.slice(0, logStart),
    ...resolved.log.slice(logStart).map((entry) => {
      if (entry.kind === "enemy_attack" && entry.text.startsWith("공격!")) {
        return {
          ...entry,
          text: `${options.attackName}!${entry.text.slice("공격!".length)}`,
          turn: "enemy" as const,
        };
      }
      return entry.kind === "hp_bar" || entry.turn
        ? entry
        : { ...entry, turn: "enemy" as const };
    }),
  ];
  const restoredTurn = options.consumeEnemyAction
    ? resolved.turn
    : {
        ...resolved.turn,
        enemyAttacksLeft: originalEnemyAttacksLeft,
        enemyPhasesCompleted: originalEnemyPhasesCompleted,
      };
  return {
    state: {
      ...resolved,
      enemy: originalEnemy,
      turn: restoredTurn,
      phase:
        !options.consumeEnemyAction && resolved.phase !== "ended"
          ? originalPhase
          : resolved.phase,
      log,
    },
    damageToHp: Math.max(0, beforePlayerHp - resolved.playerHp),
  };
}
