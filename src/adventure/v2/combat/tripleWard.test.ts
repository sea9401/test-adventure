import { describe, expect, it } from "vitest";
import {
  consumePurificationWard,
  initialTripleWardState,
  mergeTripleWardResourceSnapshot,
  refreshTripleWardState,
  resolveTripleWardDamage,
  tripleWardResourceSnapshot,
  tripleWardStabilityReductionPct,
  type TripleWardDamageKind,
} from "./tripleWard";

describe("삼중 결계", () => {
  it("대결계사는 세 결계를 1회씩, 만법수호자는 3회씩 시작한다", () => {
    expect(initialTripleWardState(0)).toEqual({
      rank: 0,
      physical: 0,
      magic: 0,
      purification: 0,
      stabilityStacks: 0,
    });
    expect(initialTripleWardState(1)).toMatchObject({
      rank: 1,
      physical: 1,
      magic: 1,
      purification: 1,
    });
    expect(initialTripleWardState(2)).toMatchObject({
      rank: 2,
      physical: 3,
      magic: 3,
      purification: 3,
    });
  });

  it("직접 피해의 모든 유효 타격을 감소시키고 해당 결계를 1회 소비한다", () => {
    const result = resolveTripleWardDamage(
      initialTripleWardState(1),
      "physical",
      "pve",
      [100, 100, 100],
    );

    expect(result).toMatchObject({
      damages: [55, 55, 55],
      totalDamage: 165,
      consumed: true,
      reductionPct: 45,
      remaining: 0,
    });
    expect(result.state.physical).toBe(0);
    expect(result.state.magic).toBe(1);
  });

  it("0 피해는 건너뛰고 첫 양수 타격에 결계를 사용한다", () => {
    const result = resolveTripleWardDamage(
      initialTripleWardState(1),
      "magic",
      "pve",
      [0, 80, 20],
    );

    expect(result.damages).toEqual([0, 44, 11]);
    expect(result.state.magic).toBe(0);
  });

  it("만법수호자의 감소율은 PvE 60%, PvP 40%이며 소모 시 영역 안정이 쌓인다", () => {
    const pve = resolveTripleWardDamage(
      initialTripleWardState(2),
      "magic",
      "pve",
      [100],
    );
    const pvp = resolveTripleWardDamage(
      initialTripleWardState(2),
      "magic",
      "pvp",
      [100],
    );

    expect(pve.damages).toEqual([40]);
    expect(pvp.damages).toEqual([60]);
    expect(pve.state.stabilityStacks).toBe(1);
    expect(tripleWardStabilityReductionPct(pve.state)).toBe(4);
  });

  it("정화결계는 상태이상을 1회 막고 영역 안정은 최대 3중첩이다", () => {
    let state = initialTripleWardState(2);
    for (let index = 0; index < 4; index += 1) {
      state = consumePurificationWard(state).state;
    }

    expect(state.purification).toBe(0);
    expect(state.stabilityStacks).toBe(3);
    expect(consumePurificationWard(state).consumed).toBe(false);
  });

  it("만법불침은 패시브가 없어도 기본 결계를, 영역 장착 시 강화 결계를 갱신한다", () => {
    const empty = initialTripleWardState(0);
    const basic = refreshTripleWardState(empty, 0);
    const domain = refreshTripleWardState(
      { ...initialTripleWardState(2), physical: 0, magic: 1 },
      2,
    );

    expect(basic).toMatchObject({ rank: 1, physical: 1, magic: 1, purification: 1 });
    expect(domain).toMatchObject({ rank: 2, physical: 3, magic: 3, purification: 3 });
  });

  it("전투 자원 스냅샷은 결계 미사용 전투에서는 생략한다", () => {
    expect(tripleWardResourceSnapshot(initialTripleWardState(0))).toBeNull();
    expect(
      mergeTripleWardResourceSnapshot(undefined, initialTripleWardState(0)),
    ).toBeUndefined();
    expect(tripleWardResourceSnapshot(initialTripleWardState(2))).toEqual({
      physicalWard: 3,
      magicWard: 3,
      purificationWard: 3,
      domainStability: 0,
    });
    expect(
      mergeTripleWardResourceSnapshot(
        { arcaneOverload: 75 },
        initialTripleWardState(1),
      ),
    ).toMatchObject({ arcaneOverload: 75, physicalWard: 1 });
  });
});

it("마지막 결계도 5연타 전체를 줄이며 0 피해만 있으면 소비하지 않는다", () => {
  const state = { ...initialTripleWardState(2), physical: 1 };
  const empty = resolveTripleWardDamage(state, "physical", "pvp", [0, 0]);
  expect(empty.state).toEqual(state);
  expect(empty.consumed).toBe(false);
  const result = resolveTripleWardDamage(state, "physical", "pvp", [100, 100, 100, 100, 100]);
  expect(result.damages).toEqual([60, 60, 60, 60, 60]);
  expect(result.totalDamage).toBe(300);
  expect(result.state).toMatchObject({ physical: 0, stabilityStacks: 1 });
});

it("순차 타격에서도 유형별 결계를 한 번만 소비하고 다음 스킬로 보호를 넘기지 않는다", () => {
  const action = new Map<TripleWardDamageKind, number>();
  const start = initialTripleWardState(1);
  const zero = resolveTripleWardDamage(start, "physical", "pvp", [0], action);
  expect(zero.consumed).toBe(false);
  expect(action.size).toBe(0);
  const physical = resolveTripleWardDamage(start, "physical", "pvp", [100], action);
  const magic = resolveTripleWardDamage(physical.state, "magic", "pvp", [100], action);
  const followup = resolveTripleWardDamage(magic.state, "physical", "pvp", [100], action);
  expect(physical.totalDamage).toBe(70);
  expect(magic.totalDamage).toBe(70);
  expect(followup.totalDamage).toBe(70);
  expect(followup.consumed).toBe(false);
  expect(followup.state).toMatchObject({ physical: 0, magic: 0 });
  expect(resolveTripleWardDamage(followup.state, "physical", "pvp", [100], new Map()).totalDamage).toBe(100);
});
