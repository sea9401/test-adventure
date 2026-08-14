import { describe, it, expect } from "vitest";
import {
  buildBattleStateFromReplay,
  toDeferredReplayPayload,
  toFullReplayPayload,
  toReplayPayload,
  toReplayPayloadLite,
  toPvpReplayPayload,
  toPvpReplayPayloadForSide,
} from "./replayPayload";
import type {
  BattleState,
  BattleLogEntry,
} from "@/adventure/v2/combat/engine";

// toReplayPayloadLite 만 읽는 필드(enemy.{name,hp,image}·playerMax*·playerMp)로 구성한 최소 픽스처.
const fixture = (logLen: number): BattleState =>
  ({
    enemy: { name: "더미", hp: 300, image: "dummy.webp" },
    playerMaxHp: 500,
    playerMaxMp: 120,
    playerMp: 80,
    log: Array.from({ length: logLen }, (_, i) => ({
      kind: "info" as const,
      text: `줄 ${i}`,
    })),
  }) as unknown as BattleState;

describe("toReplayPayloadLite (일괄 사냥 경량 payload)", () => {
  it("허수아비 전체 로그 payload는 cap 없이 첫 기록부터 끝까지 보존한다", () => {
    const p = toFullReplayPayload(fixture(500));

    expect(p.log).toHaveLength(500);
    expect(p.log[0]).toMatchObject({ text: "줄 0" });
    expect(p.log.at(-1)).toMatchObject({ text: "줄 499" });
    expect(p.log.some((entry) => entry.text.includes("생략"))).toBe(false);
  });

  it("일반 다시보기도 예전 상한을 넘는 전체 로그를 보존한다", () => {
    const p = toReplayPayload(fixture(500));

    expect(p.log).toHaveLength(500);
    expect(p.log[0]).toMatchObject({ text: "줄 0" });
    expect(p.log.at(-1)).toMatchObject({ text: "줄 499" });
  });

  it("배치 응답은 지정한 로그 상한만 인라인으로 보존한다", () => {
    const p = toReplayPayload(fixture(500), { logCap: 80 });

    expect(p.log).toHaveLength(81);
    expect(p.log[0]).toMatchObject({
      kind: "info",
      text: "앞선 턴 기록 생략 (긴 전투)",
    });
    expect(p.log.at(-1)).toMatchObject({ text: "줄 499" });
  });

  it("별도 저장 참조는 메타와 replayId를 유지하고 인라인 로그만 비운다", () => {
    const full = toReplayPayload(fixture(500));
    const deferred = toDeferredReplayPayload(full, "replay-id");

    expect(deferred).toMatchObject({
      replayId: "replay-id",
      enemy: full.enemy,
      playerMaxHp: full.playerMaxHp,
      log: [],
    });
    expect(full.log).toHaveLength(500);
  });

  it("배치가 읽는 메타(playerMaxMp 등)는 담고 log 는 빈 배열(무거운 복사 회피)", () => {
    const p = toReplayPayloadLite(fixture(500));
    expect(p.playerMaxMp).toBe(120); // 배치 집계가 읽는 유일 필드
    expect(p.playerMaxHp).toBe(500);
    expect(p.playerMp).toBe(80);
    expect(p.enemy).toMatchObject({
      name: "더미",
      hp: 300,
      image: "dummy.webp",
      actionSpd: 10,
    });
    expect(p.log).toEqual([]); // log 는 복사 안 함(배치는 미사용)
  });

  it("몹 속성(element) 전달 — 전투 화면 뱃지용", () => {
    const fs = {
      ...fixture(3),
      enemy: { name: "불도마뱀", hp: 200, image: "x.webp", element: "fire" },
    } as unknown as BattleState;
    expect(toReplayPayload(fs).enemy.element).toBe("fire");
    expect(toReplayPayloadLite(fs).enemy.element).toBe("fire");
  });

  it("몹 전투 상세(atkType/critPct) 전달 — 전투 화면 스탯 상세용", () => {
    const fs = {
      ...fixture(3),
      enemy: {
        name: "심연 집행자",
        hp: 420,
        image: "abyss.webp",
        atk: 55,
        def: 20,
        spd: 11,
        atkType: "magic",
        critPct: 25,
      },
    } as unknown as BattleState;
    expect(toReplayPayload(fs).enemy).toMatchObject({
      atkType: "magic",
      critPct: 25,
      statusDamageReductionPct: 0,
    });
    expect(toReplayPayloadLite(fs).enemy).toMatchObject({
      atkType: "magic",
      critPct: 25,
      statusDamageReductionPct: 0,
    });
  });

  it("PvE 리플레이가 양쪽 마방·상태 피해 경감과 보스 지속 피해 보정을 보존한다", () => {
    const state = {
      ...fixture(1),
      isBoss: true,
      enemy: {
        name: "수호자",
        hp: 10_000,
        atk: 300,
        def: 200,
        magicDef: 180,
        spd: 40,
        statusDamageReductionPct: 25,
      },
    } as BattleState;
    const payload = toReplayPayload(state, {
      playerCombat: {
        hp: 1_000,
        maxHp: 1_000,
        atk: 400,
        magicAtk: 500,
        def: 220,
        magicDef: 160,
        spd: 50,
        evasionPct: 10,
        accRating: 20,
        attackCount: 1,
        passiveMagicBasicAttack: true,
        statusDamageReductionPct: 12,
      },
    });

    expect(payload).toMatchObject({
      ruleset: "pve",
      maxHpDamageMult: 0.8,
      playerCombat: {
        magicDef: 160,
        statusDamageReductionPct: 12,
        primaryAttack: "magic",
      },
      enemy: {
        magicDef: 180,
        statusDamageReductionPct: 25,
      },
    });
  });

  it("몹 행동속도와 연타 보정 전달 — 원시 속도 대신 체감 스탯 표시용", () => {
    const fs = {
      ...fixture(3),
      enemy: {
        name: "붉은 갈기 늑대",
        hp: 420,
        image: "wolf.webp",
        spd: 6,
        bonusAttackChancePct: 35,
      },
    } as unknown as BattleState;
    expect(toReplayPayload(fs, { depth: 12 }).enemy).toMatchObject({
      spd: 6,
      actionSpd: 57,
      bonusAttackChancePct: 35,
    });
    expect(toReplayPayloadLite(fs, { depth: 12 }).enemy).toMatchObject({
      spd: 6,
      actionSpd: 57,
      bonusAttackChancePct: 35,
    });
  });

  it("직접 속도 몬스터는 리플레이에도 데이터 spd를 그대로 표시한다", () => {
    const fs = {
      ...fixture(3),
      enemy: {
        name: "심층 수호자",
        hp: 20_459,
        spd: 244,
        directActionSpd: true,
      },
    } as unknown as BattleState;

    expect(toReplayPayload(fs).enemy).toMatchObject({
      spd: 244,
      actionSpd: 244,
    });
  });

  it("full toReplayPayload 와 메타 필드는 동일 — log 만 다름(단판 무변경 보증)", () => {
    const fs = fixture(10);
    const full = toReplayPayload(fs);
    const lite = toReplayPayloadLite(fs);
    expect(lite.enemy).toEqual(full.enemy);
    expect(lite.playerMaxHp).toBe(full.playerMaxHp);
    expect(lite.playerMaxMp).toBe(full.playerMaxMp);
    expect(lite.playerMp).toBe(full.playerMp);
    expect(lite.enemyMaxMp).toBe(full.enemyMaxMp);
    expect(lite.enemyMp).toBe(full.enemyMp);
    expect(full.log).toHaveLength(10); // full 은 로그 보존
    expect(lite.log).toHaveLength(0); // lite 는 생략
  });

  it("적 현재 MP/최대 MP를 저장하고 다시보기 상태로 복원한다", () => {
    const fs = {
      ...fixture(1),
      enemyMp: 20,
      enemyMaxMp: 75,
    } as BattleState;
    const payload = toReplayPayload(fs);
    const restored = buildBattleStateFromReplay(payload, 500, 300);

    expect(payload).toMatchObject({ enemyMp: 20, enemyMaxMp: 75 });
    expect(restored).toMatchObject({ enemyMp: 20, enemyMaxMp: 75 });
  });

  it("예전 리플레이는 마지막 hp_bar의 적 MP로 복원한다", () => {
    const payload = {
      enemy: { name: "산군", hp: 30_000 },
      playerMaxHp: 500,
      playerMaxMp: 100,
      log: [
        {
          kind: "hp_bar" as const,
          text: "",
          playerHp: 400,
          playerMaxHp: 500,
          enemyHp: 25_000,
          enemyMaxHp: 30_000,
          enemyMp: 25,
          enemyMaxMp: 75,
        },
      ],
    };
    const restored = buildBattleStateFromReplay(payload, 400, 25_000);

    expect(restored).toMatchObject({ enemyMp: 25, enemyMaxMp: 75 });
  });
});

