"use client";

import { useCallback, useEffect, useState } from "react";
import { Diamond, Shield, Sword, type Icon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { V2CharacterCard } from "./V2CharacterCard";
import type { StatKey } from "@/adventure/data/stats";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// v2 캐릭터 화면 — V2CharacterCard 위에 장비 3슬롯 + StatsPanel + 인벤/스킬 진입.

type StateResponse = {
  ok?: boolean;
  character?: {
    name: string;
    gender?: string;
    level: number;
    exp: number;
    expToNext: number | null;
    hp: number;
    maxHp: number;
    gold: number;
  };
  guild?: { name: string };
  stats?: {
    base: Record<StatKey, number>;
    total: Record<StatKey, number>;
  } | null;
  combat?: { atk: number; def: number; spd: number } | null;
};

type EquipmentResponse = {
  ok?: boolean;
  equipped?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
};

const SLOTS: { slot: V2EquipSlot; label: string; Icon: Icon; color: string }[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "방어구", Icon: Shield, color: "text-sky-500" },
  {
    slot: "accessory",
    label: "장신구",
    Icon: Diamond,
    color: "text-violet-500",
  },
];

export function V2CharacterScreen({
  onOpenEquipment,
  onOpenInventory,
  onOpenSkills,
}: {
  onOpenEquipment?: () => void;
  onOpenInventory?: () => void;
  onOpenSkills?: () => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/state").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/equipment").then((r) => (r.ok ? r.json() : null)),
      ]);
      setState(stateRes as StateResponse | null);
      setEquipment(equipRes as EquipmentResponse | null);
    } catch {
      setState({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const character = state?.character;
  const guild = state?.guild;
  const stats = state?.stats;
  const combat = state?.combat;
  const equipped = equipment?.equipped ?? {};

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">내 정보</h1>
      </header>

      {character ? (
        <>
          <V2CharacterCard character={character} guild={guild} />

          {/* 장비 3슬롯 — 클릭 시 V2EquipmentView 진입. */}
          <Card padding="md">
            <div className="grid grid-cols-3 gap-2">
              {SLOTS.map(({ slot, label, Icon, color }) => {
                const id = equipped[slot];
                const item = id ? V2_EQUIPMENT[id] : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={onOpenEquipment}
                    disabled={!onOpenEquipment}
                    className="flex flex-col items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2.5 text-center transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
                  >
                    <Icon size={20} weight="duotone" className={color} />
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {label}
                    </div>
                    <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {item?.name ?? "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      ) : loading ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <div className="text-sm text-rose-600 dark:text-rose-400">
            캐릭터 정보를 불러오지 못했어요.
          </div>
        </Card>
      )}

      {stats && combat && (
        <Card padding="md">
          <StatsPanel stats={stats.base} totalStats={stats.total} combat={combat} />
        </Card>
      )}

      {/* 캐릭터 탭 내 sub 진입 — 인벤/스킬. 장비는 위의 슬롯 클릭. */}
      {(onOpenInventory || onOpenSkills) && (
        <div className="grid grid-cols-2 gap-2">
          {onOpenInventory && (
            <button
              type="button"
              onClick={onOpenInventory}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              인벤토리
            </button>
          )}
          {onOpenSkills && (
            <button
              type="button"
              onClick={onOpenSkills}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              스킬
            </button>
          )}
        </div>
      )}

      {character && stats == null && !loading && (
        <Card padding="md">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            능력치 정보가 아직 만들어지지 않았어요. 사냥을 한 번 시도하면 자동 생성됩니다.
          </div>
        </Card>
      )}
    </main>
  );
}
