"use client";

import { useMemo, useState } from "react";
import { Button, Field, NumberInput } from "./Field";
import type {
  CatalogOption,
  CatalogOptionGroup,
} from "../adminCatalogOptions";

const SELECT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export type AttachmentEntry = { id: string; count: number };

// 우편 첨부 한 종류(재료/장비/소비템)의 [선택 + 수량 + 추가] 행과 chip 목록 —
// BroadcastTab 에서 세 벌 복붙이던 블록의 공용화. 같은 id 추가는 수량 합산.
// 선택/수량은 내부 상태, 확정된 목록(entries)만 부모가 소유한다.
export function AttachmentPicker({
  label,
  options,
  groups,
  entries,
  onChange,
  disabled,
}: {
  label: string;
  options?: CatalogOption[];
  groups?: CatalogOptionGroup[];
  entries: AttachmentEntry[];
  onChange: (next: AttachmentEntry[]) => void;
  disabled: boolean;
}) {
  const normalizedGroups = useMemo(
    () =>
      groups?.filter((group) => group.options.length > 0) ?? [
        { id: "all", label, options: options ?? [] },
      ],
    [groups, label, options],
  );
  const [groupId, setGroupId] = useState(normalizedGroups[0]?.id ?? "");
  const selectedGroup =
    normalizedGroups.find((group) => group.id === groupId) ??
    normalizedGroups[0];
  const selectedOptions = selectedGroup?.options ?? [];
  const [sel, setSel] = useState<string>(selectedOptions[0]?.id ?? "");
  const selectedId = selectedOptions.some((option) => option.id === sel)
    ? sel
    : (selectedOptions[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const allOptions = normalizedGroups.flatMap((group) => group.options);
  const nameById = new Map(allOptions.map((o) => [o.id, o.name]));

  const add = () => {
    if (!selectedId || qty <= 0) return;
    const i = entries.findIndex((e) => e.id === selectedId);
    if (i >= 0) {
      const next = [...entries];
      next[i] = { id: selectedId, count: next[i].count + qty };
      onChange(next);
    } else {
      onChange([...entries, { id: selectedId, count: qty }]);
    }
  };

  return (
    <>
      <div
        className={`mt-3 grid items-end gap-3 ${
          groups
            ? "md:grid-cols-[180px_1fr_110px_auto]"
            : "md:grid-cols-[1fr_110px_auto]"
        }`}
      >
        {groups ? (
          <Field label="분류">
            <select
              value={selectedGroup?.id ?? ""}
              disabled={disabled || normalizedGroups.length === 0}
              onChange={(event) => {
                const nextGroup = normalizedGroups.find(
                  (group) => group.id === event.target.value,
                );
                setGroupId(event.target.value);
                setSel(nextGroup?.options[0]?.id ?? "");
              }}
              className={SELECT_CLS}
            >
              {normalizedGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={label}>
          <select
            value={selectedId}
            disabled={disabled || selectedOptions.length === 0}
            onChange={(e) => setSel(e.target.value)}
            className={SELECT_CLS}
          >
            {selectedOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="수량">
          <NumberInput
            value={qty}
            min={1}
            disabled={disabled}
            onChange={(n) => setQty(Math.max(1, Math.floor(n)))}
          />
        </Field>
        <Button disabled={disabled || !selectedId || qty <= 0} onClick={add}>
          + 추가
        </Button>
      </div>
      {entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {entries.map((e, i) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {nameById.get(e.id) ?? e.id} ×{e.count}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                className="ml-0.5 text-zinc-400 hover:text-red-500 disabled:opacity-50"
                aria-label="제거"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
