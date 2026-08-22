import { useState } from "react";
import {
  BLACKSMITH_SPECIALTY_LEVEL,
  BLACKSMITH_SPECIALTY_NAMES,
  type BlacksmithProgressionState,
  type BlacksmithSpecialtyId,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { ERROR_TEXT, type WorkshopState } from "./guildWorkshopPanelModel";

const SPECIALTY_DESCRIPTIONS: Record<BlacksmithSpecialtyId, string> = {
  weapon: "모든 무기에 전문 제작 기술을 적용합니다.",
  armor: "갑옷·장갑·신발에 전문 제작 기술을 적용합니다.",
  jewelry: "반지·목걸이에 전문 제작 기술을 적용합니다.",
};

export function WorkshopSpecializationPanel({
  state,
  onProgressionChange,
  onMessage,
}: {
  state: WorkshopState;
  onProgressionChange: (progression: BlacksmithProgressionState) => void;
  onMessage: (message: string | null) => void;
}) {
  const level = state.artisan.blacksmith.level;
  const progression = state.blacksmithProgression ?? {};
  const [confirming, setConfirming] = useState<BlacksmithSpecialtyId | null>(null);
  const [busy, setBusy] = useState(false);
  const [signatureIid, setSignatureIid] = useState(
    progression.signatureIid ?? state.signatureCandidates?.[0]?.iid ?? "",
  );

  async function chooseSpecialty(specialty: BlacksmithSpecialtyId) {
    if (confirming !== specialty) {
      setConfirming(specialty);
      return;
    }
    setBusy(true);
    onMessage(null);
    try {
      const response = await fetch("/api/v2/guild/workshop/specialization", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specialty }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "전문 분야 선택에 실패했습니다.");
        return;
      }
      onProgressionChange(json.blacksmithProgression);
      setConfirming(null);
      onMessage(`${BLACKSMITH_SPECIALTY_NAMES[specialty]} 전문 분야를 영구 선택했습니다.`);
    } catch {
      onMessage("전문 분야 선택 요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function designateSignature() {
    if (!signatureIid) return;
    setBusy(true);
    onMessage(null);
    try {
      const response = await fetch("/api/v2/guild/workshop/signature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: signatureIid }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "대표작 지정에 실패했습니다.");
        return;
      }
      onProgressionChange(json.blacksmithProgression);
      onMessage("대표작을 지정했습니다. 장비 성능은 변하지 않습니다.");
    } catch {
      onMessage("대표작 지정 요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (level < BLACKSMITH_SPECIALTY_LEVEL) {
    return (
      <section className={`${SURFACE_CARD} p-3 text-xs`}>
        <div className="font-semibold text-zinc-950 dark:text-zinc-50">대장장이 전문 분야</div>
        <div className="mt-1 text-zinc-600 dark:text-zinc-300">
          Lv {BLACKSMITH_SPECIALTY_LEVEL}에 영구 전문 분야 선택이 해금됩니다.
        </div>
      </section>
    );
  }

  if (!progression.specialty) {
    return (
      <section className={`${SURFACE_CARD} space-y-3 p-3 text-xs`}>
        <div>
          <div className="font-semibold text-zinc-950 dark:text-zinc-50">영구 전문 분야 선택</div>
          <div className="mt-1 text-rose-700 dark:text-rose-300">
            한 번 선택하면 변경하거나 초기화할 수 없습니다. 다른 분야 장비도 일반 제작은 가능합니다.
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {(Object.keys(BLACKSMITH_SPECIALTY_NAMES) as BlacksmithSpecialtyId[]).map(
            (specialty) => (
              <button
                key={specialty}
                type="button"
                disabled={busy}
                onClick={() => void chooseSpecialty(specialty)}
                className={`${SURFACE_INSET} p-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {BLACKSMITH_SPECIALTY_NAMES[specialty]}
                </div>
                <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                  {SPECIALTY_DESCRIPTIONS[specialty]}
                </div>
                <div className="mt-2 font-semibold text-amber-700 dark:text-amber-300">
                  {confirming === specialty ? "다시 눌러 영구 확정" : "선택"}
                </div>
              </button>
            ),
          )}
        </div>
      </section>
    );
  }

  const candidates = state.signatureCandidates ?? [];
  return (
    <section className={`${SURFACE_CARD} space-y-3 p-3 text-xs`}>
      <div>
        <div className="font-semibold text-zinc-950 dark:text-zinc-50">
          선택 분야 · {BLACKSMITH_SPECIALTY_NAMES[progression.specialty]}
        </div>
        <div className="mt-1 text-zinc-600 dark:text-zinc-300">
          전문 분야는 변경할 수 없습니다. 제작 기술은 해당 분야 장비에만 적용됩니다.
        </div>
      </div>
      {level >= 28 ? (
        <div className={`${SURFACE_ACCENT} p-3`}>
          <div className="font-semibold">대표작</div>
          <div className="mt-1 text-zinc-600 dark:text-zinc-300">
            직접 만든 전문 분야 장비를 전시합니다. 성능 보너스는 없습니다.
          </div>
          {candidates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                aria-label="대표작 장비"
                value={signatureIid}
                onChange={(event) => setSignatureIid(event.target.value)}
                className="min-w-48 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.iid} value={candidate.iid}>
                    {candidate.itemName}
                    {candidate.masterwork ? " · 명장" : ""}
                    {candidate.craftQualityLevel > 0
                      ? ` · ${"★".repeat(candidate.craftQualityLevel)}`
                      : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !signatureIid}
                onClick={() => void designateSignature()}
                className="rounded bg-amber-700 px-3 py-1 font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950"
              >
                대표작 지정
              </button>
            </div>
          ) : (
            <div className="mt-2 text-zinc-500">지정할 수 있는 보유 제작품이 없습니다.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
