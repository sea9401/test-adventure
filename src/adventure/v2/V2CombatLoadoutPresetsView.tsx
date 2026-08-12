"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  FloppyDisk,
  Lightning,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { CombatLoadoutPresetSlots as CombatLoadoutPresetSlotData } from "@/adventure/data/v2/combatLoadoutPresets";
import { Button } from "@/components/ui/Button";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useSystemMessageState } from "./RewardToastProvider";

type ExcludedPresetItems = {
  skillIds: string[];
  equipmentIids: string[];
};

type PresetResponse = {
  ok: true;
  presets: CombatLoadoutPresetSlotData;
  activeSlot: number | null;
  excluded?: ExcludedPresetItems;
};

function formatSavedAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "저장 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function applyResultMessage(
  name: string,
  excluded: ExcludedPresetItems,
): string {
  const skillCount = excluded.skillIds.length;
  const equipmentCount = excluded.equipmentIids.length;
  if (skillCount === 0 && equipmentCount === 0) {
    return `'${name}' 프리셋의 스킬·전투패턴·장비를 적용했어요.`;
  }
  const excludedText = [
    skillCount > 0 ? `스킬 ${skillCount}개` : "",
    equipmentCount > 0 ? `장비 ${equipmentCount}개` : "",
  ]
    .filter(Boolean)
    .join("와 ");
  return `'${name}' 프리셋을 적용했어요. 사용할 수 없는 ${excludedText}는 제외했어요.`;
}