describe("toPvpReplayPayload (PvP → 나=p1 관점 ReplayPayload)", () => {
  // engine-pvp 는 모든 공격을 kind:"player_attack" + side 로 찍는다. 변환이 side==="p2" 를
  // 적 레인으로 뒤집어야 한다.
  const pvpFinal = (log: BattleLogEntry[]) =>
    ({
      p1: { maxHp: 600, maxMp: 100, mp: 40 },
      p2: { maxHp: 450, maxMp: 80, mp: 25 },
      log,
    }) as unknown as Parameters<typeof toPvpReplayPayload>[0];

  it("p2 공격 → enemy_attack/turn:enemy 로 매핑, p1 공격은 player 유지", () => {
    const p = toPvpReplayPayload(
      pvpFinal([
        { kind: "player_attack", text: "내 공격", side: "p1" },
        { kind: "player_attack", text: "상대 공격", side: "p2" },
      ]),
      "상대",
    );
    expect(p.log[0]).toMatchObject({ kind: "player_attack", turn: "player" });
    expect(p.log[1]).toMatchObject({ kind: "enemy_attack", turn: "enemy" });
  });

  it("hp_bar 는 그대로 통과(엔진이 이미 playerHp=p1·enemyHp=p2 프레이밍)", () => {
    const hpBar: BattleLogEntry = {
      kind: "hp_bar",
      text: "",
      playerHp: 500,
      playerMaxHp: 600,
      enemyHp: 200,
      enemyMaxHp: 450,
      side: "p2", // hp_bar 는 side 무관하게 그대로 둬야 함
    };
    const p = toPvpReplayPayload(pvpFinal([hpBar]), "상대");
    expect(p.log[0]).toEqual(hpBar); // 변형 없이 통과
  });

  it("p2 관점 변환은 hp_bar 와 로그 레인을 뒤집는다", () => {
    const hpBar: BattleLogEntry = {
      kind: "hp_bar",
      text: "",
      playerHp: 500,
      playerMaxHp: 600,
      playerMp: 40,
      playerMaxMp: 100,
      enemyHp: 200,
      enemyMaxHp: 450,
      enemyMp: 25,
      enemyMaxMp: 80,
      playerSignatureResources: { pursuitMarks: 4 },
      enemySignatureResources: { arcaneOverload: 75 },
    };
    const p = toPvpReplayPayloadForSide(
      pvpFinal([
        { kind: "player_attack", text: "p1 공격", side: "p1" },
        { kind: "player_attack", text: "p2 공격", side: "p2" },
        hpBar,
      ]),
      "p2",
      "공격자",
    );
    expect(p.log[0]).toMatchObject({ kind: "enemy_attack", turn: "enemy" });
    expect(p.log[1]).toMatchObject({ kind: "player_attack", turn: "player" });
    expect(p.log[2]).toMatchObject({
      kind: "hp_bar",
      playerHp: 200,
      playerMaxHp: 450,
      playerMp: 25,
      playerMaxMp: 80,
      enemyHp: 500,
      enemyMaxHp: 600,
      enemyMp: 40,
      enemyMaxMp: 100,
      playerSignatureResources: { arcaneOverload: 75 },
      enemySignatureResources: { pursuitMarks: 4 },
    });
    expect(p.enemy).toEqual({ name: "공격자", hp: 600 });
    expect(p.playerMaxHp).toBe(450);
    expect(p.playerMaxMp).toBe(80);
    expect(p.playerMp).toBe(25);
    expect(p.enemyMaxMp).toBe(100);
    expect(p.enemyMp).toBe(40);
  });

  it("메타 — enemy.hp=상대 maxHp, playerMax*/playerMp=p1 사이드", () => {
    const p = toPvpReplayPayload(pvpFinal([]), "검투사");
    expect(p.enemy).toEqual({ name: "검투사", hp: 450 });
    expect(p.playerMaxHp).toBe(600);
    expect(p.playerMaxMp).toBe(100);
    expect(p.playerMp).toBe(40);
  });

  it("PvP 관점 변환은 양쪽 전투 스탯을 함께 뒤집고 PvP 판정을 보존한다", () => {
    const finalState = {
      p1: {
        maxHp: 600,
        maxMp: 100,
        mp: 40,
        player: {
          atk: 110,
          def: 90,
          magicDef: 70,
          spd: 30,
          evasionPct: 12,
          accRating: 25,
          attackCount: 1,
          statusDamageReductionPct: 8,
          magicBarrierAbsorbPct: 45,
          magicBarrierPvpAbsorbPct: 30,
          magicBarrierEfficiencyPct: 30,
          magicBarrierPvpEfficiencyPct: 20,
        },
      },
      p2: {
        maxHp: 450,
        maxMp: 80,
        mp: 25,
        player: {
          atk: 95,
          def: 120,
          magicDef: 130,
          spd: 20,
          evasionPct: 18,
          accRating: 15,
          attackCount: 1,
          statusDamageReductionPct: 20,
        },
      },
      log: [],
    } as unknown as Parameters<typeof toPvpReplayPayload>[0];

    const attackerView = toPvpReplayPayload(finalState, "방어자");
    const defenderView = toPvpReplayPayloadForSide(
      finalState,
      "p2",
      "공격자",
    );

    expect(attackerView).toMatchObject({
      ruleset: "pvp",
      maxHpDamageMult: 1,
      playerCombat: {
        atk: 110,
        magicDef: 70,
        statusDamageReductionPct: 8,
        magicBarrierAbsorbPct: 30,
        magicBarrierEfficiencyPct: 20,
      },
      enemy: { atk: 95, magicDef: 130, statusDamageReductionPct: 20 },
    });
    expect(defenderView).toMatchObject({
      ruleset: "pvp",
      maxHpDamageMult: 1,
      playerCombat: { atk: 95, magicDef: 130, statusDamageReductionPct: 20 },
      enemy: { atk: 110, magicDef: 70, statusDamageReductionPct: 8 },
    });
  });

  it("p2 info/phase 엔트리는 kind 유지하고 turn 만 enemy 로", () => {
    const p = toPvpReplayPayload(
      pvpFinal([{ kind: "info", text: "상대 발동", side: "p2" }]),
      "상대",
    );
    expect(p.log[0]).toMatchObject({ kind: "info", turn: "enemy" });
  });
});
