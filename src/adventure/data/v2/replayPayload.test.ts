import { describe, it, expect } from "vitest";
import {
  toReplayPayload,
  toReplayPayloadLite,
  toPvpReplayPayload,
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
    expect(toReplayPayload(fs, 200).enemy.element).toBe("fire");
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
    expect(toReplayPayload(fs, 200).enemy).toMatchObject({
      atkType: "magic",
      critPct: 25,
    });
    expect(toReplayPayloadLite(fs).enemy).toMatchObject({
      atkType: "magic",
      critPct: 25,
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
    expect(toReplayPayload(fs, 200, { depth: 12 }).enemy).toMatchObject({
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

  it("full toReplayPayload 와 메타 필드는 동일 — log 만 다름(단판 무변경 보증)", () => {
    const fs = fixture(10);
    const full = toReplayPayload(fs, 200);
    const lite = toReplayPayloadLite(fs);
    expect(lite.enemy).toEqual(full.enemy);
    expect(lite.playerMaxHp).toBe(full.playerMaxHp);
    expect(lite.playerMaxMp).toBe(full.playerMaxMp);
    expect(lite.playerMp).toBe(full.playerMp);
    expect(full.log).toHaveLength(10); // full 은 로그 보존
    expect(lite.log).toHaveLength(0); // lite 는 생략
  });
});

describe("toPvpReplayPayload (PvP → 나=p1 관점 ReplayPayload)", () => {
  // engine-pvp 는 모든 공격을 kind:"player_attack" + side 로 찍는다. 변환이 side==="p2" 를
  // 적 레인으로 뒤집어야 한다.
  const pvpFinal = (log: BattleLogEntry[]) =>
    ({
      p1: { maxHp: 600, maxMp: 100, mp: 40 },
      p2: { maxHp: 450 },
      log,
    }) as unknown as Parameters<typeof toPvpReplayPayload>[0];

  it("p2 공격 → enemy_attack/turn:enemy 로 매핑, p1 공격은 player 유지", () => {
    const p = toPvpReplayPayload(
      pvpFinal([
        { kind: "player_attack", text: "내 공격", side: "p1" },
        { kind: "player_attack", text: "상대 공격", side: "p2" },
      ]),
      "상대",
      200,
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
    const p = toPvpReplayPayload(pvpFinal([hpBar]), "상대", 200);
    expect(p.log[0]).toEqual(hpBar); // 변형 없이 통과
  });

  it("메타 — enemy.hp=상대 maxHp, playerMax*/playerMp=p1 사이드", () => {
    const p = toPvpReplayPayload(pvpFinal([]), "검투사", 200);
    expect(p.enemy).toEqual({ name: "검투사", hp: 450 });
    expect(p.playerMaxHp).toBe(600);
    expect(p.playerMaxMp).toBe(100);
    expect(p.playerMp).toBe(40);
  });

  it("p2 info/phase 엔트리는 kind 유지하고 turn 만 enemy 로", () => {
    const p = toPvpReplayPayload(
      pvpFinal([{ kind: "info", text: "상대 발동", side: "p2" }]),
      "상대",
      200,
    );
    expect(p.log[0]).toMatchObject({ kind: "info", turn: "enemy" });
  });
});
