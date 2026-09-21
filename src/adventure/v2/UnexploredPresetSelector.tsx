import {
  UNEXPLORED_PRESET_INDEXES,
  type UnexploredPresetIndex,
} from "@/adventure/data/v2/unexploredState";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";

export function UnexploredPresetSelector({
  snapshot,
  busy,
  onSelect,
}: {
  snapshot: UnexploredClientSnapshot;
  busy: boolean;
  onSelect: (presetIndex: UnexploredPresetIndex) => void;
}) {
  return (
    <section className={`${SURFACE_CARD} space-y-2 p-3`}>
      <div role="group" aria-label="개척 노드 프리셋" className="grid grid-cols-3 gap-2">
        {UNEXPLORED_PRESET_INDEXES.map((index) => {
          const active = snapshot.activePresetIndex === index;
          const spent = active ? snapshot.spentPoints : snapshot.nodePresets[index].length;
          return (
            <Button
              key={index}
              aria-label={`프리셋 ${index + 1}`}
              aria-pressed={active}
              variant={active ? "primary" : "secondary"}
              disabled={!snapshot.eligible || busy}
              className="py-2 [&>[data-button-content]]:flex-col [&>[data-button-content]]:gap-0.5"
              onClick={() => { if (!active) onSelect(index); }}
            >
              <span>프리셋 {index + 1}</span>
              <span className="text-xs">{spent} / {snapshot.earnedPoints}P</span>
              <span className="text-xs">{active ? "사용 중" : "전환"}</span>
            </Button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        각 프리셋에 포인트를 따로 배분할 수 있으며, 사용 중인 프리셋의 효과만 적용됩니다.
        전환은 무료이며 배분은 자동 저장됩니다. 노드 반환·초기화는 현재 프리셋에서만 진행되며,
        시작 노드를 제외한 반환 노드당 {snapshot.refundGoldCost.toLocaleString()}G가 필요합니다.
      </p>
    </section>
  );
}
