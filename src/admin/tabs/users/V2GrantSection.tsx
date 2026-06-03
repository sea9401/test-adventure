"use client";

import { useMemo, useState } from "react";
import { Button, Field, NumberInput } from "../../ui/Field";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import type { V2GrantPayload } from "./types";

const SELECT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// v2 전용 지급 — /api/admin/v2-grant. 재료(character.v2.materials)·장비(equipment.v2)·
// 충전약(inventory.v2)·숙련도(proficiency.v2). 골드/EXP/레벨은 위 캐릭터 패널에서 편집.
export function V2GrantSection({
  readOnly,
  onGrant,
}: {
  readOnly: boolean;
  onGrant: (payload: V2GrantPayload) => void | Promise<void>;
}) {
  const materialOptions = useMemo(
    () => Object.values(V2_MATERIALS).map((m) => ({ id: m.id, name: m.name })),
    [],
  );
  const equipOptions = useMemo(
    () =>
      Object.values(V2_EQUIPMENT)
        .map((e) => ({ id: e.id, name: e.name, tier: e.tier, slot: e.slot }))
        .sort((a, b) => a.tier - b.tier || a.slot.localeCompare(b.slot)),
    [],
  );

  const [materialId, setMaterialId] = useState<string>(
    materialOptions[0]?.id ?? "",
  );
  const [materialQty, setMaterialQty] = useState(1);
  const [equipId, setEquipId] = useState<string>(equipOptions[0]?.id ?? "");
  const [hp, setHp] = useState(0);
  const [mp, setMp] = useState(0);
  const [prof, setProf] = useState(0);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">v2 지급</h2>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        v2 재료·장비·충전약·숙련도. 골드·EXP·레벨은 위 캐릭터 패널에서 편집합니다.
        대상 유저는 새로고침해야 반영됩니다.
      </p>

      {/* 재료 (character.v2.materials) */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_110px_auto]">
        <Field label="v2 재료">
          <select
            value={materialId}
            disabled={readOnly || materialOptions.length === 0}
            onChange={(e) => setMaterialId(e.target.value)}
            className={SELECT_CLS}
          >
            {materialOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="수량">
          <NumberInput
            value={materialQty}
            disabled={readOnly}
            onChange={(n) => setMaterialQty(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Button
          disabled={readOnly || !materialId || materialQty <= 0}
          onClick={() => onGrant({ materials: { [materialId]: materialQty } })}
        >
          +{materialQty} 지급
        </Button>
      </div>

      {/* 장비 (equipment.v2.owned) */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_auto]">
        <Field label="v2 장비 (보유 추가)">
          <select
            value={equipId}
            disabled={readOnly || equipOptions.length === 0}
            onChange={(e) => setEquipId(e.target.value)}
            className={SELECT_CLS}
          >
            {equipOptions.map((o) => (
              <option key={o.id} value={o.id}>
                T{o.tier} · {o.slot} · {o.name} ({o.id})
              </option>
            ))}
          </select>
        </Field>
        <Button
          disabled={readOnly || !equipId}
          onClick={() => onGrant({ equipmentId: equipId })}
        >
          장비 지급
        </Button>
      </div>

      {/* 충전약 + 숙련도 */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="HP 충전약">
          <NumberInput
            value={hp}
            disabled={readOnly}
            onChange={(n) => setHp(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Field label="MP 충전약">
          <NumberInput
            value={mp}
            disabled={readOnly}
            onChange={(n) => setMp(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Field label="숙련도(현 직업군)">
          <NumberInput
            value={prof}
            disabled={readOnly}
            onChange={(n) => setProf(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Button
          disabled={readOnly || (hp === 0 && mp === 0 && prof === 0)}
          onClick={() =>
            onGrant({
              hpCharges: hp || undefined,
              mpCharges: mp || undefined,
              proficiency: prof || undefined,
            })
          }
        >
          지급
        </Button>
      </div>
    </section>
  );
}
