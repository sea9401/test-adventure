// 레어맵(소모품 지도) 갱신 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉).
//   입장 중이면 판수 차감(승패 무관)·소진 시 purge, 아니면 신규 드랍 롤(레어맵 안 재귀 farming 차단).
//   ⚠️ rollRareMapDrop(Math.random) 한 곳만 RNG 소비 — 원본과 동일 위치에서 호출되어야 byte-identical.
import {
  RARE_MAP_CAP,
  newRareMapInstance,
  rollRareMapDrop,
  type RareMapInstance,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";

export function updateRareMaps(params: {
  activeRareMap: RareMapInstance | null;
  rareMaps: RareMapInstance[];
  won: boolean;
  depth: number;
  now: number;
}): {
  rareMaps: RareMapInstance[];
  rareMapDrop: RareMapKindId | null;
  rareMapRunsLeft: number | null;
} {
  const { activeRareMap, won, depth, now } = params;
  let rareMaps = params.rareMaps;
  let rareMapDrop: RareMapKindId | null = null;
  // 레어맵 안에서 또 지도가 떨어지는 재귀 farming 은 막는다(입장 중 롤 없음).
  // 캡 가득이면 롤 자체를 건너뜀.
  if (activeRareMap) {
    rareMaps = rareMaps
      .map((m) =>
        m.iid === activeRareMap.iid ? { ...m, runsLeft: m.runsLeft - 1 } : m,
      )
      .filter((m) => m.runsLeft > 0);
  } else if (won && rareMaps.length < RARE_MAP_CAP) {
    rareMapDrop = rollRareMapDrop(Math.random);
    if (rareMapDrop) {
      rareMaps = [...rareMaps, newRareMapInstance(rareMapDrop, depth, now)];
    }
  }
  const rareMapRunsLeft = activeRareMap
    ? (rareMaps.find((m) => m.iid === activeRareMap.iid)?.runsLeft ?? 0)
    : null;
  return { rareMaps, rareMapDrop, rareMapRunsLeft };
}
