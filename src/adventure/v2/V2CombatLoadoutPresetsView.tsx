"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  FloppyDisk,
  Lightning,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  CombatLoadoutPreset,
  CombatLoadoutPresetSlots as CombatLoadoutPresetSlotData,
} from "@/adventure/data/v2/combatLoadoutPresets";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";
import { TextInput } from "@/components/ui/TextInput";
import { useSystemMessageState } from "./RewardToastProvider";
import {
  confirmPresetDelete,
  confirmPresetOverwrite,
} from "./presetConfirmation";

const PRESET_SLOT_COUNT = 5;

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

export function firstEmptyPresetSlot(
  presets: CombatLoadoutPresetSlotData,
): number | null {
  for (let slot = 0; slot < PRESET_SLOT_COUNT; slot += 1) {
    if (!presets[slot]) return slot;
  }
  return null;
}

// 저장 카드 하나 + 저장된 프리셋 행. 빈 칸은 카드로 늘어놓지 않고 개수로만 알린다.
export function CombatLoadoutPresetList({
  presets,
  activeSlot,
  busySlot,
  draftName,
  onDraftNameChange,
  onSave,
  onApply,
  onDelete,
  onOverwrite,
}: {
  presets: CombatLoadoutPresetSlotData;
  activeSlot: number | null;
  busySlot: number | null;
  draftName: string;
  onDraftNameChange: (name: string) => void;
  onSave: () => void;
  onApply: (slot: number) => void;
  onDelete: (slot: number) => void;
  onOverwrite: (slot: number) => void;
}) {
  const disabled = busySlot !== null;
  const emptySlot = firstEmptyPresetSlot(presets);
  const saved = Array.from({ length: PRESET_SLOT_COUNT }, (_, slot) => ({
    slot,
    preset: presets[slot] ?? null,
  })).filter(
    (entry): entry is { slot: number; preset: CombatLoadoutPreset } =>
      entry.preset !== null,
  );
  const emptyCount = PRESET_SLOT_COUNT - saved.length;

  return (
    <div className="space-y-4">
      <section className={`${SURFACE_CARD} space-y-3 p-4`} aria-label="현재 세팅 저장">
        <label className="block text-sm font-semibold" htmlFor="preset-name">
          지금 장착한 스킬·전투패턴·장비 저장
        </label>
        <div className="flex gap-2">
          <TextInput
            id="preset-name"
            value={draftName}
            maxLength={24}
            disabled={disabled || emptySlot === null}
            onChange={(event) => onDraftNameChange(event.target.value)}
            placeholder={emptySlot === null ? "빈 칸 없음" : `프리셋 ${emptySlot + 1}`}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="md"
            disabled={disabled || emptySlot === null}
            onClick={onSave}
            className="shrink-0"
          >
            <FloppyDisk size={16} aria-hidden /> 현재 세팅 저장
          </Button>
        </div>
        {emptySlot === null ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            빈 칸이 없습니다. 아래 프리셋을 덮어쓰거나 삭제하세요.
          </p>
        ) : null}
      </section>

      {saved.length === 0 ? (
        <EmptyState
          icon={<FloppyDisk size={32} aria-hidden />}
          title="저장한 프리셋이 없습니다"
          message={`보스용·사냥용처럼 세팅을 ${PRESET_SLOT_COUNT}개까지 저장해 두고 한 번에 바꿀 수 있습니다.`}
        />
      ) : (
        <section
          className={`${SURFACE_CARD} divide-y divide-zinc-200 dark:divide-zinc-700`}
          aria-label="저장한 프리셋"
        >
          {saved.map(({ slot, preset }) => {
            const equipmentCount = Object.values(preset.equipment).filter(Boolean).length;
            return (
              <article key={slot} className="space-y-2 px-4 py-3" aria-label={`전투 프리셋 ${preset.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-zinc-900 dark:text-zinc-100">
                      {preset.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      스킬 {preset.skills.length} · 패턴 {preset.pattern?.blocks.length ?? 0} · 장비{" "}
                      {equipmentCount}/6
                      <span className="mx-1">·</span>
                      {formatSavedAt(preset.savedAt)} 저장
                    </p>
                  </div>
                  {activeSlot === slot ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle size={14} weight="fill" aria-hidden /> 적용 중
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onApply(slot)}
                    aria-label={`${preset.name} 프리셋 적용`}
                  >
                    <Lightning size={14} aria-hidden /> 적용
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onOverwrite(slot)}
                    aria-label={`${preset.name} 프리셋을 현재 세팅으로 덮어쓰기`}
                  >
                    덮어쓰기
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onDelete(slot)}
                    aria-label={`${preset.name} 프리셋 삭제`}
                    className="ml-auto"
                  >
                    <Trash size={14} aria-hidden /> 삭제
                  </Button>
                </div>
              </article>
            );
          })}
          {emptyCount > 0 ? (
            <p className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">빈 칸 {emptyCount}개</p>
          ) : null}
        </section>
      )}
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
  const [draftName, setDraftName] = useState("");
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

  const save = useCallback(async () => {
    const slot = firstEmptyPresetSlot(presets);
    if (slot === null) return;
    const result = await mutate(slot, "save", draftName);
    if (!result) return;
    const name = result.presets[slot]?.name ?? `프리셋 ${slot + 1}`;
    setDraftName("");
    setMessage(`✓ '${name}' 프리셋에 현재 세팅을 저장했어요.`);
  }, [draftName, mutate, presets, setMessage]);

  const overwrite = useCallback(
    async (slot: number) => {
      const current = presets[slot];
      if (!current) return;
      await confirmPresetOverwrite({
        name: current.name,
        onConfirm: async () => {
          const result = await mutate(slot, "save", current.name);
          if (result) {
            setMessage(`✓ '${current.name}' 프리셋을 현재 세팅으로 덮어썼어요.`);
          }
        },
      });
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
      await confirmPresetDelete({
        name: current.name,
        onConfirm: async () => {
          const result = await mutate(slot, "delete");
          if (result) setMessage(`✓ '${current.name}' 프리셋을 삭제했어요.`);
        },
      });
    },
    [mutate, presets, setMessage],
  );

  return (
    <main className="mx-auto max-w-[760px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title="전투 프리셋"
        onBack={onBack}
        help={
          <p>
            현재 장착한 스킬, 전투패턴, 장비를 한 칸에 함께 저장하고 한 번에 바꿀 수 있습니다.
            스킬 전용 프리셋과 아레나 전투 템플릿은 별도로 유지됩니다.
          </p>
        }
      />

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
        <CombatLoadoutPresetList
          presets={presets}
          activeSlot={activeSlot}
          busySlot={busySlot}
          draftName={draftName}
          onDraftNameChange={setDraftName}
          onSave={() => void save()}
          onApply={(slot) => void apply(slot)}
          onDelete={(slot) => void remove(slot)}
          onOverwrite={(slot) => void overwrite(slot)}
        />
      )}
    </main>
  );
}
