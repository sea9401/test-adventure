import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPAR_DUMMY_CONFIG,
  SPARRING_DUMMY_FIELD_LIMITS,
  SPARRING_DUMMY_PRESETS,
  sanitizeSparringDummyConfig,
} from "./sparringDummy";

describe("sanitizeSparringDummyConfig", () => {
  it("body 가 없으면 예전 샌드백 기본값을 유지", () => {
    expect(sanitizeSparringDummyConfig(null)).toEqual(
      DEFAULT_SPAR_DUMMY_CONFIG,
    );
  });

  it("요청 body 의 dummy 설정을 숫자화해서 사용", () => {
    expect(
      sanitizeSparringDummyConfig({
        dummy: {
          hp: "2500000",
          atk: "120",
          def: "80",
          spd: "12",
          accuracy: "55",
          evasionPct: "20",
          critPct: "30",
          critMult: "1.76",
          maxTurns: "60",
        },
      }),
    ).toEqual({
      hp: 2_500_000,
      atk: 120,
      def: 80,
      spd: 12,
      accuracy: 55,
      evasionPct: 20,
      critPct: 30,
      critMult: 1.8,
      maxTurns: 60,
    });
  });

  it("범위를 벗어나거나 잘못된 값은 필드별 기본값/상하한으로 보정", () => {
    const sanitized = sanitizeSparringDummyConfig({
      hp: -1,
      atk: Infinity,
      def: 999_999_999,
      spd: 0,
      accuracy: 9_999,
      evasionPct: 9_999,
      critPct: 999,
      critMult: 999,
      maxTurns: 999,
    });

    expect(sanitized).toEqual({
      hp: SPARRING_DUMMY_FIELD_LIMITS.hp.min,
      atk: DEFAULT_SPAR_DUMMY_CONFIG.atk,
      def: SPARRING_DUMMY_FIELD_LIMITS.def.max,
      spd: SPARRING_DUMMY_FIELD_LIMITS.spd.min,
      accuracy: SPARRING_DUMMY_FIELD_LIMITS.accuracy.max,
      evasionPct: SPARRING_DUMMY_FIELD_LIMITS.evasionPct.max,
      critPct: SPARRING_DUMMY_FIELD_LIMITS.critPct.max,
      critMult: SPARRING_DUMMY_FIELD_LIMITS.critMult.max,
      maxTurns: SPARRING_DUMMY_FIELD_LIMITS.maxTurns.max,
    });
  });

  it("모든 프리셋은 서버 sanitize 를 그대로 통과", () => {
    for (const preset of SPARRING_DUMMY_PRESETS) {
      expect(sanitizeSparringDummyConfig({ dummy: preset.config })).toEqual(
        preset.config,
      );
    }
  });
});
