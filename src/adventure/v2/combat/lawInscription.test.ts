import { describe, expect, it } from "vitest";
import {
  addLawInscriptionGain,
  canReleaseLawInscriptions,
  emptyLawInscriptionState,
  lawInscriptionGainForCast,
  lawInscriptionGainLog,
  lawInscriptionConsumeLog,
  lawInscriptionRelease,
  lawInscriptionSnapshot,
  lawInscriptionTotal,
  normalizeLawInscriptionState,
} from "./lawInscription";

describe("법칙 각인 순수 상태", () => {
  it("손상 값을 정수 0~2로 정규화하고 누락값은 0으로 만든다", () => {
    expect(
      normalizeLawInscriptionState({
        assault: 4.8,
        reflux: -1,
        erosion: Number.NaN,
        ward: 1.9,
      }),
    ).toEqual({ assault: 2, reflux: 0, erosion: 0, ward: 1 });
    expect(normalizeLawInscriptionState(undefined)).toEqual(
      emptyLawInscriptionState(),
    );
  });

  it("네 문장 재료를 각 종류 +1로 매핑하고 각인 증폭은 생성량을 늘리지 않는다", () => {
    expect(
      lawInscriptionGainForCast("v2c_inscriber_release", [
        "v2c_mage_acumen",
        "v2c_caster_acumen",
        "v2c_magus_acumen3",
        "v2c_runecaster_circuit",
        "v2c_inscriber_amplification",
      ]),
    ).toEqual({ assault: 1, reflux: 1, erosion: 1, ward: 1 });
    expect(
      lawInscriptionGainForCast("v2c_runecaster_grandsigil", [
        "v2c_mage_acumen",
      ]),
    ).toEqual({ assault: 1, reflux: 0, erosion: 0, ward: 0 });
    expect(
      lawInscriptionGainForCast("v2c_lawweaver_release", [
        "v2c_mage_acumen",
      ]),
    ).toEqual(emptyLawInscriptionState());
  });

  it("종류별 2와 총 8 상한을 적용하고 실제 증가량도 반환한다", () => {
    const result = addLawInscriptionGain(
      { assault: 2, reflux: 1, erosion: 2, ward: 1 },
      { assault: 1, reflux: 1, erosion: 1, ward: 1 },
    );
    expect(result.state).toEqual({ assault: 2, reflux: 2, erosion: 2, ward: 2 });
    expect(result.gained).toEqual({ assault: 0, reflux: 1, erosion: 0, ward: 1 });
    expect(lawInscriptionTotal(result.state)).toBe(8);
  });

  it("총합 3부터 해방하고 개수·종류·완성 효과를 계산한다", () => {
    expect(canReleaseLawInscriptions({ assault: 2 })).toBe(false);
    expect(canReleaseLawInscriptions({ assault: 2, reflux: 1 })).toBe(true);

    const three = lawInscriptionRelease({ assault: 2, reflux: 1 });
    expect(three).toMatchObject({
      total: 3,
      distinct: 2,
      diversityDamagePct: 6,
      manaRestorePctMaxMp: 4,
      magicVulnerabilityPct: 0,
      shieldPctMaxMp: 0,
      complete: false,
    });
    expect(three.effects).toEqual([
      { kind: "damage", statCoef: 2.279, baseFlat: 530, scaling: "magic" },
      { kind: "damage", statCoef: 0.318, baseFlat: 85, scaling: "magic" },
      { kind: "damage", statCoef: 0.318, baseFlat: 85, scaling: "magic" },
      { kind: "manaRestore", pctMaxMp: 4 },
    ]);

    const complete = lawInscriptionRelease({
      assault: 2,
      reflux: 2,
      erosion: 2,
      ward: 2,
    });
    expect(complete).toMatchObject({
      total: 8,
      distinct: 4,
      diversityDamagePct: 18,
      manaRestorePctMaxMp: 8,
      magicVulnerabilityPct: 14,
      shieldPctMaxMp: 14,
      complete: true,
    });
    expect(complete.effects).toEqual([
      { kind: "damage", statCoef: 4.012, baseFlat: 944, scaling: "magic" },
      { kind: "damage", statCoef: 0.354, baseFlat: 94, scaling: "magic" },
      { kind: "damage", statCoef: 0.354, baseFlat: 94, scaling: "magic" },
      { kind: "manaRestore", pctMaxMp: 8 },
      { kind: "shield", pctMaxMp: 14, turns: 3 },
      { kind: "damage", statCoef: 0.649, baseFlat: 189, scaling: "magic" },
      { kind: "selfHaste", pct: 35 },
    ]);
  });

  it("리플레이 스냅샷은 활성 상태만 승인 문구로 만든다", () => {
    expect(lawInscriptionSnapshot(undefined)).toBeUndefined();
    expect(
      lawInscriptionSnapshot({ assault: 2, reflux: 2, erosion: 0, ward: 0 }),
    ).toEqual({ lawInscriptions: "4/8 · 공격 2 · 환류 2" });
  });

  it("실제 증가와 유효 소비에만 승인 로그를 만든다", () => {
    expect(
      lawInscriptionGainLog(
        { assault: 1, reflux: 1 },
        { assault: 2, reflux: 2 },
      ),
    ).toBe("법칙 각인: 공격 +1 · 환류 +1 (총 4/8)");
    expect(
      lawInscriptionGainLog(emptyLawInscriptionState(), {
        assault: 2,
        reflux: 2,
      }),
    ).toBeUndefined();
    expect(lawInscriptionConsumeLog({ assault: 2 })).toBeUndefined();
    expect(
      lawInscriptionConsumeLog({ assault: 2, reflux: 2 }),
    ).toBe("만상각인 해방: 공격 2 · 환류 2 소비");
  });
});
