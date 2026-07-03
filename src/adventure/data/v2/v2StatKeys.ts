// v2 전투 재설계 PR-2 — v2 전용 스탯 키 공간.
//
// 라이브 stats.ts 의 STAT_KEYS(str/dex/vit/spd/luk/int)는 라이브 게임과 공유라 못 건드린다.
// v2 는 6 1차 스탯이 다르므로(속도 1차 → 파생, 정신 신설) 여기 별도 정의한다.
// 설계: docs/v2-combat-redesign.md §4.
//
// 6 1차 (각 직업군 앵커): 힘·민첩·활력·지능·정신·행운.
//   - 속도(spd)는 1차에서 빠지고 민첩에서 파생(derivePlayerCombatV2). 장비 속도 보너스는 파생 속도에 합산.
//   - 정신(spi)은 신규 — 마법방어·치명저항·회복 축의 앵커.

export const V2_STAT_KEYS = ["str", "dex", "vit", "int", "spi", "luk"] as const;
export type V2StatKey = (typeof V2_STAT_KEYS)[number];

export const V2_STAT_LABELS: Record<V2StatKey, string> = {
  str: "힘",
  dex: "민첩",
  vit: "활력",
  int: "지능",
  spi: "정신",
  luk: "행운",
};

// 단련/성장 UI 의 스탯 설명. (Codex §4 매핑 요약.)
export const V2_STAT_DESCRIPTIONS: Record<V2StatKey, string> = {
  str: "물리 공격력·최소 데미지. 명중·치명타 피해 보조.",
  dex: "속도. 명중·회피 보조.",
  vit: "물리 방어력·최대 HP·회복량.",
  int: "마법 공격력·최소 데미지. 마법 방어 보조.",
  spi: "마법형 적 대응의 핵심. 마법 방어력·치명타 저항·회복·명중.",
  luk: "치명타 확률·치명타 피해. 회피 보조.",
};

export function parseV2StatKey(raw: unknown): V2StatKey | null {
  return typeof raw === "string" &&
    (V2_STAT_KEYS as readonly string[]).includes(raw)
    ? (raw as V2StatKey)
    : null;
}

// 빈(0) 분배 맵 — 라우트/derive 가 base 위에 더할 때 초기값.
export function emptyV2StatMap(): Record<V2StatKey, number> {
  return { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
}
