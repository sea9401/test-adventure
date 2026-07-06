"use client";

import { useMemo, useState } from "react";
import { Button, Field, NumberInput } from "../../ui/Field";
import {
  v2EquipmentOptions,
  v2MaterialOptions,
} from "../../adminCatalogOptions";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import type { V2GrantPayload } from "./types";

const SELECT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// v2 전용 지급 — /api/admin/v2-grant. 재료(character.v2.materials)·장비(equipment.v2)·
// 충전약(inventory.v2)·숙련도(proficiency.v2)·레어맵(character.v2.rareMaps)·
// 낚시/발굴 코인(fishing/treasure-wallet.v1). 골드/EXP/레벨은 위 캐릭터 패널에서 편집.
export function V2GrantSection({
  readOnly,
  onGrant,
}: {
  readOnly: boolean;
  onGrant: (payload: V2GrantPayload) => void | Promise<void>;
}) {
  // 카탈로그 옵션 — BroadcastTab 과 공용(adminCatalogOptions).
  const materialOptions = useMemo(() => v2MaterialOptions(), []);
  const equipOptions = useMemo(() => v2EquipmentOptions(), []);

  const [materialId, setMaterialId] = useState<string>(
    materialOptions[0]?.id ?? "",
  );
  const [materialQty, setMaterialQty] = useState(1);
  const [equipId, setEquipId] = useState<string>(equipOptions[0]?.id ?? "");
  const rareMapOptions = useMemo(
    () => Object.values(RARE_MAP_KINDS).map((k) => ({ id: k.id, name: k.name })),
    [],
  );
  const [rareMapKind, setRareMapKind] = useState<string>(
    rareMapOptions[0]?.id ?? "",
  );
  const [rareMapDepth, setRareMapDepth] = useState(1);
  const [fishCoins, setFishCoins] = useState(0);
  const [digCoins, setDigCoins] = useState(0);
  const [hp, setHp] = useState(0);
  const [mp, setMp] = useState(0);
  const [prof, setProf] = useState(0);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">아이템·자원 지급</h2>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        재료·장비·충전약·숙련도. 골드·EXP·레벨은 위 캐릭터 패널에서 편집합니다.
        대상 유저는 새로고침해야 반영됩니다.
      </p>

      {/* 재료 (character.v2.materials) */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_110px_auto]">
        <Field label="재료">
          <select
            value={materialId}
            disabled={readOnly || materialOptions.length === 0}
            onChange={(e) => setMaterialId(e.target.value)}
            className={SELECT_CLS}
          >
            {materialOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
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
        <Field label="장비 (보유 추가)">
          <select
            value={equipId}
            disabled={readOnly || equipOptions.length === 0}
            onChange={(e) => setEquipId(e.target.value)}
            className={SELECT_CLS}
          >
            {equipOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
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

      {/* 레어맵 (character.v2.rareMaps) — 종류 + 발견 깊이 */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_110px_auto]">
        <Field label="레어맵">
          <select
            value={rareMapKind}
            disabled={readOnly || rareMapOptions.length === 0}
            onChange={(e) => setRareMapKind(e.target.value)}
            className={SELECT_CLS}
          >
            {rareMapOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="깊이">
          <NumberInput
            value={rareMapDepth}
            disabled={readOnly}
            onChange={(n) => setRareMapDepth(Math.max(1, Math.floor(n)))}
          />
        </Field>
        <Button
          disabled={readOnly || !rareMapKind || rareMapDepth < 1}
          onClick={() =>
            onGrant({ rareMap: { kind: rareMapKind, depth: rareMapDepth } })
          }
        >
          지도 지급
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

      {/* 사이드 화폐 — 낚시 코인(fishing-wallet.v1) + 발굴 코인(treasure-wallet.v1) */}
      <div className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Field label="낚시 코인">
          <NumberInput
            value={fishCoins}
            disabled={readOnly}
            onChange={(n) => setFishCoins(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Field label="발굴 코인">
          <NumberInput
            value={digCoins}
            disabled={readOnly}
            onChange={(n) => setDigCoins(Math.max(0, Math.floor(n)))}
          />
        </Field>
        <Button
          disabled={readOnly || (fishCoins === 0 && digCoins === 0)}
          onClick={() =>
            onGrant({
              fishingCoins: fishCoins || undefined,
              treasureCoins: digCoins || undefined,
            })
          }
        >
          코인 지급
        </Button>
      </div>

      {/* 스태미나 (character.v2.stamina) — 최대치로 회복 */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          스태미나를 최대치로 회복합니다.
        </p>
        <Button
          disabled={readOnly}
          onClick={() => onGrant({ refillStamina: true })}
        >
          스태미나 가득 채우기
        </Button>
      </div>
    </section>
  );
}
