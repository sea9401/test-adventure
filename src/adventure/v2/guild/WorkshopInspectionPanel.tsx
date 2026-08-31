import { useState } from "react";
import type {
  BlacksmithPendingInspection,
  BlacksmithProgressionState,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { V2_EQUIPMENT, v2EquipStatRows } from "@/adventure/data/v2/v2Equipment";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { ERROR_TEXT } from "./guildWorkshopPanelModel";

export function WorkshopInspectionPanel({
  pending,
  onConfirmed,
  onMessage,
}: {
  pending: BlacksmithPendingInspection;
  onConfirmed: (progression: BlacksmithProgressionState) => void;
  onMessage: (message: string | null) => void;
}) {
  const [busyIndex, setBusyIndex] = useState<0 | 1 | null>(null);
  const item = V2_EQUIPMENT[pending.equipmentId];

  async function confirm(candidateIndex: 0 | 1) {
    setBusyIndex(candidateIndex);
    onMessage(null);
    try {
      const response = await fetch("/api/v2/guild/workshop/inspection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inspectionId: pending.inspectionId, candidateIndex }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "최종 검수 확정에 실패했습니다.");
        return;
      }
      onConfirmed(json.blacksmithProgression);
      onMessage(`${item.name} 최종 검수를 확정했습니다.`);
    } catch {
      onMessage("최종 검수 요청을 처리하지 못했습니다.");
    } finally {
      setBusyIndex(null);
    }
  }

  return (
    <section className={`${SURFACE_CARD} space-y-3 border-amber-400 p-3 text-xs`}>
      <div>
        <div className="font-semibold text-zinc-950 dark:text-zinc-50">
          Lv 30 최종 검수 · {item.name}
        </div>
        <div className="mt-1 text-zinc-600 dark:text-zinc-300">
          같은 {"★".repeat(pending.craftQuality.level)} 등급과 같은 총량의 두 배분안 중 하나를 확정하세요.
          확정 전에는 다른 장비를 제작할 수 없습니다.
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {pending.candidates.map((roll, index) => {
          const candidateIndex = index as 0 | 1;
          return (
            <div key={candidateIndex} className={`${SURFACE_INSET} p-3`}>
              <div className="font-semibold">후보 {candidateIndex + 1}</div>
              <div className={`${SURFACE_ACCENT} mt-2 space-y-1 p-2`}>
                {v2EquipStatRows(item, roll).map((row) => (
                  <div key={row.label} className="flex justify-between gap-3">
                    <span>{row.label}</span>
                    <strong>{row.value.replace(/^\+/, "")}</strong>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busyIndex != null}
                onClick={() => void confirm(candidateIndex)}
                className="mt-2 w-full rounded bg-amber-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950"
              >
                {busyIndex === candidateIndex ? "확정 중…" : "이 후보 확정"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
