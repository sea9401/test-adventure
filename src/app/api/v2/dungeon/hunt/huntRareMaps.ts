// 희귀 탐사 갱신 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉).
//   압축 탐사 입장 중이면 승리 시 지도 소모, 패배 시 그대로 보존한다. 일반 사냥만 신규 지도를
//   굴려 레어맵 안 재귀 farming 을 막는다.
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
  rareMapDropInstance: RareMapInstance | null;
  rareMapRunsLeft: number | null;
} {
  const { activeRareMap, won, depth, now } = params;
  let rareMaps = params.rareMaps;
  let rareMapDrop: RareMapKindId | null = null;
  let rareMapDropInstance: RareMapInstance | null = null;
  // 희귀 탐사 안에서 또 희귀 탐사가 열리는 재귀 farming 은 막는다(입장 중 롤 없음).
  // 캡 가득이면 롤 자체를 건너뜀.
  if (activeRareMap) {
    if (won) {
      rareMaps = rareMaps.filter((m) => m.iid !== activeRareMap.iid);
    }
  } else if (won && rareMaps.length < RARE_MAP_CAP) {
    rareMapDrop = rollRareMapDrop(Math.random);
    if (rareMapDrop) {
      rareMapDropInstance = newRareMapInstance(rareMapDrop, depth, now);
      rareMaps = [...rareMaps, rareMapDropInstance];
    }
  }
  const rareMapRunsLeft = activeRareMap
    ? won
      ? 0
      : activeRareMap.runsLeft
    : null;
  return {
    rareMaps,
    rareMapDrop,
    rareMapDropInstance,
    rareMapRunsLeft,
  };
}
