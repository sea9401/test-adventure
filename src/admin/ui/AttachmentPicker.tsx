"use client";

import { useState } from "react";
import { Button, Field, NumberInput } from "./Field";
import type { CatalogOption } from "../adminCatalogOptions";

const SELECT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export type AttachmentEntry = { id: string; count: number };

// 우편 첨부 한 종류(재료/장비/소비템)의 [선택 + 수량 + 추가] 행과 chip 목록 —
// BroadcastTab 에서 세 벌 복붙이던 블록의 공용화. 같은 id 추가는 수량 합산.
// 선택/수량은 내부 상태, 확정된 목록(entries)만 부모가 소유한다.
export function AttachmentPicker({
  label,
  options,
  entries,
  onChange,
  disabled,
}: {
  label: string;
  options: CatalogOption[];
  entries: AttachmentEntry[];
  onChange: (next: AttachmentEntry[]) => void;
  disabled: boolean;
}) {
  const [sel, setSel] = useState<string>(options[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const nameById = new Map(options.map((o) => [o.id, o.name]));

  const add = () => {
    if (!sel || qty <= 0) return;
    const i = entries.findIndex((e) => e.id === sel);
    if (i >= 0) {
      const next = [...entries];
      next[i] = { id: sel, count: next[i].count + qty };
      onChange(next);
    } else {
      onChange([...entries, { id: sel, count: qty }]);
    }
  };

  return (
    <>
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_110px_auto]">
        <Field label={label}>
          <select
            value={sel}
            disabled={disabled || options.length === 0}
            onChange={(e) => setSel(e.target.value)}
            className={SELECT_CLS}
          >
            {options.map((o) => (
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
        <Button disabled={disabled || !sel || qty <= 0} onClick={add}>
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