export function CombatLoadoutPresetSlots({
  presets,
  activeSlot,
  busySlot,
  draftNames,
  onDraftNameChange,
  onSave,
  onApply,
  onDelete,
  onOverwrite,
}: {
  presets: CombatLoadoutPresetSlotData;
  activeSlot: number | null;
  busySlot: number | null;
  draftNames: string[];
  onDraftNameChange: (slot: number, name: string) => void;
  onSave: (slot: number) => void;
  onApply: (slot: number) => void;
  onDelete: (slot: number) => void;
  onOverwrite: (slot: number) => void;
}) {
  const disabled = busySlot !== null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 5 }, (_, slot) => {
        const preset = presets[slot] ?? null;
        const active = activeSlot === slot;
        const equipmentCount = preset
          ? Object.values(preset.equipment).filter(Boolean).length
          : 0;
        return (
          <section
            key={slot}
            className={`${SURFACE_CARD} flex min-h-52 flex-col p-4`}
            aria-label={`전투 프리셋 슬롯 ${slot + 1}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  슬롯 {slot + 1}
                </div>
                <h2 className="mt-0.5 font-bold text-zinc-900 dark:text-zinc-100">
                  {preset?.name ?? "빈 프리셋"}
                </h2>
              </div>
              {active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle size={13} weight="fill" /> 적용 중
                </span>
              ) : null}
            </div>

            {preset ? (
              <>
                <div className={`${SURFACE_INSET} mt-3 grid grid-cols-3 gap-2 p-3 text-center`}>
                  <div>
                    <div className="text-sm font-bold">{preset.skills.length}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      스킬 {preset.skills.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">
                      {preset.pattern?.blocks.length ?? 0}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      전투패턴 {preset.pattern?.blocks.length ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">{equipmentCount}/6</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      장비 {equipmentCount}/6
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {formatSavedAt(preset.savedAt)} 저장
                </p>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                  <Button
                    variant="success"
                    size="xs"
                    disabled={disabled}
                    onClick={() => onApply(slot)}
                    aria-label={`${preset.name} 프리셋 적용`}
                  >
                    <Lightning size={14} /> 적용
                  </Button>
                  <Button
                    size="xs"
                    disabled={disabled}
                    onClick={() => onOverwrite(slot)}
                    aria-label={`${preset.name} 프리셋을 현재 세팅으로 덮어쓰기`}
                  >
                    <FloppyDisk size={14} /> 현재 세팅으로 덮어쓰기
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    disabled={disabled}
                    onClick={() => onDelete(slot)}
                    aria-label={`${preset.name} 프리셋 삭제`}
                    className="col-span-2"
                  >
                    <Trash size={14} /> 삭제
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex flex-1 flex-col">
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  현재 장착한 스킬, 전투패턴, 장비를 이 슬롯에 함께 저장합니다.
                </p>
                <label className="mt-3 text-xs font-medium" htmlFor={`preset-name-${slot}`}>
                  프리셋 이름
                </label>
                <input
                  id={`preset-name-${slot}`}
                  value={draftNames[slot] ?? ""}
                  maxLength={24}
                  disabled={disabled}
                  onChange={(event) => onDraftNameChange(slot, event.target.value)}
                  placeholder={`프리셋 ${slot + 1}`}
                  className="mt-1 min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
                />
                <Button
                  variant="success"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSave(slot)}
                  className="mt-auto"
                  fullWidth
                >
                  <FloppyDisk size={15} /> 현재 세팅 저장
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function V2CombatLoadoutPresetsView({ onBack }: { onBack: () => void }) {
  const [presets, setPresets] = useState<CombatLoadoutPresetSlotData>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [draftNames, setDraftNames] = useState(["", "", "", "", ""]);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [excluded, setExcluded] = useState<ExcludedPresetItems | null>(null);
  const [, setMessage] = useSystemMessageState();

  const acceptResponse = useCallback((response: PresetResponse) => {
    setPresets(response.presets);
    setActiveSlot(response.activeSlot);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/v2/me/combat-loadout-presets");
      const json = (await response.json().catch(() => null)) as PresetResponse | null;
      if (!response.ok || !json?.ok) throw new Error("load failed");
      acceptResponse(json);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [acceptResponse]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 서버 프리셋 조회
    void load();
  }, [load]);

  const mutate = useCallback(
    async (
      slot: number,
      action: "save" | "apply" | "delete",
      name?: string,
    ): Promise<PresetResponse | null> => {
      if (busySlot !== null) return null;
      setBusySlot(slot);
      setExcluded(null);
      try {
        const response = await fetch("/api/v2/me/combat-loadout-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, slot, name }),
        });
        const json = (await response.json().catch(() => null)) as PresetResponse | null;
        if (!response.ok || !json?.ok) throw new Error("mutation failed");
        acceptResponse(json);
        return json;
      } catch {
        setMessage("✗ 전투 프리셋을 변경하지 못했어요.");
        return null;
      } finally {
        setBusySlot(null);
      }
    },
    [acceptResponse, busySlot, setMessage],
  );

  const save = useCallback(
    async (slot: number) => {
      const result = await mutate(slot, "save", draftNames[slot]);
      if (!result) return;
      const name = result.presets[slot]?.name ?? `프리셋 ${slot + 1}`;
      setDraftNames((previous) => previous.map((value, index) => (index === slot ? "" : value)));
      setMessage(`✓ '${name}' 프리셋에 현재 세팅을 저장했어요.`);
    },
    [draftNames, mutate, setMessage],
  );

  const overwrite = useCallback(
    async (slot: number) => {
      const current = presets[slot];
      if (!current) return;
      const result = await mutate(slot, "save", current.name);
      if (result) setMessage(`✓ '${current.name}' 프리셋을 현재 세팅으로 덮어썼어요.`);
    },
    [mutate, presets, setMessage],
  );

  const apply = useCallback(
    async (slot: number) => {
      const current = presets[slot];
      if (!current) return;
      const result = await mutate(slot, "apply");
      if (!result) return;
      const skipped = result.excluded ?? { skillIds: [], equipmentIids: [] };
      setExcluded(skipped.skillIds.length + skipped.equipmentIids.length > 0 ? skipped : null);
      setMessage(`✓ ${applyResultMessage(current.name, skipped)}`);
    },
    [mutate, presets, setMessage],
  );

  const remove = useCallback(
    async (slot: number) => {
      const current = presets[slot];
      if (!current) return;
      const result = await mutate(slot, "delete");
      if (result) setMessage(`✓ '${current.name}' 프리셋을 삭제했어요.`);
    },
    [mutate, presets, setMessage],
  );

  return (
    <main className="mx-auto max-w-[760px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader title="전투 프리셋" onBack={onBack} />
      <section className={`${SURFACE_CARD} p-4`}>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          현재 장착한 스킬, 전투패턴, 장비를 한 칸에 함께 저장하고 한 번에 바꿀 수 있습니다.
          스킬 전용 프리셋과 아레나 전투 템플릿은 별도로 유지됩니다.
        </p>
      </section>

      {excluded ? (
        <div className={`${SURFACE_ACCENT} flex items-start gap-2 p-3 text-sm`} role="status">
          <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            사용할 수 없는 스킬 {excluded.skillIds.length}개와 장비 {excluded.equipmentIids.length}개는
            제외하고 적용했습니다.
          </p>
        </div>
      ) : null}

      {loadError ? (
        <LoadErrorBanner onRetry={load} message="전투 프리셋을 불러오지 못했습니다." />
      ) : loading ? (
        <div className={`${SURFACE_CARD} p-8 text-center text-sm text-zinc-500`}>
          프리셋을 불러오는 중…
        </div>
      ) : (
        <CombatLoadoutPresetSlots
          presets={presets}
          activeSlot={activeSlot}
          busySlot={busySlot}
          draftNames={draftNames}
          onDraftNameChange={(slot, name) =>
            setDraftNames((previous) =>
              previous.map((value, index) => (index === slot ? name : value)),
            )
          }
          onSave={(slot) => void save(slot)}
          onApply={(slot) => void apply(slot)}
          onDelete={(slot) => void remove(slot)}
          onOverwrite={(slot) => void overwrite(slot)}
        />
      )}
    </main>
  );
}
