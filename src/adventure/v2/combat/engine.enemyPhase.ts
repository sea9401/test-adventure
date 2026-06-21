import {
  appendLog,
  applyCounterIfAny,
  finishEnemyAttack,
  playerFacingEnemyDef,
  type BattleLogEntry,
  type BattleState,
  type PlayerCombat,
} from "./engine";
import {
  damageBetween,
  damageToDefender,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import { dodgeChance } from "@/adventure/data/v2/v2CombatConstants";
import {
  elementDamageMult,
  V2_ELEMENT_ADV_PCT,
  V2_ELEMENT_DIS_PCT,
} from "@/adventure/data/v2/elements";

// 치명형 몹(SPI PR-3b) 기본 치명 배수 — Monster.critMult 미지정 시. 플레이어 CRIT_MULT_BASE(1.4)
//   보다 약간 높게 둬 "치명 위협" 체감(잡몹은 critPct 0 이라 무관).
const MONSTER_CRIT_MULT_DEFAULT = 1.5;

// 적 페이즈 전체 — advanceTurn 에서 플레이어 페이즈(평타·스킬)와 분량을 가르기 위해 분리한다.
// 한기 틱 → 잔상(AP 블록) → 회피 캐스케이드(그림자보법·보장회피·%회피·별빛가드·흘려막기·
// 행운의방패) → 적 데미지 적용(반사·반격·보호막) 순. 이 구간의 지역 상태(evadeHeal·무한가시·
// 반사회피 추정데미지 등)는 전부 이 함수 안에 갇혀 advanceTurn 으로의 변수 threading 이 0이다.
// 동작은 advanceTurn 인라인이던 시절과 1비트도 다르지 않다(combatGolden 적 페이즈 매트릭스 가드).
export function resolveEnemyPhase(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  enteringEnemyPhase: boolean,
  // 몹이 이 턴 스킬을 시전했으면 평타 생략(스킬이 평타 대체 — 플레이어 대칭). 한기 틱 뒤 분기.
  skipBasicAttack: boolean = false,
): BattleState {
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
    const chillDefCut = Math.round(
      player.def * (chillSkill.defMitigationFraction ?? 0),
    );
    const chillDmgRaw = Math.max(
      1,
      state.stacks.chillStacks * chillSkill.dmgPerStack - chillDefCut,
    );
    const chillDmgAfterResolve =
      state.buffs.playerDmgReductionTurnsLeft > 0 &&
      state.buffs.playerDmgReductionPct > 0
        ? Math.floor(chillDmgRaw * (1 - state.buffs.playerDmgReductionPct / 100))
        : chillDmgRaw;
    const endurePct = player.enchantEndurePct ?? 0;
    const chillDmgAfterEndure =
      endurePct > 0
        ? Math.floor(chillDmgAfterResolve * (1 - endurePct / 100))
        : chillDmgAfterResolve;
    const chillDmg = Math.max(1, chillDmgAfterEndure);
    const afterChillHp = Math.max(0, state.playerHp - chillDmg);
    const chilled: BattleState = {
      ...state,
      playerHp: afterChillHp,
      stacks: {
        ...state.stacks,
        damageTakenThisCombat:
          state.stacks.damageTakenThisCombat + (state.playerHp - afterChillHp),
      },
      log: appendLog(state.log, {
        kind: "info",
        text: `[한기] ${chillSkill.name} — 추위가 ${chillDmg} 피해 (스택 ${state.stacks.chillStacks})`,
      }),
    };
    if (afterChillHp <= 0) {
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
  const evadeHeal = player.evadeHealAmount ?? 0;
  const healOnDodge = (hp: number): number =>
    evadeHeal > 0 ? Math.min(state.playerMaxHp, hp + evadeHeal) : hp;

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
  // 회피/무피격 분기에서 공통으로 적용할 반사 피해(무한 가시 + 반사 회피) — 적 HP 갱신용.
  const applyDodgeReflect = (
    log0: BattleLogEntry[],
    enemyHp0: number,
  ): { log: BattleLogEntry[]; enemyHp: number; killed: boolean } => {
    const totalReflect = infiniteThornsDmg + reflexEvadeDmg;
    if (totalReflect <= 0) return { log: log0, enemyHp: enemyHp0, killed: false };
    let nextLog = log0;
    const labels: string[] = [];
    if (infiniteThornsDmg > 0) labels.push("무한 가시");
    if (reflexEvadeDmg > 0) labels.push("반사 회피");
    const newEnemyHp = Math.max(0, enemyHp0 - totalReflect);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${labels.join(" + ")}] ${state.enemy.name}에게 ${totalReflect} 반사 피해.`,
    });
    return { log: nextLog, enemyHp: newEnemyHp, killed: newEnemyHp <= 0 };
  };

  // 그림자 보법 (2티어 특기) — 적 턴 시작 시 일정 확률로 그 턴 모든 적 공격 무효.
  const shadowStepPct = player.shadowStepPct ?? 0;
  if (shadowStepPct > 0 && Math.random() * 100 < shadowStepPct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[그림자 보법] ${playerName}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
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
    // 그림자 보법은 그 턴 모든 적 공격 무효 — 다대시 보스라도 남은 추가타까지 모두 흘려보냄.
    let next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        enemyAttacksLeft: 0,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
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
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
        playerHp: healedHp,
        enemyHp: 0,
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
    const next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
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
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }
  // 이중 행운 — 활성 시 회피 확률 +bonus%.
  const luckEvadeBonus = state.flags.luckyBuffActive
    ? player.doubleLuck?.evade ?? 0
    : 0;
  // 만물 행운 (6티어) — 회피 확률에도 +N%.
  const universalLuckEvadeBonus = player.universalLuckBonusPct ?? 0;
  // 회전 운기 (2티어 특기) — 누적 보너스 회피에도 적용.
  // 회피 캡 EVASION_PCT_CAP — 100% 회피 무적 빌드 차단.
  // 보장 회피 (소모형 적립) 는 위쪽 분기에서 별도 처리되어 캡 무관 100% 회피 유지.
  // 한기 슬로우 — chill 스택당 회피율 감소(굼떠짐). 미지정/0 = 효과 없음. 회피는 0 미만 안 됨.
  const chillSlowPct =
    state.enemy.skill?.kind === "chill"
      ? state.stacks.chillStacks *
        (state.enemy.skill.evasionPenaltyPerStack ?? 0)
      : 0;
  // 적 명중(accuracy) — 유효 회피에서 %p 차감. 0/undefined = 차감 없음(기존 동작).
  // chillSlowPct 와 같은 자리에서 빼 회피 캡 적용 후 감산. 고탑 보스가 층 비례로 보유.
  // 암흑(원소술사 어둠) — 적 명중 -%p(적 헛침↑). 디버프 없으면 0 → 기존 동작(byte-identical).
  const accDown =
    state.stacks.enemyAccuracyDownTurns > 0
      ? state.stacks.enemyAccuracyDownPct
      : 0;
  // 회피 대결형 Slice 1 — 몹 명중레이팅(floorAccuracy(depth)+몹 accuracy, scaleMonsterForFloor 가 합산) − 암흑.
  const enemyAccuracy = Math.max(0, (state.enemy.accuracy ?? 0) - accDown);
  // 플레이어 회피레이팅(캡 없는 raw) + temp 버프(행운/운기/선풍각) − 한기슬로우. 버프는 이제 레이팅 가산(점감).
  const evaRatingTotal = Math.max(
    0,
    (player.evaRating ?? player.evasionPct) +
      luckEvadeBonus +
      universalLuckEvadeBonus +
      state.buffs.cyclingChiBonus +
      // PR2-B-2c 선풍각 — 회피 temp 버프.
      (state.stacks.skillEvasionTurns > 0 ? state.stacks.skillEvasionPct : 0) -
      chillSlowPct,
  );
  // 대결 → 회피확률(점근 천장 DODGE_MAX·절대 도달X). 보장회피(소모형 100%)는 위 분기에서 별도.
  const effectiveEvadePct = dodgeChance(evaRatingTotal, enemyAccuracy);
  if (Math.random() * 100 < effectiveEvadePct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `${playerName}이(가) ${state.enemy.name}의 공격을 회피했다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
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
    const next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }
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
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
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
    const next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }

  // ── 잡몹 스킬 (적 공격에 영향) ──────────────────────────────────────────
  // 천뢰 일격 (AP) — silence 활성 중엔 enemy.skill 전체 효과 비활성.
  const skill =
    state.buffs.enemySilenceTurnsLeft > 0 ? undefined : state.enemy.skill;
  // 한기 누적 — chill 공격이 적중하면 perHit 만큼 스택. 적 HP 가 deepHpFraction 미만이면 2배(깊은 한기).
  // silence 중엔 누적 안 됨(skill 이 undefined). 실제 DoT 는 다음 적 페이즈 시작에 틱.
  const chillAdd =
    skill?.kind === "chill"
      ? state.enemyHp < state.enemy.hp * (skill.deepHpFraction ?? 0)
        ? skill.perHit * 2
        : skill.perHit
      : 0;
  // maxStacks 지정 시 상한 클램프 — 무한 누적 폭주 방지.
  const chillStacksNext =
    skill?.kind === "chill" && skill.maxStacks !== undefined
      ? Math.min(skill.maxStacks, state.stacks.chillStacks + chillAdd)
      : state.stacks.chillStacks + chillAdd;
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
  const baseEnemyDmgRaw = damageToDefender(v2EffectiveEnemyAtk, defenseForAttack);
  // 속성 방어 상성(2026-06-20 양방향) — 몹 평타가 몹속성 vs 플레이어속성 배수 적용. 내가 몹 속성에
  //   강하면 덜 맞고 약하면 더 맞음. 평타는 매 턴 발동하므로 방어 상성의 일관 적용점이다. 🔑 무속성
  //   매치업은 ×1(neutral)이라 가드로 스킵 → RNG 무소비·기존 전투 byte-identical. (몹 스킬은 중립
  //   유지 — engine.ts 몹 cast 의 0/0 주석 참조: 몹이 스킬+평타 동시 발동이라 평타에만 적용해 이중 방지.)
  // 불리(dis) 측에 원소 통달(원소술사) 보너스 가산 — 내가 몹 속성에 강할 때 받피 추가 경감. 미보유=0
  //   → 전역 상수(byte-identical). 유리(adv·내가 약점) 측은 불변(자기 속성 통달이 약점을 줄이진 않음).
  //   ⚠️ 몹 스킬 defense 의 원소 통달 보너스는 PR 후속(여긴 몹 평타). PvP 도 후속.
  const enemyElemMult = elementDamageMult(
    state.enemy.element ?? "neutral",
    player.characterElement ?? "neutral",
    V2_ELEMENT_ADV_PCT,
    V2_ELEMENT_DIS_PCT + (player.elementDisPctBonus ?? 0),
  );
  const baseEnemyDmg =
    enemyElemMult !== 1
      ? Math.max(1, Math.floor(baseEnemyDmgRaw * enemyElemMult))
      : baseEnemyDmgRaw;
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
  const rawDmgBeforeReduction =
    preMitMult !== 1
      ? Math.max(1, Math.floor(baseEnemyDmg * preMitMult))
      : baseEnemyDmg;
  // 결의 (AP) — 받는 피해 -pct%. 가드/굳건/철벽 전에 곱연산으로 먼저 깎이도록.
  const rawDmg =
    state.buffs.playerDmgReductionTurnsLeft > 0 &&
    state.buffs.playerDmgReductionPct > 0
      ? Math.max(
          1,
          Math.floor(
            rawDmgBeforeReduction *
              (1 - state.buffs.playerDmgReductionPct / 100),
          ),
        )
      : rawDmgBeforeReduction;
  // 별빛 인내(enchant endure) — 받는 피해 -pct%. 결의 다음, 가드/굳건/철벽 전에 곱연산.
  // 항상 활성(시한부 X). 최소 1 클램프.
  const endurePct = player.enchantEndurePct ?? 0;
  const enduredDmg =
    endurePct > 0
      ? Math.max(1, Math.floor(rawDmg * (1 - endurePct / 100)))
      : rawDmg;
  const enduredApplied = enduredDmg < rawDmg;
  // 받피감 — 패시브(passiveDamageTakenReductionPct, 철벽검류 등) + 철포 버프(skillDmgReduce,
  //   직업 킷 재설계). 합산 %로 곱연산. 인내(endure) 다음·가드 전. 최소 1 클램프. 0=무변.
  const buffReducePct =
    state.stacks.skillDmgReduceTurns > 0 ? state.stacks.skillDmgReducePct : 0;
  const passiveReducePct =
    (player.passiveDamageTakenReductionPct ?? 0) + buffReducePct;
  const passiveReduced =
    passiveReducePct > 0
      ? Math.max(1, Math.floor(enduredDmg * (1 - passiveReducePct / 100)))
      : enduredDmg;
  // 가드 — 첫 N번의 적 페이즈 동안 받는 피해 -reduction. 선공자에 무관하게
  // enemyPhasesCompleted 가 N 미만이면 이번 페이즈가 그 N 중 하나.
  const guard = player.guard;
  const guarded =
    guard && guard.turns > 0 && state.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, passiveReduced - guard.reduction)
      : passiveReduced;
  // 굳건한 의지 (2티어 특기) — 받은 피해 평탄 -(N) 감소. 가드 뒤에 적용.
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const dmg = steadfastFlat > 0 ? Math.max(0, guarded - steadfastFlat) : guarded;
  const guardApplied = guarded < passiveReduced;
  const steadfastApplied = dmg < guarded;
  // 철벽 (4티어) — 보호막이 데미지를 먼저 흡수, 남은 만큼만 HP 에 적용. 무피해 난무는 dmgToHp 로 누적.
  const shieldAbsorbed = Math.min(state.stacks.playerShield, dmg);
  const dmgToHp = dmg - shieldAbsorbed;
  const newShield = state.stacks.playerShield - shieldAbsorbed;
  // 불굴 — HP 0 이 되는 데미지를 HP 1 로 막는다. 전투당 1회 (enduranceTriggered).
  const wouldKill = state.playerHp - dmgToHp <= 0;
  const enduranceFires =
    wouldKill && !!player.enduranceActive && !state.flags.enduranceTriggered;
  const playerHpAfterDmg = enduranceFires
    ? 1
    : Math.max(0, state.playerHp - dmgToHp);
  // 흡혈 갑옷 (6티어) — 받은 HP 피해의 N% HP 회복. HP 0 으로 죽은 후엔 미발동, 불굴로 버틴 후엔 발동.
  const bloodfeastPct = player.bloodfeastPct ?? 0;
  const bloodfeastHeal =
    bloodfeastPct > 0 && dmgToHp > 0 && playerHpAfterDmg > 0
      ? Math.floor((dmgToHp * bloodfeastPct) / 100)
      : 0;
  const playerHp =
    bloodfeastHeal > 0
      ? Math.min(state.playerMaxHp, playerHpAfterDmg + bloodfeastHeal)
      : playerHpAfterDmg;
  const enduranceTriggered = state.flags.enduranceTriggered || enduranceFires;
  // 강체 (금강 시그니처) — 이번에 받은 HP 피해의 % 만큼 DEF 보너스 누적(상한 = 기본 DEF).
  // 받은 만큼 단단해지는 탱커. dmgToHp(보호막 흡수 후 실제 HP 피해) 기준.
  const braceGainPct = player.defGainOnHitPct ?? 0;
  const nextBraceDefBonus =
    braceGainPct > 0 && dmgToHp > 0
      ? Math.min(
          player.def,
          state.stacks.braceDefBonus +
            Math.floor((dmgToHp * braceGainPct) / 100),
        )
      : state.stacks.braceDefBonus;
  // 로그 — 격노 발동 → 가드 → (강타 라벨 포함) 공격 → 불굴 순.
  let log = state.log;
  if (enrageReady && skill?.kind === "enrage") {
    log = appendLog(log, {
      kind: "info",
      text: `[${skill.name}] ${state.enemy.name}이(가) 격앙되어 공격력이 +${skill.atkBonus}!`,
    });
  }
  if (enduredApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[인내] 피해 -${rawDmg - enduredDmg}`,
    });
  }
  if (guardApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[가드] 피해 -${enduredDmg - guarded}`,
    });
  }
  if (steadfastApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[굳건한 의지] 피해 -${guarded - dmg}`,
    });
  }
  if (shieldAbsorbed > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[철벽] 보호막이 ${shieldAbsorbed} 흡수 (남은 ${newShield})`,
    });
  }
  const atkPrefix =
    (heavyBlowFired && skill?.kind === "heavy_blow" ? `[${skill.name}] ` : "") +
    (magicAttack ? "[마법] " : "") +
    (monsterCritFired ? "[치명] " : "");
  log = appendLog(log, {
    kind: "enemy_attack",
    text: `${atkPrefix || "공격! "}${dmgToHp} 피해를 입혔다.`,
  });
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
  // 반사 갑주 (특기) + 가시 갑옷 (5티어) — 적이 넣은 피해(가드/굳건/철벽 감산 전, heavyBlow 반영)의
  // N% 를 적에게 반사. 둘 다 있으면 합산. 베이스가 pre-mit 이라 탱커 빌드여도 반사가 살아남는다.
  // 무한 가시 (2티어 특기) — 피격분과 별개로 적 ATK 의 N% 를 추가 반사 (회피/피격 무관).
  const thornsDmg =
    (player.thornsPct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.thornsPct!) / 100)
      : 0;
  const brambleDmg =
    (player.bramblePct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.bramblePct!) / 100)
      : 0;
  // 별빛 반사(enchant reflect) — 실제 HP 로 들어간 피해의 N% 만 반사 (회피·가드 무효
  // 시엔 0). 라벨은 "별빛 반사" 로 분리.
  const enchantReflectDmg =
    (player.enchantReflectPct ?? 0) > 0 && dmgToHp > 0
      ? Math.floor((dmgToHp * player.enchantReflectPct!) / 100)
      : 0;
  const reflectDmg =
    thornsDmg + brambleDmg + infiniteThornsDmg + enchantReflectDmg;
  const enemyHpAfterThorns = Math.max(0, state.enemyHp - reflectDmg);
  if (reflectDmg > 0) {
    const reflectLabels: string[] = [];
    if (thornsDmg > 0) reflectLabels.push("반사 갑주");
    if (brambleDmg > 0) reflectLabels.push("가시 갑옷");
    if (infiniteThornsDmg > 0) reflectLabels.push("무한 가시");
    if (enchantReflectDmg > 0) reflectLabels.push("별빛 반사");
    log = appendLog(log, {
      kind: "player_attack",
      text: `[${reflectLabels.join(" + ")}] ${state.enemy.name}에게 ${reflectDmg} 반사 피해.`,
    });
  }
  // 반격의 룬 — 피격 시 일정 확률로 적에게 ATK 데미지로 반격. 살아남았을 때만 발동.
  // 확률은 합산값. 100% 초과는 자연스럽게 항상 발동.
  const runeCounterPct = player.runeCounterChancePct ?? 0;
  let enemyHpAfterRuneCounter = enemyHpAfterThorns;
  if (
    runeCounterPct > 0 &&
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
    playerHp > 0 &&
    enemyHpAfterRuneCounter > 0 &&
    Math.random() * 100 < martialCounterPct
  ) {
    const v2AtkMultM = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultM = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const counterDefM = playerFacingEnemyDef(state, player);
    const counterDmgM = damageBetween(
      v2AtkMultM !== 1 ? Math.floor(player.atk * v2AtkMultM) : player.atk,
      v2DefMultM !== 1 ? Math.floor(counterDefM * v2DefMultM) : counterDefM,
    );
    enemyHpAfterMartialCounter = Math.max(0, enemyHpAfterRuneCounter - counterDmgM);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[반격] ${state.enemy.name}에게 ${counterDmgM} 반격 피해.`,
    });
  }
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp,
      enemyHp: enemyHpAfterMartialCounter,
      flags: {
        ...state.flags,
        enduranceTriggered,
        enrageTriggered,
      },
      buffs: {
        ...state.buffs,
        enemyAtkBonus,
      },
      stacks: {
        ...state.stacks,
        playerShield: newShield,
        chillStacks: chillStacksNext,
        damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
        braceDefBonus: nextBraceDefBonus,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log: appendLog(log, {
        kind: "info",
        text: `${playerName}이(가) 쓰러졌다...`,
      }),
      phase: "ended",
      outcome: "lose",
    };
  }
  if (enemyHpAfterMartialCounter <= 0) {
    // 반사 / 반격 피해로 적이 쓰러짐 — 플레이어는 생존.
    return {
      ...state,
      playerHp,
      enemyHp: 0,
      flags: {
        ...state.flags,
        enduranceTriggered,
        enrageTriggered,
      },
      buffs: {
        ...state.buffs,
        enemyAtkBonus,
      },
      stacks: {
        ...state.stacks,
        playerShield: newShield,
        chillStacks: chillStacksNext,
        damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
        braceDefBonus: nextBraceDefBonus,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log: appendLog(log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return finishEnemyAttack({
    ...state,
    playerHp,
    enemyHp: enemyHpAfterMartialCounter,
    flags: {
      ...state.flags,
      enduranceTriggered,
      enrageTriggered,
    },
    buffs: {
      ...state.buffs,
      enemyAtkBonus,
    },
    stacks: {
      ...state.stacks,
      playerShield: newShield,
      chillStacks: chillStacksNext,
      damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
      braceDefBonus: nextBraceDefBonus,
    },
    turn: {
      ...state.turn,
      enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
    },
    log,
  });
}
