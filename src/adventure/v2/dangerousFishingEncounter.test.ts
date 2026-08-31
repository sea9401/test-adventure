import { describe, expect, it } from "vitest";
import {
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
} from "@/adventure/data/v2/dangerousFishing";
import {
  applyDangerousEncounterAction,
  createDangerousEncounter,
  dangerousEncounterView,
  type DangerousEncounter,
} from "./dangerousFishingEncounter";

const STARTED_AT = 1_000;

function literalEncounter(
  patch: Partial<DangerousEncounter> = {},
): DangerousEncounter {
  return {
    id: "encounter-1",
    targetKind: "fish",
    targetId: "ironjaw_tuna",
    status: "active",
    tension: 40,
    maxTension: 100,
    stamina: 50,
    maxStamina: 50,
    distance: 50,
    startDistance: 50,
    slackTurns: 0,
    slackTolerance: 0,
    step: 0,
    revision: 0,
    nextActionAt: STARTED_AT,
    expiresAt: 200_000,
    patternSeed: 0,
    behaviorPattern: ["turn"],
    reelPowerBonus: 0,
    staminaDamageBonus: 0,
    tensionControlBonus: 0,
    ...patch,
  };
}

describe("위험 해역 장력 조우", () => {
  it("선회 중 감아올리기는 거리와 체력을 줄이지만 장력은 높인다", () => {
    const transition = applyDangerousEncounterAction(
      literalEncounter(),
      "reel",
      STARTED_AT,
      0,
    );

    expect(transition.event).toBe("progress");
    expect(transition.encounter).toMatchObject({
      distance: 41,
      stamina: 38,
      tension: 48,
      revision: 1,
      nextActionAt: 1_850,
    });
  });

  it("돌진 중 줄 풀기는 임계 장력을 낮춰 줄 끊김을 피한다", () => {
    const transition = applyDangerousEncounterAction(
      literalEncounter({
        tension: 95,
        behaviorPattern: ["charge"],
      }),
      "give",
      STARTED_AT,
      0,
    );

    expect(transition.event).toBe("progress");
    expect(transition.encounter).toMatchObject({
      tension: 73,
      distance: 58,
      status: "active",
    });
  });

  it("몸부림 중 버티기는 잘못된 입력보다 체력을 많이 깎는다", () => {
    const encounter = literalEncounter({ behaviorPattern: ["thrash"] });
    const correct = applyDangerousEncounterAction(
      encounter,
      "brace",
      STARTED_AT,
      0,
    );
    const wrong = applyDangerousEncounterAction(
      encounter,
      "reel",
      STARTED_AT,
      0,
    );

    expect(correct.encounter.stamina).toBe(38);
    expect(wrong.encounter.stamina).toBe(47);
  });

  it("최대 장력을 넘기면 줄이 끊어진다", () => {
    const transition = applyDangerousEncounterAction(
      literalEncounter({ tension: 90, behaviorPattern: ["charge"] }),
      "reel",
      STARTED_AT,
      0,
    );

    expect(transition.event).toBe("line_broken");
    expect(transition.encounter.status).toBe("failed");
  });

  it("허용치를 넘겨 두 번 연속 줄이 느슨하면 훅을 놓친다", () => {
    const first = applyDangerousEncounterAction(
      literalEncounter({ tension: 10, behaviorPattern: ["charge"] }),
      "give",
      STARTED_AT,
      0,
    );
    expect(first.encounter.slackTurns).toBe(1);

    const second = applyDangerousEncounterAction(
      first.encounter,
      "give",
      first.encounter.nextActionAt,
      first.encounter.revision,
    );
    expect(second.event).toBe("hook_lost");
    expect(second.encounter.status).toBe("failed");
  });

  it("체력과 거리가 모두 0이 된 경우에만 어획한다", () => {
    const distanceOnly = applyDangerousEncounterAction(
      literalEncounter({ stamina: 20, distance: 5 }),
      "reel",
      STARTED_AT,
      0,
    );
    const staminaOnly = applyDangerousEncounterAction(
      literalEncounter({ stamina: 5, distance: 20 }),
      "reel",
      STARTED_AT,
      0,
    );
    const both = applyDangerousEncounterAction(
      literalEncounter({ stamina: 5, distance: 5 }),
      "reel",
      STARTED_AT,
      0,
    );

    expect(distanceOnly.event).toBe("progress");
    expect(distanceOnly.encounter).toMatchObject({ stamina: 8, distance: 0 });
    expect(staminaOnly.event).toBe("progress");
    expect(staminaOnly.encounter).toMatchObject({ stamina: 0, distance: 11 });
    expect(both.event).toBe("caught");
    expect(both.encounter.status).toBe("caught");
  });

  it("입력 가능 시각 전 요청은 상태를 바꾸지 않는다", () => {
    const encounter = literalEncounter({ nextActionAt: 2_000 });
    const transition = applyDangerousEncounterAction(
      encounter,
      "reel",
      1_999,
      0,
    );

    expect(transition).toEqual({ event: "too_fast", encounter });
  });

  it("이미 처리한 revision의 재요청은 상태를 바꾸지 않는다", () => {
    const encounter = literalEncounter({ revision: 2 });
    const transition = applyDangerousEncounterAction(
      encounter,
      "reel",
      STARTED_AT,
      1,
    );

    expect(transition).toEqual({ event: "stale", encounter });
  });

  it("같은 시드는 같은 행동열을 만들지만 공개 응답에는 시드와 패턴이 없다", () => {
    const create = (id: string) =>
      createDangerousEncounter({
        id,
        targetKind: "fish",
        target: DANGEROUS_FISH.ironjaw_tuna,
        rod: DANGEROUS_RODS.starter_rod,
        reel: DANGEROUS_REELS.starter_reel,
        line: DANGEROUS_LINES.starter_line,
        startedAt: STARTED_AT,
        patternSeed: 73,
      });
    let left = create("left");
    let right = create("right");
    const leftBehaviors: string[] = [];
    const rightBehaviors: string[] = [];

    for (let step = 0; step < 4; step += 1) {
      leftBehaviors.push(dangerousEncounterView(left).behavior);
      rightBehaviors.push(dangerousEncounterView(right).behavior);
      left = applyDangerousEncounterAction(
        left,
        "brace",
        left.nextActionAt,
        left.revision,
      ).encounter;
      right = applyDangerousEncounterAction(
        right,
        "brace",
        right.nextActionAt,
        right.revision,
      ).encounter;
    }

    expect(leftBehaviors).toEqual(rightBehaviors);
    expect(dangerousEncounterView(create("public"))).not.toHaveProperty(
      "patternSeed",
    );
    expect(dangerousEncounterView(create("public"))).not.toHaveProperty(
      "behaviorPattern",
    );
  });

  it("낚시꾼 계보 예고 보정은 비공개 패턴 대신 다음 행동 한 칸만 공개한다", () => {
    const encounter = createDangerousEncounter({
      id: "telegraphed",
      targetKind: "fish",
      target: DANGEROUS_FISH.ironjaw_tuna,
      rod: DANGEROUS_RODS.starter_rod,
      reel: DANGEROUS_REELS.starter_reel,
      line: DANGEROUS_LINES.starter_line,
      startedAt: STARTED_AT,
      patternSeed: 3,
      assistance: { telegraphSteps: 1 },
    });

    const view = dangerousEncounterView(encounter);
    expect(view.telegraph).toHaveLength(1);
    expect(view).not.toHaveProperty("patternSeed");
    expect(view).not.toHaveProperty("behaviorPattern");
  });

  it("부호 비트가 선 해시도 유효한 패턴 인덱스로 정규화한다", () => {
    const created = createDangerousEncounter({
      id: "signed-seed",
      targetKind: "fish",
      target: DANGEROUS_FISH.ironjaw_tuna,
      rod: DANGEROUS_RODS.starter_rod,
      reel: DANGEROUS_REELS.starter_reel,
      line: DANGEROUS_LINES.starter_line,
      startedAt: STARTED_AT,
      patternSeed: 3,
    });

    expect(dangerousEncounterView(created).behavior).toBe("turn");
  });

  it("제한 시간이 지난 조우는 입력 없이 종료한다", () => {
    const transition = applyDangerousEncounterAction(
      literalEncounter({ expiresAt: 999 }),
      "reel",
      STARTED_AT,
      0,
    );
    expect(transition.event).toBe("timeout");
    expect(transition.encounter.status).toBe("failed");
  });
});
